from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.availability_block import AvailabilityBlockType, LifeBlockCategory


class AvailabilityBlockBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    block_type: AvailabilityBlockType = AvailabilityBlockType.blocked
    category: LifeBlockCategory = LifeBlockCategory.other
    start_time: datetime
    end_time: datetime
    recurrence_rule: str | None = None


class AvailabilityBlockCreate(AvailabilityBlockBase):
    user_id: int = 1


class AvailabilityBlockUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    block_type: AvailabilityBlockType | None = None
    category: LifeBlockCategory | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    recurrence_rule: str | None = None


class AvailabilityBlockRead(AvailabilityBlockBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
