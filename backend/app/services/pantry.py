from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.grocery import GroceryItemCategory, GroceryOrder
from app.schemas.grocery import PantryItem, PantryRead


def get_pantry(
    db: Session,
    *,
    user_id: int,
    lookback_days: int | None = None,
) -> PantryRead:
    days = lookback_days if lookback_days is not None else settings.pantry_lookback_days
    days = max(1, min(days, 365))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    orders = list(
        db.scalars(
            select(GroceryOrder)
            .options(selectinload(GroceryOrder.items))
            .where(GroceryOrder.user_id == user_id)
            .where(GroceryOrder.ordered_at >= cutoff)
            .order_by(GroceryOrder.ordered_at.desc())
        ).all()
    )

    by_name: dict[str, PantryItem] = {}
    for order in orders:
        for item in order.items:
            normalized = item.name.strip().lower()
            if not normalized:
                continue
            category = _guess_category(item.name)
            existing = by_name.get(normalized)
            if existing is None:
                by_name[normalized] = PantryItem(
                    name=item.name.strip(),
                    quantity=item.quantity,
                    unit=item.unit,
                    category=category,
                    last_purchased_at=order.ordered_at,
                    order_count=1,
                )
                continue

            existing.order_count += 1
            if order.ordered_at >= existing.last_purchased_at:
                existing.last_purchased_at = order.ordered_at
                existing.quantity = item.quantity
                existing.unit = item.unit
                existing.category = category

    items = sorted(
        by_name.values(),
        key=lambda entry: (entry.category.value, entry.name.lower()),
    )
    return PantryRead(
        lookback_days=days,
        item_count=len(items),
        items=items,
    )


def _guess_category(name: str) -> GroceryItemCategory:
    lowered = name.lower()
    rules: list[tuple[GroceryItemCategory, tuple[str, ...]]] = [
        (GroceryItemCategory.produce, ("apple", "banana", "berry", "broccoli", "carrot", "lettuce", "onion", "spinach", "tomato")),
        (GroceryItemCategory.dairy, ("milk", "cheese", "yogurt", "butter", "egg", "cream")),
        (GroceryItemCategory.meat, ("chicken", "beef", "pork", "salmon", "turkey", "fish", "sausage")),
        (GroceryItemCategory.frozen, ("frozen", "ice cream")),
        (GroceryItemCategory.beverages, ("water", "juice", "soda", "coffee", "tea", "sparkling")),
        (GroceryItemCategory.household, ("paper towel", "detergent", "soap", "trash bag", "cleaner")),
        (GroceryItemCategory.pantry, ("rice", "pasta", "bread", "flour", "oil", "sauce", "cereal", "snack")),
    ]
    for category, keywords in rules:
        if any(keyword in lowered for keyword in keywords):
            return category
    return GroceryItemCategory.other
