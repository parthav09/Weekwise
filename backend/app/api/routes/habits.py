from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.habit import Habit, HabitCompletion
from app.schemas.habit import (
    HabitCompletionCreate,
    HabitCompletionRead,
    HabitCreate,
    HabitRead,
    HabitUpdate,
)
from app.services.dev_user import ensure_dev_user

router = APIRouter(prefix="/habits", tags=["habits"])


def read_completion(completion: HabitCompletion) -> HabitCompletionRead:
    return HabitCompletionRead(
        id=completion.id,
        habit_id=completion.habit_id,
        user_id=completion.user_id,
        note=completion.note,
        completed_on=completion.completed_on,
        completed_at=completion.completed_at,
        created_at=completion.created_at,
        habit_title=completion.habit.title,
    )


@router.post("", response_model=HabitRead, status_code=status.HTTP_201_CREATED)
def create_habit(payload: HabitCreate, db: Session = Depends(get_db)) -> Habit:
    ensure_dev_user(db, payload.user_id)
    habit = Habit(**payload.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.get("", response_model=list[HabitRead])
def list_habits(db: Session = Depends(get_db)) -> list[Habit]:
    return list(db.scalars(select(Habit).order_by(Habit.created_at.desc())).all())


@router.get("/completions", response_model=list[HabitCompletionRead])
def list_habit_completions(
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[HabitCompletionRead]:
    query = select(HabitCompletion).join(Habit)
    if start_at is not None:
        query = query.where(HabitCompletion.completed_at >= start_at)
    if end_at is not None:
        query = query.where(HabitCompletion.completed_at <= end_at)

    completions = db.scalars(query.order_by(HabitCompletion.completed_at.desc())).all()
    return [read_completion(completion) for completion in completions]


@router.get("/{habit_id}", response_model=HabitRead)
def get_habit(habit_id: int, db: Session = Depends(get_db)) -> Habit:
    habit = db.get(Habit, habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")
    return habit


@router.patch("/{habit_id}", response_model=HabitRead)
def update_habit(
    habit_id: int, payload: HabitUpdate, db: Session = Depends(get_db)
) -> Habit:
    habit = db.get(Habit, habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(habit, field, value)

    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(habit_id: int, db: Session = Depends(get_db)) -> None:
    habit = db.get(Habit, habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")
    db.delete(habit)
    db.commit()


@router.post(
    "/{habit_id}/completions",
    response_model=HabitCompletionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_habit_completion(
    habit_id: int,
    payload: HabitCompletionCreate | None = None,
    db: Session = Depends(get_db),
) -> HabitCompletionRead:
    habit = db.get(Habit, habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")

    payload = payload or HabitCompletionCreate(user_id=habit.user_id)
    ensure_dev_user(db, payload.user_id)
    completed_at = payload.completed_at or datetime.now(timezone.utc)
    completed_on = payload.completed_on or completed_at.date()

    existing_completion = db.scalar(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit.id,
            HabitCompletion.completed_on == completed_on,
        )
    )
    if existing_completion is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This habit has already been logged today.",
        )

    completion = HabitCompletion(
        habit_id=habit.id,
        user_id=payload.user_id,
        note=payload.note,
        completed_on=completed_on,
        completed_at=completed_at,
    )
    db.add(completion)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This habit has already been logged today.",
        ) from error
    db.refresh(completion)
    return read_completion(completion)
