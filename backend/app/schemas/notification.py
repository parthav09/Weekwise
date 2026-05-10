from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.notification import NotificationChannel, NotificationStatus


class PreferenceUpdate(BaseModel):
    enabled: bool | None = None
    default_lead_minutes: int | None = Field(default=None, ge=0, le=1440)


class PreferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    channel: NotificationChannel
    enabled: bool
    default_lead_minutes: int
    created_at: datetime
    updated_at: datetime


class WebPushSubscriptionCreate(BaseModel):
    user_id: int = 1
    endpoint: str
    p256dh: str
    auth: str


class WebPushSubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    endpoint: str
    created_at: datetime
    last_used_at: datetime | None


class ScheduledNotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    generated_plan_item_id: int | None
    channel: NotificationChannel
    status: NotificationStatus
    send_at: datetime
    sent_at: datetime | None
    title: str
    body: str
    payload: dict[str, Any] = Field(default_factory=dict)
    failure_reason: str | None
    created_at: datetime
    updated_at: datetime


class NotificationFailure(BaseModel):
    notification_id: int
    channel: NotificationChannel
    reason: str


class NotificationDispatchResult(BaseModel):
    pending_count: int = 0
    sent_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    failures: list[NotificationFailure] = Field(default_factory=list)
