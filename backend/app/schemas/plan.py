from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


PlanBlockType = Literal["task", "habit", "life"]
PlanGenerator = Literal["rules", "ai"]


class PlanRequest(BaseModel):
    user_id: int = 1
    start_at: datetime
    end_at: datetime
    day_start: time = time(8)
    day_end: time = time(22)

    @model_validator(mode="after")
    def _validate_window(self) -> "PlanRequest":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        if self.day_end <= self.day_start:
            raise ValueError("day_end must be after day_start")
        return self


class PlanBlock(BaseModel):
    start: datetime
    end: datetime
    type: PlanBlockType
    title: str
    source_id: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PlanDay(BaseModel):
    date: date
    blocks: list[PlanBlock] = Field(default_factory=list)


class PlanRead(BaseModel):
    generated_at: datetime
    generator: PlanGenerator = "rules"
    start_at: datetime
    end_at: datetime
    days: list[PlanDay] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
