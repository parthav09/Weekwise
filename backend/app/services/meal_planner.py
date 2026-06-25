from __future__ import annotations

import json
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.availability_block import AvailabilityBlock, LifeBlockCategory
from app.models.grocery import GroceryItemCategory, GroceryItemStatus, GroceryList, GroceryListItem, GroceryListSource
from app.models.habit import Habit
from app.schemas.grocery import (
    MealPlanDay,
    MealPlanIngredient,
    MealPlanMeal,
    MealPlanRead,
    MealPlanToGroceryListResult,
    PantryItem,
)
from app.services.pantry import get_pantry


class MealPlannerError(RuntimeError):
    pass


_PANTRY_TOKEN_STOPWORDS = {
    "bag",
    "box",
    "brand",
    "cage",
    "can",
    "count",
    "ct",
    "extra",
    "free",
    "fresh",
    "grade",
    "great",
    "large",
    "lb",
    "lbs",
    "oz",
    "organic",
    "pack",
    "package",
    "pkg",
    "value",
    "white",
}


def generate_weekly_meal_plan(
    db: Session,
    *,
    user_id: int,
    lookback_days: int | None = None,
    start_at: datetime | None = None,
) -> MealPlanRead:
    if not settings.gemini_api_key:
        raise MealPlannerError("GEMINI_API_KEY is not configured")

    pantry = get_pantry(db, user_id=user_id, lookback_days=lookback_days)
    if not pantry.items:
        raise MealPlannerError("No pantry items found. Sync Instacart receipts first.")

    start = _ensure_aware(start_at) if start_at else datetime.now(timezone.utc)
    end = start + timedelta(days=7)

    payload = {
        "window": {"start_at": start.isoformat(), "end_at": end.isoformat()},
        "user_preferences": {
            "goal": "Become a hybrid athlete: endurance, strength, athletic performance, and long-term health.",
            "dietary_restrictions": ["no beef"],
            "nutrition_style": "protein-forward, nutrient-dense, whole-food focused, and genuinely healthy.",
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
        },
        "pantry": [
            {
                "name": item.name,
                "quantity": item.quantity,
                "unit": item.unit,
                "category": item.category.value,
                "last_purchased_at": item.last_purchased_at.isoformat(),
            }
            for item in pantry.items[:120]
        ],
        "habits": [
            {"title": habit.title, "target_count_per_week": habit.target_count_per_week}
            for habit in db.scalars(
                select(Habit).where(Habit.user_id == user_id).limit(20)
            ).all()
        ],
        "meal_blocks": [
            {
                "title": block.title,
                "start_time": block.start_time.isoformat(),
                "end_time": block.end_time.isoformat(),
            }
            for block in db.scalars(
                select(AvailabilityBlock)
                .where(AvailabilityBlock.user_id == user_id)
                .where(AvailabilityBlock.category == LifeBlockCategory.meal)
                .where(AvailabilityBlock.end_time >= start)
                .where(AvailabilityBlock.start_time <= end)
                .limit(20)
            ).all()
        ],
    }

    raw = _call_gemini(payload)
    plan = _parse_plan(raw, pantry_items=pantry.items, start_at=start)
    return MealPlanRead(
        start_at=start,
        end_at=end,
        pantry_item_count=pantry.item_count,
        days=plan,
    )


def meal_plan_to_grocery_list(
    db: Session,
    *,
    user_id: int,
    plan: MealPlanRead,
    title: str | None = None,
) -> MealPlanToGroceryListResult:
    to_buy = _collect_to_buy(plan)
    if not to_buy:
        raise MealPlannerError("This meal plan has no ingredients to buy")

    grocery_list = GroceryList(
        user_id=user_id,
        title=title or f"Meal plan groceries ({plan.start_at.date().isoformat()})",
        source=GroceryListSource.ai,
        notes="Generated from weekly meal plan to-buy ingredients.",
    )
    db.add(grocery_list)
    db.flush()

    for ingredient in to_buy:
        db.add(
            GroceryListItem(
                grocery_list_id=grocery_list.id,
                name=ingredient.name[:255],
                quantity=ingredient.quantity,
                unit=ingredient.unit,
                category=_map_category(ingredient.category),
                status=GroceryItemStatus.needed,
                notes=ingredient.notes,
            )
        )

    db.commit()
    refreshed = db.scalar(
        select(GroceryList)
        .options(selectinload(GroceryList.items))
        .where(GroceryList.id == grocery_list.id)
    )
    if refreshed is None:
        raise MealPlannerError("Failed to create grocery list")

    return MealPlanToGroceryListResult(
        added_count=len(to_buy),
        list=refreshed,
    )


def _collect_to_buy(plan: MealPlanRead) -> list[MealPlanIngredient]:
    seen: set[str] = set()
    results: list[MealPlanIngredient] = []
    for day in plan.days:
        for meal in day.meals:
            for ingredient in meal.ingredients:
                if ingredient.on_hand:
                    continue
                key = ingredient.name.strip().lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                results.append(ingredient)
    return results


def _parse_plan(
    raw: str,
    *,
    pantry_items: list[PantryItem],
    start_at: datetime,
) -> list[MealPlanDay]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise MealPlannerError(f"invalid JSON from gemini: {exc.msg}") from exc
    if not isinstance(data, dict):
        raise MealPlannerError("gemini response was not an object")

    pantry_token_index = _pantry_token_index(pantry_items)
    days: list[MealPlanDay] = []
    for index, raw_day in enumerate((data.get("days") or [])[:7]):
        if not isinstance(raw_day, dict):
            continue
        day_date = start_at.date() + timedelta(days=index)
        meals: list[MealPlanMeal] = []
        for raw_meal in (raw_day.get("meals") or [])[:3]:
            if not isinstance(raw_meal, dict):
                continue
            title = str(raw_meal.get("title") or "").strip()
            if not title:
                continue
            ingredients: list[MealPlanIngredient] = []
            for raw_ingredient in (raw_meal.get("ingredients") or [])[:20]:
                if not isinstance(raw_ingredient, dict):
                    continue
                name = str(raw_ingredient.get("name") or "").strip()
                if not name:
                    continue
                on_hand = bool(raw_ingredient.get("on_hand")) or _is_on_hand(
                    name,
                    pantry_token_index,
                )
                ingredients.append(
                    MealPlanIngredient(
                        name=name[:255],
                        quantity=_parse_quantity(raw_ingredient.get("quantity")),
                        unit=_optional_text(raw_ingredient.get("unit"), max_length=32),
                        category=str(raw_ingredient.get("category") or "other"),
                        on_hand=on_hand,
                        notes=_optional_text(raw_ingredient.get("notes")),
                    )
                )
            meals.append(
                MealPlanMeal(
                    title=title[:255],
                    meal_type=str(raw_meal.get("meal_type") or "meal"),
                    ingredients=ingredients,
                    notes=_optional_text(raw_meal.get("notes")),
                )
            )
        days.append(
            MealPlanDay(
                date=day_date,
                label=str(raw_day.get("label") or day_date.strftime("%A")),
                meals=meals,
            )
        )
    if not days:
        raise MealPlannerError("gemini returned an empty meal plan")
    return days


_SYSTEM_PROMPT = """You create practical 7-day meal plans for one person training to become a hybrid athlete.

The user's goal is to build endurance, strength, athletic performance, and long-term health. Meals should be protein-forward, nutrient-dense, balanced, and realistic for a busy week. Think like a nutritionist designing meals for someone combining running/endurance training with strength training.

Use only the provided pantry, habits, meal blocks, user_preferences, and date window.
Treat user_preferences as hard constraints.
Return JSON only.

Rules:
- Return exactly 7 days.
- Each day should include at most 3 eating moments total. Never return more than 3 meals/snacks for a day.
- Prefer 2 substantial healthy meals plus 1 lighter snack, or 3 substantial meals if that better fits the day.
- Use meal_type values like breakfast, lunch, dinner, or snack. If a snack is included, it counts toward the 3 eating-moment limit.
- Every substantial meal should include a meaningful protein source.
- Avoid beef and beef-derived ingredients. Chicken, turkey, fish, eggs, dairy, legumes, tofu, and other non-beef proteins are allowed.
- Prefer meals that support hybrid-athlete goals: recovery, lean muscle, endurance fueling, satiety, and micronutrient density.
- Prefer whole foods, high-fiber carbs, healthy fats, colorful vegetables, and fruit.
- Include complex carbs where useful for training fuel: potatoes, rice, oats, whole wheat tortillas, beans, lentils, fruit, or similar.
- Do not generate generic "healthy" meals. Make meal titles specific, appealing, and nutritionist-quality.
- Prefer using pantry items first; mark ingredients on_hand=true when likely available from pantry.
- Mark on_hand=false for ingredients that should be bought.
- Keep meals realistic for a busy week, but do not force awkward or unhealthy pantry combinations.
- For every meal, set notes to 2-4 short recipe/prep steps the user can follow.
- category for ingredients should be one of: produce, dairy, meat, pantry, frozen, beverages, household, other.
"""


def _call_gemini(payload: dict[str, Any]) -> str:
    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types
    except Exception as exc:  # noqa: BLE001
        raise MealPlannerError(f"google-genai not installed: {exc}") from exc

    client = genai.Client(api_key=settings.gemini_api_key)
    max_attempts = 3
    last_error: Exception | None = None

    for attempt in range(max_attempts):
        try:
            response = client.models.generate_content(
                model=settings.email_extractor_model or settings.ai_planner_model,
                contents=[
                    _SYSTEM_PROMPT,
                    "Meal planning input:\n" + json.dumps(payload, ensure_ascii=False),
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=_meal_plan_response_schema(types),
                    temperature=0.3,
                ),
            )
        except genai_errors.APIError as exc:
            last_error = exc
            if exc.code == 429 and attempt < max_attempts - 1:
                time.sleep(2 ** attempt)
                continue
            raise MealPlannerError(f"gemini api error: {exc.code}") from exc
        except Exception as exc:  # noqa: BLE001
            raise MealPlannerError(f"gemini call failed: {type(exc).__name__}") from exc

        text = (response.text or "").strip()
        if not text:
            raise MealPlannerError("gemini returned an empty response")
        return text

    raise MealPlannerError(f"gemini api error: {getattr(last_error, 'code', 'unknown')}")


def _pantry_token_index(pantry_items: list[PantryItem]) -> set[str]:
    tokens: set[str] = set()
    for item in pantry_items:
        tokens.update(_ingredient_tokens(item.name))
    return tokens


def _is_on_hand(name: str, pantry_token_index: set[str]) -> bool:
    return bool(_ingredient_tokens(name) & pantry_token_index)


def _ingredient_tokens(name: str) -> set[str]:
    tokens: set[str] = set()
    for raw_token in re.findall(r"[a-z]+", name.lower()):
        for token in _token_variants(raw_token):
            if len(token) > 2 and token not in _PANTRY_TOKEN_STOPWORDS:
                tokens.add(token)
    return tokens


def _token_variants(token: str) -> set[str]:
    variants = {token}
    if token.endswith("ies") and len(token) > 4:
        variants.add(f"{token[:-3]}y")
    elif token.endswith("oes") and len(token) > 4:
        variants.add(token[:-2])
    elif token.endswith("es") and len(token) > 4:
        variants.add(token[:-2])
    elif token.endswith("s") and not token.endswith("ss") and len(token) > 3:
        variants.add(token[:-1])
    return variants


def _meal_plan_response_schema(types_mod):  # type: ignore[no-untyped-def]
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
            "on_hand": Schema(type=Type.BOOLEAN),
            "notes": Schema(type=Type.STRING, nullable=True),
        },
        required=["name", "category", "on_hand"],
    )
    meal_schema = Schema(
        type=Type.OBJECT,
        properties={
            "title": Schema(type=Type.STRING),
            "meal_type": Schema(type=Type.STRING, nullable=True),
            "notes": Schema(type=Type.STRING, nullable=True),
            "ingredients": Schema(type=Type.ARRAY, items=ingredient_schema),
        },
        required=["title", "ingredients"],
    )
    day_schema = Schema(
        type=Type.OBJECT,
        properties={
            "label": Schema(type=Type.STRING, nullable=True),
            "meals": Schema(type=Type.ARRAY, items=meal_schema),
        },
        required=["meals"],
    )
    return Schema(
        type=Type.OBJECT,
        properties={"days": Schema(type=Type.ARRAY, items=day_schema)},
        required=["days"],
    )


def _map_category(value: str) -> GroceryItemCategory:
    try:
        return GroceryItemCategory(value)
    except ValueError:
        return GroceryItemCategory.other


def _optional_text(value: Any, *, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length] if max_length is not None else text


def _parse_quantity(value: Any) -> float | None:
    try:
        quantity = float(value)
    except (TypeError, ValueError):
        return None
    return quantity if quantity > 0 else None


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
