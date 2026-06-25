from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.task import Task, TaskStatus
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services.tasks import create_task_record

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)) -> Task:
    return create_task_record(db, payload)


@router.get("", response_model=list[TaskRead])
def list_tasks(
    due_from: date | None = None,
    due_to: date | None = None,
    include_unscheduled: bool = False,
    db: Session = Depends(get_db),
) -> list[Task]:
    query = select(Task)
    filters = []
    if due_from is not None:
        filters.append(
            Task.due_date >= datetime.combine(due_from, time.min, tzinfo=timezone.utc)
        )
    if due_to is not None:
        filters.append(
            Task.due_date <= datetime.combine(due_to, time.max, tzinfo=timezone.utc)
        )
    if filters:
        dated_filter = filters[0] if len(filters) == 1 else and_(*filters)
        query = query.where(
            or_(Task.due_date.is_(None), dated_filter)
            if include_unscheduled
            else dated_filter
        )

    if due_from is not None or due_to is not None:
        query = query.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc())
    else:
        query = query.order_by(
            Task.completed_at.desc().nullslast(), Task.created_at.desc()
        )

    return list(db.scalars(query).all())


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: int, db: Session = Depends(get_db)) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)
) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(task, field, value)

    if "status" in updates:
        if task.status == TaskStatus.done and task.completed_at is None:
            task.completed_at = datetime.now(timezone.utc)
        if task.status != TaskStatus.done:
            task.completed_at = None

    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: Session = Depends(get_db)) -> None:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
