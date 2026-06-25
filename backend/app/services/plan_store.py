import logging
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import SessionLocal
from app.models.generated_plan import (
    GeneratedPlan,
    GeneratedPlanDay,
    GeneratedPlanGenerator,
    GeneratedPlanItem,
    GeneratedPlanItemStatus,
    GeneratedPlanScope,
)
from app.schemas.plan import (
    ActivePlanDay,
    ActivePlanItemRead,
    ActivePlanRead,
    PlanBlock,
    PlanRead,
)


logger = logging.getLogger(__name__)


def save_active_plan(
    db: Session,
    *,
    user_id: int,
    scope: str,
    plan: PlanRead,
) -> GeneratedPlan:
    active = _find_active_plan(
        db,
        user_id=user_id,
        scope=scope,
        start_at=plan.start_at,
        end_at=plan.end_at,
    )
    if active is None:
        active = GeneratedPlan(
            user_id=user_id,
            scope=GeneratedPlanScope(scope),
            generator=GeneratedPlanGenerator(plan.generator),
            start_at=plan.start_at,
            end_at=plan.end_at,
            notes=plan.notes,
            plan_payload=plan.model_dump(mode="json"),
        )
        db.add(active)
        db.flush()
    else:
        db.execute(delete(GeneratedPlanItem).where(GeneratedPlanItem.generated_plan_id == active.id))
        db.execute(delete(GeneratedPlanDay).where(GeneratedPlanDay.generated_plan_id == active.id))
        active.generator = GeneratedPlanGenerator(plan.generator)
        active.start_at = plan.start_at
        active.end_at = plan.end_at
        active.notes = plan.notes
        active.plan_payload = plan.model_dump(mode="json")

    _insert_plan_items(db, active, plan)
    db.commit()
    return get_active_plan(
        db,
        user_id=user_id,
        scope=scope,
        start_at=plan.start_at,
        end_at=plan.end_at,
    ) or active


def save_active_plan_background(
    *,
    user_id: int,
    scope: str,
    plan_payload: dict[str, Any],
) -> None:
    """Persist a generated plan after the response has been sent."""
    db = SessionLocal()
    try:
        plan = PlanRead.model_validate(plan_payload)
        save_active_plan(db, user_id=user_id, scope=scope, plan=plan)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to save generated %s plan for user_id=%s in the background",
            scope,
            user_id,
        )
    finally:
        db.close()


def get_active_plan(
    db: Session,
    *,
    user_id: int,
    scope: str,
    start_at: datetime,
    end_at: datetime,
) -> GeneratedPlan | None:
    return db.scalar(
        select(GeneratedPlan)
        .options(selectinload(GeneratedPlan.days).selectinload(GeneratedPlanDay.items))
        .where(GeneratedPlan.user_id == user_id)
        .where(GeneratedPlan.scope == GeneratedPlanScope(scope))
        .where(GeneratedPlan.start_at == start_at)
        .where(GeneratedPlan.end_at == end_at)
        .order_by(GeneratedPlan.updated_at.desc(), GeneratedPlan.id.desc())
    )


def update_plan_item(
    db: Session,
    *,
    user_id: int,
    item_id: int,
    status: str,
    feedback_reason: str | None,
    moved_to_start: datetime | None,
    moved_to_end: datetime | None,
) -> GeneratedPlanItem | None:
    item = db.scalar(
        select(GeneratedPlanItem)
        .join(GeneratedPlan)
        .where(GeneratedPlanItem.id == item_id)
        .where(GeneratedPlan.user_id == user_id)
    )
    if item is None:
        return None

    item.status = GeneratedPlanItemStatus(status)
    item.feedback_reason = feedback_reason
    item.moved_to_start = moved_to_start
    item.moved_to_end = moved_to_end
    db.commit()
    db.refresh(item)
    return item


def active_plan_to_read(plan: GeneratedPlan) -> ActivePlanRead:
    days = [
        ActivePlanDay(
            date=day.date,
            blocks=[_item_to_read(item, day.date) for item in day.items],
        )
        for day in plan.days
    ]
    return ActivePlanRead(
        id=plan.id,
        user_id=plan.user_id,
        scope=plan.scope.value,
        generated_at=_generated_at_from_payload(plan),
        generator=plan.generator.value,
        start_at=plan.start_at,
        end_at=plan.end_at,
        days=days,
        notes=plan.notes,
    )


def _generated_at_from_payload(plan: GeneratedPlan) -> datetime:
    raw_generated_at = (plan.plan_payload or {}).get("generated_at")
    if isinstance(raw_generated_at, str):
        try:
            return datetime.fromisoformat(raw_generated_at)
        except ValueError:
            pass
    return plan.created_at


def item_to_read(item: GeneratedPlanItem) -> ActivePlanItemRead:
    return _item_to_read(item, item.day.date)


def _find_active_plan(
    db: Session,
    *,
    user_id: int,
    scope: str,
    start_at: datetime,
    end_at: datetime,
) -> GeneratedPlan | None:
    return db.scalar(
        select(GeneratedPlan)
        .where(GeneratedPlan.user_id == user_id)
        .where(GeneratedPlan.scope == GeneratedPlanScope(scope))
        .where(GeneratedPlan.start_at == start_at)
        .where(GeneratedPlan.end_at == end_at)
        .order_by(GeneratedPlan.updated_at.desc(), GeneratedPlan.id.desc())
    )


def _insert_plan_items(db: Session, active: GeneratedPlan, plan: PlanRead) -> None:
    pending_days: list[tuple[GeneratedPlanDay, list[PlanBlock]]] = []
    for plan_day in plan.days:
        day = GeneratedPlanDay(generated_plan_id=active.id, date=plan_day.date)
        pending_days.append((day, plan_day.blocks))
        db.add(day)

    db.flush()

    pending_items: list[GeneratedPlanItem] = []
    for day, blocks in pending_days:
        for block in blocks:
            pending_items.append(_item_from_block(active.id, day.id, block))
    if pending_items:
        db.add_all(pending_items)


def _item_from_block(
    generated_plan_id: int,
    generated_plan_day_id: int,
    block: PlanBlock,
) -> GeneratedPlanItem:
    return GeneratedPlanItem(
        generated_plan_id=generated_plan_id,
        generated_plan_day_id=generated_plan_day_id,
        title=block.title,
        item_type=block.type,
        source_id=block.source_id,
        start_at=block.start,
        end_at=block.end,
        status=GeneratedPlanItemStatus.planned,
        item_metadata=block.metadata,
    )


def _item_to_read(item: GeneratedPlanItem, item_date) -> ActivePlanItemRead:
    return ActivePlanItemRead(
        id=item.id,
        generated_plan_id=item.generated_plan_id,
        date=item_date,
        start=item.start_at,
        end=item.end_at,
        type=item.item_type,
        title=item.title,
        source_id=item.source_id,
        metadata=item.item_metadata,
        status=item.status.value,
        feedback_reason=item.feedback_reason,
        moved_to_start=item.moved_to_start,
        moved_to_end=item.moved_to_end,
    )
