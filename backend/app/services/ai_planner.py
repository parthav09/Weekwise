"""Gemini-backed planner for Phase 6.

Same input / output contract as the rule-based planner in
:mod:`app.services.planner`. The route layer wraps this in a try/except and
falls back to the rule planner if anything goes wrong, so this module is free
to raise :class:`AiPlannerError` whenever Gemini misbehaves.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timezone
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.availability_block import AvailabilityBlockType, LifeBlockCategory
from app.schemas.plan import PlanRead
from app.services.planner import (
    PlanningContext,
    ensure_aware,
    load_planning_context,
)


logger = logging.getLogger(__name__)


class AiPlannerError(RuntimeError):
    """Raised when the AI planner can't produce a usable plan."""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def generate_ai_plan(
    db: Session,
    *,
    user_id: int,
    start_at: datetime,
    end_at: datetime,
    day_window: tuple[time, time] = (time(8), time(22)),
) -> PlanRead:
    if not settings.gemini_api_key:
        raise AiPlannerError("no GEMINI_API_KEY configured")

    context = load_planning_context(
        db,
        user_id=user_id,
        start_at=start_at,
        end_at=end_at,
        day_window=day_window,
    )

    payload = _build_payload(context)
    raw = _call_gemini(payload)
    return _parse_response(raw, context)


# ---------------------------------------------------------------------------
# Prompt + payload
# ---------------------------------------------------------------------------


_SYSTEM_PROMPT = """You are a personal planner. Build a realistic, calm schedule for the user
across the requested window using the structured input provided.

Hard constraints (never violate):
- Do NOT place any block during a life block whose block_type is "blocked".
- Do NOT place any task or habit during an external_busy_blocks window.
- Place tasks with schedule_flexibility "fixed" exactly at their due_date.
- Do NOT schedule a habit on any date listed in its completed_dates_in_window.
- Keep all task and habit blocks inside the day_start..day_end window.
- Use the task's estimated_minutes (default 30 if null) as the block length.
- Habits use their estimated_minutes (default 30 if null).
- Do not double-book; blocks within a day must not overlap.

Soft preferences:
- Urgent and high-priority tasks earlier; tasks with closer due dates earlier.
- energy_level "high" tasks earlier in the day; "low" tasks afternoon/evening.
- Spread each habit across the window up to (target_count_per_week - already_done) times.
- Treat block_type "recovery" as a soft buffer; only place a habit there if nothing else fits.
- Leave a small buffer (a few minutes) between back-to-back blocks.

Output:
- Return ONLY JSON matching the provided schema. No prose, no markdown, no comments.
- Use ISO 8601 datetimes (with timezone offset) for start/end, matching the input timezone.
- One PlanDay per date inside the window, in chronological order. days may be empty if nothing fits.
- For each block: include type ("task" / "habit" / "life"), title, source_id (the task/habit/life-block id) when applicable, and a small metadata dict.
- Include "life" blocks for every life-block occurrence you respected, copying its title and times.
- Do not include external_busy_blocks in the output; they are read-only availability context.
- Use the notes array for short warnings like 'no time for X'.
"""


def _build_payload(ctx: PlanningContext) -> dict[str, Any]:
    completed_by_habit: dict[int, list[str]] = {}
    for completion in ctx.completions:
        completed_by_habit.setdefault(completion.habit_id, []).append(
            completion.completed_on.isoformat()
        )

    tasks_payload = []
    for t in ctx.tasks:
        tasks_payload.append(
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "priority": t.priority.value,
                "status": t.status.value,
                "due_date": ensure_aware(t.due_date).isoformat() if t.due_date else None,
                "estimated_minutes": t.estimated_minutes,
                "energy_level": t.energy_level.value,
                "category": t.category.value,
                "schedule_flexibility": t.schedule_flexibility.value,
            }
        )

    habits_payload = []
    for h in ctx.habits:
        habits_payload.append(
            {
                "id": h.id,
                "title": h.title,
                "target_count_per_week": h.target_count_per_week,
                "estimated_minutes": h.estimated_minutes,
                "preferred_time_of_day": h.preferred_time_of_day,
                "completed_dates_in_window": completed_by_habit.get(h.id, []),
            }
        )

    life_payload = []
    for occ in ctx.life_occurrences:
        block_type = occ.block.block_type
        category = occ.block.category
        life_payload.append(
            {
                "id": occ.block.id,
                "title": occ.block.title,
                "block_type": block_type.value
                if isinstance(block_type, AvailabilityBlockType)
                else str(block_type),
                "category": category.value
                if isinstance(category, LifeBlockCategory)
                else str(category),
                "start": occ.start.isoformat(),
                "end": occ.end.isoformat(),
            }
        )

    return {
        "window": {
            "start_at": ctx.start_at.isoformat(),
            "end_at": ctx.end_at.isoformat(),
            "day_start": ctx.day_start.strftime("%H:%M"),
            "day_end": ctx.day_end.strftime("%H:%M"),
            "timezone_offset_minutes": int(
                (ctx.start_at.utcoffset() or _zero_offset()).total_seconds() // 60
            ),
        },
        "dates": [d.isoformat() for d in ctx.days],
        "tasks": tasks_payload,
        "habits": habits_payload,
        "life_blocks_expanded": life_payload,
        "external_busy_blocks": [
            {
                "id": block.id,
                "title": block.title,
                "source": block.source,
                "start": ensure_aware(block.start).isoformat(),
                "end": ensure_aware(block.end).isoformat(),
                "metadata": block.metadata,
            }
            for block in ctx.external_busy_blocks
        ],
    }


def _zero_offset():
    from datetime import timedelta

    return timedelta(0)


# ---------------------------------------------------------------------------
# Gemini call
# ---------------------------------------------------------------------------


def _call_gemini(payload: dict[str, Any]) -> str:
    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types
    except Exception as exc:  # noqa: BLE001
        raise AiPlannerError(f"google-genai not installed: {exc}") from exc

    schema = _plan_response_schema(types)

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.ai_planner_model,
            contents=[
                _SYSTEM_PROMPT,
                "Planning input:\n" + json.dumps(payload, ensure_ascii=False),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.2,
            ),
        )
    except genai_errors.APIError as exc:
        raise AiPlannerError(f"gemini api error: {exc.code}") from exc
    except Exception as exc:  # noqa: BLE001
        raise AiPlannerError(f"gemini call failed: {type(exc).__name__}") from exc

    text = (response.text or "").strip()
    if not text:
        raise AiPlannerError("gemini returned an empty response")
    return text


def _plan_response_schema(types_mod):  # type: ignore[no-untyped-def]
    Type = types_mod.Type
    Schema = types_mod.Schema

    block_schema = Schema(
        type=Type.OBJECT,
        properties={
            "start": Schema(type=Type.STRING, description="ISO 8601 datetime"),
            "end": Schema(type=Type.STRING, description="ISO 8601 datetime"),
            "type": Schema(
                type=Type.STRING,
                enum=["task", "habit", "life"],
            ),
            "title": Schema(type=Type.STRING),
            "source_id": Schema(type=Type.INTEGER, nullable=True),
        },
        required=["start", "end", "type", "title"],
    )

    day_schema = Schema(
        type=Type.OBJECT,
        properties={
            "date": Schema(type=Type.STRING, description="ISO date YYYY-MM-DD"),
            "blocks": Schema(type=Type.ARRAY, items=block_schema),
        },
        required=["date", "blocks"],
    )

    return Schema(
        type=Type.OBJECT,
        properties={
            "days": Schema(type=Type.ARRAY, items=day_schema),
            "notes": Schema(type=Type.ARRAY, items=Schema(type=Type.STRING)),
        },
        required=["days"],
    )


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


def _parse_response(raw: str, ctx: PlanningContext) -> PlanRead:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AiPlannerError(f"invalid JSON from gemini: {exc.msg}") from exc

    if not isinstance(data, dict) or "days" not in data:
        raise AiPlannerError("gemini response missing 'days'")

    plan_dict = {
        "generated_at": datetime.now(timezone.utc),
        "generator": "ai",
        "start_at": ctx.start_at,
        "end_at": ctx.end_at,
        "days": _coerce_days(data.get("days", []), ctx),
        "notes": [str(n) for n in data.get("notes") or [] if n],
    }

    try:
        plan = PlanRead.model_validate(plan_dict)
    except ValidationError as exc:
        raise AiPlannerError(f"plan failed validation: {exc.error_count()} issues") from exc

    if not plan.days:
        raise AiPlannerError("gemini returned an empty plan")
    _raise_if_external_busy_conflict(plan, ctx)
    return plan


def _coerce_days(raw_days: list[Any], ctx: PlanningContext) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for day in raw_days:
        if not isinstance(day, dict):
            continue
        date_str = day.get("date")
        try:
            day_date = date.fromisoformat(date_str) if isinstance(date_str, str) else None
        except ValueError:
            day_date = None
        if day_date is None:
            continue
        blocks = []
        for block in day.get("blocks") or []:
            if not isinstance(block, dict):
                continue
            try:
                start_dt = ensure_aware(datetime.fromisoformat(block["start"]))
                end_dt = ensure_aware(datetime.fromisoformat(block["end"]))
            except (KeyError, TypeError, ValueError):
                continue
            block_type = block.get("type")
            if block_type not in {"task", "habit", "life"}:
                continue
            blocks.append(
                {
                    "start": start_dt,
                    "end": end_dt,
                    "type": block_type,
                    "title": str(block.get("title") or "").strip() or "Untitled",
                    "source_id": block.get("source_id"),
                    "metadata": block.get("metadata") or {},
                }
            )
        blocks.sort(key=lambda b: b["start"])
        out.append({"date": day_date, "blocks": blocks})
    return out


def _raise_if_external_busy_conflict(plan: PlanRead, ctx: PlanningContext) -> None:
    busy = [
        (ensure_aware(block.start), ensure_aware(block.end), block.title)
        for block in ctx.external_busy_blocks
    ]
    if not busy:
        return
    for day in plan.days:
        for block in day.blocks:
            if block.type not in {"task", "habit"}:
                continue
            block_start = ensure_aware(block.start)
            block_end = ensure_aware(block.end)
            for busy_start, busy_end, busy_title in busy:
                if block_start < busy_end and block_end > busy_start:
                    raise AiPlannerError(
                        f"gemini scheduled {block.title!r} during calendar event {busy_title!r}"
                    )
