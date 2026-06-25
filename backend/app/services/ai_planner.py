"""Gemini-backed planner for Phase 6.

Same input / output contract as the rule-based planner in
:mod:`app.services.planner`. The route layer wraps this in a try/except and
falls back to the rule planner if anything goes wrong, so this module is free
to raise :class:`AiPlannerError` whenever Gemini misbehaves.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.availability_block import AvailabilityBlockType, LifeBlockCategory
from app.schemas.plan import PlanRead
from app.services.pantry import get_pantry
from app.services.planner import (
    PlanningContext,
    effective_planning_start,
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

    return generate_ai_plan_from_context(db, context)


def generate_ai_plan_from_context(db: Session, context: PlanningContext) -> PlanRead:
    if not settings.gemini_api_key:
        raise AiPlannerError("no GEMINI_API_KEY configured")

    payload = _build_payload(db, context)
    raw = _call_gemini(payload)
    return _parse_response(raw, context)


# ---------------------------------------------------------------------------
# Prompt + payload
# ---------------------------------------------------------------------------


_SYSTEM_PROMPT = """You are an evidence-informed personal planner. Build a realistic, calm weekly
schedule for the user across the requested window using the structured input provided.

Hard constraints (never violate):
- Do NOT place any block during a life block whose block_type is "blocked".
- Do NOT place any task, habit, or meal during an external_busy_blocks window.
- Ignore the clock time on every task due_date. Treat task due_date only as a deadline/day preference, never as the block start time.
- Even if schedule_flexibility is "fixed", choose a sensible open slot for the task based on priority, energy, workload, habits, meals, and availability.
- If a task has no due_date, still schedule it in a sensible open slot using estimated_minutes/default duration.
- Do NOT schedule a habit on any date listed in its completed_dates_in_window.
- Do NOT schedule tasks, habits, or meals before window.start_at, even when the requested week contains earlier dates.
- Keep all task, habit, and meal blocks inside the day_start..day_end window.
- Use the task's estimated_minutes (default 30 if null) as the block length.
- Habits use their estimated_minutes (default 30 if null).
- Do not double-book; blocks within a day must not overlap.
- Meals should be realistic eating windows, not overlapping task/habit/life/calendar blocks.

Evidence-informed scheduling preferences:
- Urgent and high-priority tasks earlier; tasks with closer due dates earlier.
- Put high-energy/deep-work tasks in the morning or early afternoon when possible.
- Put low-energy/admin tasks later in the day when useful.
- Spread each habit across the window up to (target_count_per_week - already_done) times.
- Respect each habit's preferred_time_of_day when available, but avoid cramming.
- Build days around normal human anchors: morning routine/training, breakfast, focused work or school, lunch, afternoon tasks, dinner, then lighter evening work or recovery.
- Place workouts away from heavy meals when possible; allow at least 60-90 minutes after larger meals.
- Place protein-forward meals/snacks after training or demanding habit blocks when useful.
- Keep meals roughly 3-5 hours apart during waking hours; avoid scheduling dinner too close to sleep.
- Prefer lighter tasks or recovery after meals and late evening.
- Treat block_type "recovery" as a soft buffer; only place a habit there if nothing else fits.
- Leave small buffers between back-to-back blocks, and larger buffers around meals/workouts when possible.
- Use pantry items when useful, but do not force awkward meal combinations.

Meal generation requirements:
- Meals are first-class planned blocks. Do not omit them just because they are not in the task or habit lists.
- For each date with a normal day_start..day_end window, include 2-3 meal blocks unless there is genuinely no available time.
- Prefer breakfast or brunch around 8:00-10:00, lunch around 12:00-14:00, and dinner around 18:00-20:00.
- Meal blocks should usually be 20-45 minutes. Use a snack only when a full meal does not fit or when training recovery makes it useful.
- Do not count a habit named "Cook" or similar as the meal itself; still create a meal block with a specific dish title.
- Meal titles must be concrete dishes, not generic labels like "Breakfast", "Lunch", "Dinner", "Meal", or "Cook".
- Every substantial meal should include a meaningful non-beef protein and enough carbs/fiber to make the day feel realistic.
- If a date has fewer than 2 meal blocks, add a note explaining which meal could not fit and why.

Task and habit coverage requirements:
- Every task in tasks should appear as a task block unless there is genuinely no room.
- Do not omit tasks simply because due_date is null or only an approximate deadline.
- For any omitted task, add a notes entry that names the task and says why it could not fit.
- For each habit with remaining weekly target, schedule at least one habit block unless there is genuinely no room.
- For any omitted habit, add a notes entry that names the habit and says why it could not fit.

Output:
- Return ONLY JSON matching the provided schema. No prose, no markdown, no comments.
- Use ISO 8601 datetimes (with timezone offset) for start/end, matching the input timezone.
- One PlanDay per date inside the window, in chronological order. days may be empty if nothing fits.
- For each block: include type ("task" / "habit" / "life" / "meal"), title, and source_id (the task/habit/life-block id) when applicable.
- Include "life" blocks for every life-block occurrence you respected, copying its title and times.
- Do not include external_busy_blocks in the output; they are read-only availability context.
- Use the notes array for short warnings like 'no time for X'.
- For meal blocks, source_id must be null. Include meal_type, a short science_rationale, 3-8 ingredients, and concise prep notes.
- For meal ingredients, set on_hand=true when the item appears to be available in meal_planning.pantry and on_hand=false for buy-needed items.
"""


def _build_payload(db: Session, ctx: PlanningContext) -> dict[str, Any]:
    scheduling_start_at = effective_planning_start(ctx.start_at, ctx.end_at)
    active_dates = [d for d in ctx.days if d >= scheduling_start_at.date()]

    completed_by_habit: dict[int, list[str]] = {}
    for completion in ctx.completions:
        completed_by_habit.setdefault(completion.habit_id, []).append(
            completion.completed_on.isoformat()
        )

    tasks_payload = []
    for t in sorted(ctx.tasks, key=lambda task: _task_relevance_key(task, ctx.start_at))[
        : settings.ai_planner_max_tasks
    ]:
        due_date = ensure_aware(t.due_date) if t.due_date else None
        tasks_payload.append(
            {
                "id": t.id,
                "title": _clip(t.title, 140),
                "description": _clip(t.description, 240),
                "priority": t.priority.value,
                "status": t.status.value,
                "due_date": due_date.date().isoformat() if due_date else None,
                "ignore_due_time": True,
                "estimated_minutes": t.estimated_minutes,
                "energy_level": t.energy_level.value,
                "category": t.category.value,
                "schedule_flexibility": t.schedule_flexibility.value,
            }
        )

    habits_payload = []
    for h in ctx.habits[: settings.ai_planner_max_habits]:
        habits_payload.append(
            {
                "id": h.id,
                "title": _clip(h.title, 140),
                "target_count_per_week": h.target_count_per_week,
                "estimated_minutes": h.estimated_minutes,
                "preferred_time_of_day": h.preferred_time_of_day,
                "completed_dates_in_window": completed_by_habit.get(h.id, []),
            }
        )

    life_payload = []
    for occ in ctx.life_occurrences:
        if ensure_aware(occ.end) <= scheduling_start_at:
            continue
        if occ.start.date() not in active_dates:
            continue
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
            "start_at": scheduling_start_at.isoformat(),
            "requested_start_at": ctx.start_at.isoformat(),
            "end_at": ctx.end_at.isoformat(),
            "day_start": ctx.day_start.strftime("%H:%M"),
            "day_end": ctx.day_end.strftime("%H:%M"),
            "timezone_offset_minutes": int(
                (ctx.start_at.utcoffset() or _zero_offset()).total_seconds() // 60
            ),
        },
        "dates": [d.isoformat() for d in active_dates],
        "tasks": tasks_payload,
        "habits": habits_payload,
        "life_blocks_expanded": life_payload,
        "external_busy_blocks": [
            {
                "id": block.id,
                "title": _clip(block.title, 160),
                "source": block.source,
                "start": ensure_aware(block.start).isoformat(),
                "end": ensure_aware(block.end).isoformat(),
            }
            for block in ctx.external_busy_blocks
            if ensure_aware(block.end) > scheduling_start_at
        ],
        "meal_planning": _meal_planning_payload(db, ctx),
    }


def _task_relevance_key(task: Any, now: datetime) -> tuple[int, int, float, int]:
    priority_rank = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
    due_ts = float("inf")
    if getattr(task, "due_date", None):
        due = ensure_aware(task.due_date)
        due_ts = datetime.combine(due.date(), time.max, tzinfo=due.tzinfo).timestamp()
    priority = priority_rank.get(getattr(task.priority, "value", str(task.priority)), 4)
    overdue = 0 if due_ts < now.timestamp() else 1
    return (overdue, priority, due_ts, getattr(task, "id", 0))


def _clip(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _zero_offset():
    from datetime import timedelta

    return timedelta(0)


def _meal_planning_payload(db: Session, ctx: PlanningContext) -> dict[str, Any]:
    pantry = get_pantry(db, user_id=ctx.user_id)
    pantry_items = pantry.items[: settings.ai_planner_max_pantry_items]
    return {
        "goal": "Protein-forward, nutrient-dense meals that support energy and training recovery.",
        "dietary_restrictions": ["no beef"],
        "allowed_proteins": [
            "chicken",
            "turkey",
            "fish",
            "eggs",
            "dairy",
            "legumes",
            "tofu",
            "other non-beef proteins",
        ],
        "pantry": [
            {
                "name": _clip(item.name, 120),
                "quantity": item.quantity,
                "unit": item.unit,
                "category": item.category.value,
                "last_purchased_at": item.last_purchased_at.isoformat(),
            }
            for item in pantry_items
        ],
    }


# ---------------------------------------------------------------------------
# Gemini call
# ---------------------------------------------------------------------------


def _call_gemini(payload: dict[str, Any]) -> str:
    try:
        from google.genai import errors as genai_errors
        from google.genai import types
    except Exception as exc:  # noqa: BLE001
        raise AiPlannerError(f"google-genai not installed: {exc}") from exc

    if not settings.gemini_api_key:
        raise AiPlannerError("no GEMINI_API_KEY configured")

    schema = _cached_plan_response_schema()

    try:
        client = _gemini_client(settings.gemini_api_key)
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
                max_output_tokens=settings.ai_planner_max_output_tokens,
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


@lru_cache(maxsize=4)
def _gemini_client(api_key: str):  # type: ignore[no-untyped-def]
    from google import genai

    return genai.Client(api_key=api_key)


@lru_cache(maxsize=1)
def _cached_plan_response_schema():  # type: ignore[no-untyped-def]
    from google.genai import types

    return _plan_response_schema(types)


def _plan_response_schema(types_mod):  # type: ignore[no-untyped-def]
    Type = types_mod.Type
    Schema = types_mod.Schema

    ingredient_schema = Schema(
        type=Type.OBJECT,
        properties={
            "name": Schema(type=Type.STRING),
            "quantity": Schema(type=Type.NUMBER, nullable=True),
            "unit": Schema(type=Type.STRING, nullable=True),
            "category": Schema(
                type=Type.STRING,
                enum=[
                    "produce",
                    "dairy",
                    "meat",
                    "pantry",
                    "frozen",
                    "beverages",
                    "household",
                    "other",
                ],
            ),
            "on_hand": Schema(type=Type.BOOLEAN, nullable=True),
            "notes": Schema(type=Type.STRING, nullable=True),
        },
        required=["name"],
    )

    block_schema = Schema(
        type=Type.OBJECT,
        properties={
            "start": Schema(type=Type.STRING, description="ISO 8601 datetime"),
            "end": Schema(type=Type.STRING, description="ISO 8601 datetime"),
            "type": Schema(
                type=Type.STRING,
                enum=["task", "habit", "life", "meal"],
            ),
            "title": Schema(type=Type.STRING),
            "source_id": Schema(type=Type.INTEGER, nullable=True),
            "meal_type": Schema(type=Type.STRING, nullable=True),
            "science_rationale": Schema(type=Type.STRING, nullable=True),
            "ingredients": Schema(type=Type.ARRAY, items=ingredient_schema, nullable=True),
            "notes": Schema(type=Type.STRING, nullable=True),
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
    _raise_if_availability_conflict(plan, ctx)
    _raise_if_missing_meal_coverage(plan, ctx)
    _raise_if_missing_task_or_habit_coverage(plan, ctx)
    return plan


def _coerce_days(raw_days: list[Any], ctx: PlanningContext) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    scheduling_start_at = effective_planning_start(ctx.start_at, ctx.end_at)
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
        if day_date < scheduling_start_at.date():
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
            if end_dt <= scheduling_start_at:
                continue
            if start_dt < scheduling_start_at and block.get("type") != "life":
                continue
            block_type = block.get("type")
            if block_type not in {"task", "habit", "life", "meal"}:
                continue
            metadata = block.get("metadata") or {}
            if not isinstance(metadata, dict):
                metadata = {}
            if block_type == "meal":
                ingredients = _coerce_ingredients(
                    block.get("ingredients") or metadata.get("ingredients") or []
                )
                metadata = {
                    **metadata,
                    "meal_type": str(block.get("meal_type") or "meal"),
                    "science_rationale": str(block.get("science_rationale") or "").strip(),
                    "notes": _clip(str(block.get("notes") or "").strip(), 500),
                }
                if ingredients:
                    metadata["ingredients"] = ingredients
            blocks.append(
                {
                    "start": start_dt,
                    "end": end_dt,
                    "type": block_type,
                    "title": str(block.get("title") or "").strip() or "Untitled",
                    "source_id": block.get("source_id"),
                    "metadata": metadata,
                }
            )
        blocks.sort(key=lambda b: b["start"])
        out.append({"date": day_date, "blocks": blocks})
    return out


def _coerce_ingredients(raw_ingredients: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_ingredients, list):
        return []

    ingredients: list[dict[str, Any]] = []
    for raw in raw_ingredients[:10]:
        if not isinstance(raw, dict):
            continue
        name = _clip(str(raw.get("name") or "").strip(), 120)
        if not name:
            continue
        quantity = raw.get("quantity")
        ingredients.append(
            {
                "name": name,
                "quantity": quantity
                if isinstance(quantity, (int, float)) and not isinstance(quantity, bool)
                else None,
                "unit": _clip(str(raw.get("unit") or "").strip(), 32) or None,
                "category": str(raw.get("category") or "other"),
                "on_hand": bool(raw.get("on_hand")),
                "notes": _clip(str(raw.get("notes") or "").strip(), 160) or None,
            }
        )
    return ingredients


def _raise_if_availability_conflict(plan: PlanRead, ctx: PlanningContext) -> None:
    busy = [
        (ensure_aware(block.start), ensure_aware(block.end), block.title)
        for block in ctx.external_busy_blocks
    ]
    busy.extend(
        (ensure_aware(occ.start), ensure_aware(occ.end), occ.block.title)
        for occ in ctx.life_occurrences
        if _block_type_value(occ.block.block_type) == "blocked"
    )
    if not busy:
        return
    for day in plan.days:
        for block in day.blocks:
            if block.type not in {"task", "habit", "meal"}:
                continue
            block_start = ensure_aware(block.start)
            block_end = ensure_aware(block.end)
            for busy_start, busy_end, busy_title in busy:
                if block_start < busy_end and block_end > busy_start:
                    raise AiPlannerError(
                        f"gemini scheduled {block.title!r} during unavailable time {busy_title!r}"
                    )


def _raise_if_missing_meal_coverage(plan: PlanRead, ctx: PlanningContext) -> None:
    missing_dates: list[str] = []
    for day in plan.days:
        if _clipped_day_window_duration(day.date, ctx) < timedelta(hours=6):
            continue
        meal_count = sum(1 for block in day.blocks if block.type == "meal")
        if meal_count < 2:
            missing_dates.append(day.date.isoformat())
    if missing_dates:
        raise AiPlannerError(
            "gemini omitted meal coverage for " + ", ".join(missing_dates[:4])
        )


def _raise_if_missing_task_or_habit_coverage(plan: PlanRead, ctx: PlanningContext) -> None:
    scheduled_task_ids = {
        block.source_id
        for day in plan.days
        for block in day.blocks
        if block.type == "task" and block.source_id is not None
    }
    scheduled_habit_ids = {
        block.source_id
        for day in plan.days
        for block in day.blocks
        if block.type == "habit" and block.source_id is not None
    }
    note_text = " ".join(plan.notes).lower()

    tasks_to_schedule = sorted(
        ctx.tasks,
        key=lambda task: _task_relevance_key(task, ctx.start_at),
    )[: settings.ai_planner_max_tasks]
    missing_tasks = [
        task.title
        for task in tasks_to_schedule
        if task.id not in scheduled_task_ids and task.title.lower() not in note_text
    ]

    completed_counts: dict[int, int] = {}
    for completion in ctx.completions:
        completed_counts[completion.habit_id] = completed_counts.get(completion.habit_id, 0) + 1
    habits_to_schedule = ctx.habits[: settings.ai_planner_max_habits]
    missing_habits = [
        habit.title
        for habit in habits_to_schedule
        if habit.target_count_per_week > completed_counts.get(habit.id, 0)
        and habit.id not in scheduled_habit_ids
        and habit.title.lower() not in note_text
    ]

    missing = missing_tasks + missing_habits
    if missing:
        raise AiPlannerError("gemini omitted scheduled work for " + ", ".join(missing[:4]))


def _clipped_day_window_duration(day_date: date, ctx: PlanningContext) -> timedelta:
    tz = ctx.start_at.tzinfo
    window_start = datetime.combine(day_date, ctx.day_start, tzinfo=tz)
    window_end = datetime.combine(day_date, ctx.day_end, tzinfo=tz)
    return max(timedelta(0), min(window_end, ctx.end_at) - max(window_start, ctx.start_at))


def _block_type_value(block_type: AvailabilityBlockType | str) -> str:
    return block_type.value if isinstance(block_type, AvailabilityBlockType) else str(block_type)
