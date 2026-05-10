from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.email import ExtractedTaskCandidateStatus
from app.models.task import (
    TaskCategory,
    TaskEnergyLevel,
    TaskPriority,
    TaskScheduleFlexibility,
)


class GmailStatusRead(BaseModel):
    connected: bool
    provider_account_email: str | None = None
    token_expires_at: datetime | None = None
    last_synced_at: datetime | None = None


class GmailSyncRequest(BaseModel):
    user_id: int = 1


class GmailSyncResult(BaseModel):
    fetched_count: int
    new_email_count: int
    candidate_count: int


class EmailMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender: str | None
    subject: str | None
    snippet: str | None
    received_at: datetime
    is_extracted: bool


class ExtractedTaskCandidateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    email_message_id: int
    status: ExtractedTaskCandidateStatus
    source: str
    suggested_title: str
    suggested_description: str | None
    suggested_priority: TaskPriority
    suggested_due_date: date | None
    suggested_estimated_minutes: int | None
    suggested_energy_level: TaskEnergyLevel
    suggested_category: TaskCategory
    suggested_schedule_flexibility: TaskScheduleFlexibility
    confidence: float | None
    rationale: str | None
    created_task_id: int | None
    created_at: datetime
    updated_at: datetime
    email_message: EmailMessageRead


class ExtractedTaskCandidateOverrides(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority | None = None
    due_date: datetime | None = None
    estimated_minutes: int | None = Field(default=None, ge=1)
    energy_level: TaskEnergyLevel | None = None
    category: TaskCategory | None = None
    schedule_flexibility: TaskScheduleFlexibility | None = None


class ExtractedTaskCandidateAccept(BaseModel):
    overrides: ExtractedTaskCandidateOverrides | None = None


class ExtractedTaskCandidateReject(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
