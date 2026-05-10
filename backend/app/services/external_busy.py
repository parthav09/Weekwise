from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEventCache


@dataclass
class ExternalBusyBlock:
    id: int
    title: str
    source: str
    start: datetime
    end: datetime
    metadata: dict[str, str | int | bool | None]


def load_external_busy_blocks(
    db: Session,
    *,
    user_id: int,
    start_at: datetime,
    end_at: datetime,
) -> list[ExternalBusyBlock]:
    stmt = (
        select(CalendarEventCache)
        .where(CalendarEventCache.user_id == user_id)
        .where(CalendarEventCache.end_at > start_at)
        .where(CalendarEventCache.start_at <= end_at)
        .order_by(CalendarEventCache.start_at.asc())
    )
    events = db.scalars(stmt).all()
    return [
        ExternalBusyBlock(
            id=event.id,
            title=event.title,
            source="google_calendar",
            start=event.start_at,
            end=event.end_at,
            metadata={
                "provider": "google",
                "provider_event_id": event.provider_event_id,
                "calendar_id": event.calendar_id,
                "is_all_day": event.is_all_day,
            },
        )
        for event in events
    ]
