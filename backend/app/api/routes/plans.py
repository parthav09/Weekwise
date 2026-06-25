import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.plan import (
    ActivePlanItemRead,
    ActivePlanItemUpdate,
    ActivePlanRead,
    ActivePlanSaveRequest,
    PlanRead,
    PlanRequest,
    PlanScope,
)
from app.services.dev_user import ensure_dev_user
from app.services.ai_planner import AiPlannerError, generate_ai_plan_from_context
from app.services.plan_store import (
    active_plan_to_read,
    get_active_plan,
    item_to_read,
    save_active_plan,
    save_active_plan_background,
    update_plan_item,
)
from app.services.planner import generate_plan_from_context, load_planning_context

router = APIRouter(prefix="/plans", tags=["plans"])
logger = logging.getLogger(__name__)


def _generate(payload: PlanRequest, db: Session) -> PlanRead:
    ensure_dev_user(db, payload.user_id)
    context = load_planning_context(
        db,
        user_id=payload.user_id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        day_window=(payload.day_start, payload.day_end),
    )
    try:
        return generate_ai_plan_from_context(db, context)
    except AiPlannerError as exc:
        logger.warning("AI planner unavailable; falling back to rule planner: %s", exc)

    plan = generate_plan_from_context(context)
    plan.notes.append("AI planner unavailable; used fast rule planner fallback.")
    return plan


def _generate_and_save_later(
    payload: PlanRequest,
    *,
    scope: PlanScope,
    background_tasks: BackgroundTasks,
    db: Session,
) -> PlanRead:
    plan = _generate(payload, db)
    background_tasks.add_task(
        save_active_plan_background,
        user_id=payload.user_id,
        scope=scope,
        plan_payload=plan.model_dump(mode="json"),
    )
    return plan


@router.post("/week", response_model=PlanRead)
def generate_week_plan(payload: PlanRequest, db: Session = Depends(get_db)) -> PlanRead:
    return _generate(payload, db)


@router.post(
    "/week/active",
    response_model=PlanRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_week_plan_and_save_active(
    payload: PlanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> PlanRead:
    return _generate_and_save_later(
        payload,
        scope="week",
        background_tasks=background_tasks,
        db=db,
    )


@router.post("/day", response_model=PlanRead)
def generate_day_plan(payload: PlanRequest, db: Session = Depends(get_db)) -> PlanRead:
    return _generate(payload, db)


@router.post(
    "/day/active",
    response_model=PlanRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_day_plan_and_save_active(
    payload: PlanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> PlanRead:
    return _generate_and_save_later(
        payload,
        scope="day",
        background_tasks=background_tasks,
        db=db,
    )


@router.post("/active", response_model=ActivePlanRead)
def save_active_generated_plan(
    payload: ActivePlanSaveRequest,
    db: Session = Depends(get_db),
) -> ActivePlanRead:
    ensure_dev_user(db, payload.user_id)
    plan = save_active_plan(
        db,
        user_id=payload.user_id,
        scope=payload.scope,
        plan=payload.plan,
    )
    return active_plan_to_read(plan)


@router.get("/active", response_model=ActivePlanRead | None)
def read_active_generated_plan(
    start_at: datetime,
    end_at: datetime,
    scope: PlanScope = "week",
    user_id: int = Query(1),
    db: Session = Depends(get_db),
) -> ActivePlanRead | None:
    ensure_dev_user(db, user_id)
    plan = get_active_plan(
        db,
        user_id=user_id,
        scope=scope,
        start_at=start_at,
        end_at=end_at,
    )
    return active_plan_to_read(plan) if plan else None


@router.patch("/items/{item_id}", response_model=ActivePlanItemRead)
def update_active_plan_item(
    item_id: int,
    payload: ActivePlanItemUpdate,
    user_id: int = Query(1),
    db: Session = Depends(get_db),
) -> ActivePlanItemRead:
    ensure_dev_user(db, user_id)
    item = update_plan_item(
        db,
        user_id=user_id,
        item_id=item_id,
        status=payload.status,
        feedback_reason=payload.feedback_reason,
        moved_to_start=payload.moved_to_start,
        moved_to_end=payload.moved_to_end,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Plan item not found")
    return item_to_read(item)
