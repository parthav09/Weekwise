from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.generated_plan import (
    GeneratedPlanGenerator,
    GeneratedPlanItemStatus,
    GeneratedPlanScope,
)
from app.schemas.plan import PlanRead


class SavedPlanSaveRequest(BaseModel):
    user_id: int = 1
    plan: PlanRead
    notes: list[str] = Field(default_factory=list)


class SavedPlanItemUpdate(BaseModel):
    status: GeneratedPlanItemStatus | None = None
    feedback_reason: str | None = None
    moved_to_start: datetime | None = None
    moved_to_end: datetime | None = None


class SavedPlanItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    generated_plan_id: int
    generated_plan_day_id: int
    title: str
    item_type: str
    source_id: int | None
    start_at: datetime
    end_at: datetime
    status: GeneratedPlanItemStatus
    feedback_reason: str | None
    moved_to_start: datetime | None
    moved_to_end: datetime | None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class SavedPlanDayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    generated_plan_id: int
    date: date
    items: list[SavedPlanItemRead] = Field(default_factory=list)
    created_at: datetime


class SavedPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    scope: GeneratedPlanScope
    generator: GeneratedPlanGenerator
    start_at: datetime
    end_at: datetime
    notes: list[str] = Field(default_factory=list)
    plan: PlanRead
    days: list[SavedPlanDayRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
