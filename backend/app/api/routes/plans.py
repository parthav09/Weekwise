import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.generated_plan import (
    GeneratedPlan,
    GeneratedPlanDay,
    GeneratedPlanItem,
    GeneratedPlanItemStatus,
    GeneratedPlanScope,
)
from app.schemas.plan import PlanRead, PlanRequest
from app.schemas.saved_plan import (
    SavedPlanDayRead,
    SavedPlanItemRead,
    SavedPlanItemUpdate,
    SavedPlanRead,
    SavedPlanSaveRequest,
)
from app.services.ai_planner import AiPlannerError, generate_ai_plan
from app.services.dev_user import ensure_dev_user
from app.services.notifications import (
    cancel_notifications_for_item,
    reschedule_notifications_for_item,
    schedule_notifications_for_saved_plan,
)
from app.services.planner import generate_plan

router = APIRouter(prefix="/plans", tags=["plans"])
logger = logging.getLogger(__name__)


def _generate(payload: PlanRequest, db: Session) -> PlanRead:
    ensure_dev_user(db, payload.user_id)
    kwargs = dict(
        user_id=payload.user_id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        day_window=(payload.day_start, payload.day_end),
    )
    try:
        return generate_ai_plan(db, **kwargs)
    except AiPlannerError as exc:
        logger.warning("AI planner unavailable, falling back to rules: %s", exc)
        return generate_plan(db, **kwargs)


def _read_item(item: GeneratedPlanItem) -> SavedPlanItemRead:
    return SavedPlanItemRead(
        id=item.id,
        generated_plan_id=item.generated_plan_id,
        generated_plan_day_id=item.generated_plan_day_id,
        title=item.title,
        item_type=item.item_type,
        source_id=item.source_id,
        start_at=item.start_at,
        end_at=item.end_at,
        status=item.status,
        feedback_reason=item.feedback_reason,
        moved_to_start=item.moved_to_start,
        moved_to_end=item.moved_to_end,
        metadata=item.item_metadata or {},
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _read_plan(plan: GeneratedPlan) -> SavedPlanRead:
    return SavedPlanRead(
        id=plan.id,
        user_id=plan.user_id,
        scope=plan.scope,
        generator=plan.generator,
        start_at=plan.start_at,
        end_at=plan.end_at,
        notes=plan.notes or [],
        plan=PlanRead.model_validate(plan.plan_payload),
        days=[
            SavedPlanDayRead(
                id=day.id,
                generated_plan_id=day.generated_plan_id,
                date=day.date,
                items=[_read_item(item) for item in day.items],
                created_at=day.created_at,
            )
            for day in plan.days
        ],
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


def _saved_plan_options():
    return selectinload(GeneratedPlan.days).selectinload(GeneratedPlanDay.items)


def _save_plan(
    payload: SavedPlanSaveRequest,
    scope: GeneratedPlanScope,
    db: Session,
) -> GeneratedPlan:
    ensure_dev_user(db, payload.user_id)
    plan_read = payload.plan
    plan = GeneratedPlan(
        user_id=payload.user_id,
        scope=scope,
        generator=plan_read.generator,
        start_at=plan_read.start_at,
        end_at=plan_read.end_at,
        notes=[*plan_read.notes, *payload.notes],
        plan_payload=plan_read.model_dump(mode="json"),
    )

    for plan_day in plan_read.days:
        saved_day = GeneratedPlanDay(date=plan_day.date)
        for block in plan_day.blocks:
            item = GeneratedPlanItem(
                title=block.title,
                item_type=block.type,
                source_id=block.source_id,
                start_at=block.start,
                end_at=block.end,
                status=GeneratedPlanItemStatus.planned,
                item_metadata=block.metadata,
            )
            saved_day.items.append(item)
            plan.items.append(item)
        plan.days.append(saved_day)

    db.add(plan)
    db.commit()
    saved_plan = _get_saved_plan(plan.id, db)
    schedule_notifications_for_saved_plan(db, saved_plan, lead_minutes=None)
    return saved_plan


def _get_saved_plan(plan_id: int, db: Session) -> GeneratedPlan:
    plan = db.scalar(
        select(GeneratedPlan)
        .options(_saved_plan_options())
        .where(GeneratedPlan.id == plan_id)
    )
    if plan is None:
        raise HTTPException(status_code=404, detail="Saved plan not found")
    return plan


@router.post("/week", response_model=PlanRead)
def generate_week_plan(payload: PlanRequest, db: Session = Depends(get_db)) -> PlanRead:
    return _generate(payload, db)


@router.post("/day", response_model=PlanRead)
def generate_day_plan(payload: PlanRequest, db: Session = Depends(get_db)) -> PlanRead:
    return _generate(payload, db)


@router.post("/save", response_model=SavedPlanRead)
def save_plan(payload: SavedPlanSaveRequest, db: Session = Depends(get_db)) -> SavedPlanRead:
    scope = GeneratedPlanScope.day if len(payload.plan.days) == 1 else GeneratedPlanScope.week
    return _read_plan(_save_plan(payload, scope, db))


@router.post("/week/save", response_model=SavedPlanRead)
def save_week_plan(
    payload: SavedPlanSaveRequest, db: Session = Depends(get_db)
) -> SavedPlanRead:
    return _read_plan(_save_plan(payload, GeneratedPlanScope.week, db))


@router.post("/day/save", response_model=SavedPlanRead)
def save_day_plan(
    payload: SavedPlanSaveRequest, db: Session = Depends(get_db)
) -> SavedPlanRead:
    return _read_plan(_save_plan(payload, GeneratedPlanScope.day, db))


@router.get("/saved", response_model=list[SavedPlanRead])
def list_saved_plans(
    user_id: int = 1,
    scope: GeneratedPlanScope | None = None,
    start_from: datetime | None = None,
    end_to: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[SavedPlanRead]:
    ensure_dev_user(db, user_id)
    query = (
        select(GeneratedPlan)
        .options(_saved_plan_options())
        .where(GeneratedPlan.user_id == user_id)
        .order_by(GeneratedPlan.created_at.desc())
    )
    if scope is not None:
        query = query.where(GeneratedPlan.scope == scope)
    if start_from is not None:
        query = query.where(GeneratedPlan.end_at >= start_from)
    if end_to is not None:
        query = query.where(GeneratedPlan.start_at <= end_to)

    return [_read_plan(plan) for plan in db.scalars(query).all()]


@router.get("/saved/{plan_id}", response_model=SavedPlanRead)
def get_saved_plan(plan_id: int, db: Session = Depends(get_db)) -> SavedPlanRead:
    return _read_plan(_get_saved_plan(plan_id, db))


@router.patch("/items/{item_id}", response_model=SavedPlanItemRead)
def update_saved_plan_item(
    item_id: int,
    payload: SavedPlanItemUpdate,
    db: Session = Depends(get_db),
) -> SavedPlanItemRead:
    item = db.get(GeneratedPlanItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Saved plan item not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(item, field, value)

    if item.status not in {
        GeneratedPlanItemStatus.skipped,
        GeneratedPlanItemStatus.failed,
    }:
        item.feedback_reason = None if "feedback_reason" not in updates else item.feedback_reason

    if item.status != GeneratedPlanItemStatus.moved:
        if "moved_to_start" not in updates:
            item.moved_to_start = None
        if "moved_to_end" not in updates:
            item.moved_to_end = None

    db.add(item)
    db.flush()
    if item.status in {
        GeneratedPlanItemStatus.done,
        GeneratedPlanItemStatus.skipped,
        GeneratedPlanItemStatus.failed,
        GeneratedPlanItemStatus.cancelled,
    }:
        cancel_notifications_for_item(db, item.id)
    elif item.status == GeneratedPlanItemStatus.moved and item.moved_to_start:
        reschedule_notifications_for_item(db, item)
    else:
        db.commit()
    db.refresh(item)
    return _read_item(item)
