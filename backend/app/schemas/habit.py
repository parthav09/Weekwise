from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class HabitBase(BaseModel):
    title: str
    target_count_per_week: int = 4
    estimated_minutes: int | None = None
    preferred_time_of_day: str | None = None


class HabitCreate(HabitBase):
    user_id: int = 1


class HabitUpdate(BaseModel):
    title: str | None = None
    target_count_per_week: int | None = None
    estimated_minutes: int | None = None
    preferred_time_of_day: str | None = None


class HabitRead(HabitBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class HabitCompletionCreate(BaseModel):
    user_id: int = 1
    completed_at: datetime | None = None
    completed_on: date | None = None
    note: str | None = None


class HabitCompletionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    habit_id: int
    user_id: int
    habit_title: str
    note: str | None
    completed_on: date
    completed_at: datetime
    created_at: datetime
