from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.task import Task, TaskStatus
from app.schemas.task import TaskCreate
from app.services.dev_user import ensure_dev_user


def create_task_record(db: Session, payload: TaskCreate) -> Task:
    ensure_dev_user(db, payload.user_id)
    task = Task(**payload.model_dump())
    if task.status == TaskStatus.done and task.completed_at is None:
        task.completed_at = datetime.now(timezone.utc)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task
