from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.availability_block import AvailabilityBlock, LifeBlockCategory
from app.models.generated_plan import GeneratedPlan, GeneratedPlanDay
from app.models.grocery import (
    GroceryItemCategory,
    GroceryItemStatus,
    GroceryList,
    GroceryListItem,
    GroceryListSource,
)
from app.models.habit import Habit
from app.models.task import Task, TaskStatus


class GrocerySuggesterError(RuntimeError):
    pass


def suggest_items_for_list(
    db: Session,
    *,
    grocery_list: GroceryList,
    user_id: int,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    generated_plan_id: int | None = None,
) -> list[GroceryListItem]:
    if not settings.gemini_api_key:
        raise GrocerySuggesterError("GEMINI_API_KEY is not configured")

    start = _ensure_aware(start_at) if start_at else datetime.now(timezone.utc)
    end = _ensure_aware(end_at) if end_at else start + timedelta(days=7)
    if end <= start:
        raise GrocerySuggesterError("end_at must be after start_at")

    payload = _build_payload(
        db,
        user_id=user_id,
        start_at=start,
        end_at=end,
        generated_plan_id=generated_plan_id or grocery_list.generated_plan_id,
    )
    raw = _call_gemini(payload)
    items = _parse_items(raw)
    existing_names = {item.name.strip().lower() for item in grocery_list.items}
    added: list[GroceryListItem] = []

    for item in items:
        normalized = item["name"].strip().lower()
        if normalized in existing_names:
            continue
        grocery_item = GroceryListItem(
            grocery_list_id=grocery_list.id,
            name=item["name"],
            quantity=item.get("quantity"),
            unit=item.get("unit"),
            category=item["category"],
            notes=item.get("notes"),
            status=GroceryItemStatus.needed,
        )
        db.add(grocery_item)
        added.append(grocery_item)
        existing_names.add(normalized)

    if added:
        grocery_list.source = GroceryListSource.ai
        db.add(grocery_list)
        db.flush()
    return added


def _build_payload(
    db: Session,
    *,
    user_id: int,
    start_at: datetime,
    end_at: datetime,
    generated_plan_id: int | None,
) -> dict[str, Any]:
    tasks = list(
        db.scalars(
            select(Task)
            .where(Task.user_id == user_id)
            .where(Task.status != TaskStatus.done)
            .where((Task.due_date.is_(None)) | (Task.due_date.between(start_at, end_at)))
            .order_by(Task.due_date.asc().nullslast(), Task.created_at.desc())
            .limit(50)
        ).all()
    )
    habits = list(
        db.scalars(
            select(Habit).where(Habit.user_id == user_id).order_by(Habit.created_at.desc()).limit(50)
        ).all()
    )
    meal_blocks = list(
        db.scalars(
            select(AvailabilityBlock)
            .where(AvailabilityBlock.user_id == user_id)
            .where(AvailabilityBlock.category == LifeBlockCategory.meal)
            .where(AvailabilityBlock.end_time >= start_at)
            .where(AvailabilityBlock.start_time <= end_at)
            .order_by(AvailabilityBlock.start_time.asc())
            .limit(30)
        ).all()
    )

    plan_payload: dict[str, Any] | None = None
    if generated_plan_id is not None:
        plan = db.scalar(
            select(GeneratedPlan)
            .options(selectinload(GeneratedPlan.days).selectinload(GeneratedPlanDay.items))
            .where(GeneratedPlan.id == generated_plan_id)
            .where(GeneratedPlan.user_id == user_id)
        )
        if plan is not None:
            plan_payload = {
                "id": plan.id,
                "scope": plan.scope.value,
                "start_at": plan.start_at.isoformat(),
                "end_at": plan.end_at.isoformat(),
                "items": [
                    {
                        "title": item.title,
                        "type": item.item_type,
                        "start_at": item.start_at.isoformat(),
                        "end_at": item.end_at.isoformat(),
                    }
                    for item in plan.items[:80]
                ],
            }

    return {
        "window": {"start_at": start_at.isoformat(), "end_at": end_at.isoformat()},
        "tasks": [
            {
                "title": task.title,
                "description": task.description,
                "category": task.category.value,
                "due_date": task.due_date.isoformat() if task.due_date else None,
            }
            for task in tasks
        ],
        "habits": [
            {
                "title": habit.title,
                "target_count_per_week": habit.target_count_per_week,
                "estimated_minutes": habit.estimated_minutes,
                "preferred_time_of_day": habit.preferred_time_of_day,
            }
            for habit in habits
        ],
        "meal_blocks": [
            {
                "title": block.title,
                "start_time": block.start_time.isoformat(),
                "end_time": block.end_time.isoformat(),
                "recurrence_rule": block.recurrence_rule,
            }
            for block in meal_blocks
        ],
        "generated_plan": plan_payload,
    }


_SYSTEM_PROMPT = """You suggest a practical grocery list for a weekly planning app.

Use only the structured context provided. Return JSON only.

Rules:
- Suggest at most 30 grocery items.
- Keep item names simple enough to search on Instacart.
- category must be one of: produce, dairy, meat, pantry, frozen, beverages, household, other.
- quantity should be a positive number or null.
- unit should be short, like ct, lb, oz, gallon, bunch, pack, or null.
- Do not suggest duplicate items.
- Prefer staples implied by meals, fitness habits, errands, school/work weeks, and planned life context.
"""


def _call_gemini(payload: dict[str, Any]) -> str:
    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types
    except Exception as exc:  # noqa: BLE001
        raise GrocerySuggesterError(f"google-genai not installed: {exc}") from exc

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.email_extractor_model or settings.ai_planner_model,
            contents=[
                _SYSTEM_PROMPT,
                "Grocery planning input:\n" + json.dumps(payload, ensure_ascii=False),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_suggestion_response_schema(types),
                temperature=0.2,
            ),
        )
    except genai_errors.APIError as exc:
        raise GrocerySuggesterError(f"gemini api error: {exc.code}") from exc
    except Exception as exc:  # noqa: BLE001
        raise GrocerySuggesterError(f"gemini call failed: {type(exc).__name__}") from exc

    text = (response.text or "").strip()
    if not text:
        raise GrocerySuggesterError("gemini returned an empty response")
    return text


def _suggestion_response_schema(types_mod):  # type: ignore[no-untyped-def]
    Type = types_mod.Type
    Schema = types_mod.Schema

    item_schema = Schema(
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
            "notes": Schema(type=Type.STRING, nullable=True),
        },
        required=["name", "category"],
    )
    return Schema(
        type=Type.OBJECT,
        properties={"items": Schema(type=Type.ARRAY, items=item_schema)},
        required=["items"],
    )


def _parse_items(raw: str) -> list[dict[str, Any]]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GrocerySuggesterError(f"invalid JSON from gemini: {exc.msg}") from exc
    if not isinstance(data, dict):
        raise GrocerySuggesterError("gemini response was not an object")

    parsed: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw_item in (data.get("items") or [])[:30]:
        if not isinstance(raw_item, dict):
            continue
        name = str(raw_item.get("name") or "").strip()
        if not name:
            continue
        normalized = name.lower()
        if normalized in seen:
            continue
        try:
            category = GroceryItemCategory(str(raw_item.get("category") or "other"))
        except ValueError:
            continue
        parsed.append(
            {
                "name": name[:255],
                "quantity": _parse_quantity(raw_item.get("quantity")),
                "unit": _optional_text(raw_item.get("unit"), max_length=32),
                "category": category,
                "notes": _optional_text(raw_item.get("notes")),
            }
        )
        seen.add(normalized)
    return parsed


def _parse_quantity(value: Any) -> float | None:
    try:
        quantity = float(value)
    except (TypeError, ValueError):
        return None
    return quantity if quantity > 0 else None


def _optional_text(value: Any, *, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length] if max_length is not None else text


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
