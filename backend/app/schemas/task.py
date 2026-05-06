from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.task import (
    TaskCategory,
    TaskEnergyLevel,
    TaskPriority,
    TaskScheduleFlexibility,
    TaskStatus,
)


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority = TaskPriority.medium
    status: TaskStatus = TaskStatus.todo
    due_date: datetime | None = None
    estimated_minutes: int | None = Field(default=None, ge=1)
    energy_level: TaskEnergyLevel = TaskEnergyLevel.medium
    category: TaskCategory = TaskCategory.personal
    schedule_flexibility: TaskScheduleFlexibility = TaskScheduleFlexibility.flexible


class TaskCreate(TaskBase):
    user_id: int = 1


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    due_date: datetime | None = None
    estimated_minutes: int | None = Field(default=None, ge=1)
    energy_level: TaskEnergyLevel | None = None
    category: TaskCategory | None = None
    schedule_flexibility: TaskScheduleFlexibility | None = None
    completed_at: datetime | None = None


class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
