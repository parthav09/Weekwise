from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.integrations.google_calendar.client import (
    GoogleCalendarError,
    build_auth_url,
    exchange_code_for_account,
    get_account,
    list_events,
    parse_google_event_time,
    require_account,
)
from app.models.calendar import CalendarEventCache
from app.services.dev_user import ensure_dev_user

router = APIRouter(
    prefix="/integrations/google-calendar",
    tags=["integrations: google-calendar"],
)


class CalendarStatusRead(BaseModel):
    connected: bool
    provider_account_email: str | None = None
    token_expires_at: datetime | None = None


class CalendarSyncRequest(BaseModel):
    user_id: int = 1
    calendar_id: str = "primary"
    start_at: datetime | None = None
    end_at: datetime | None = None

    @model_validator(mode="after")
    def _validate_window(self) -> "CalendarSyncRequest":
        if self.start_at is not None and self.end_at is not None and self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class CalendarSyncRead(BaseModel):
    synced_count: int
    calendar_id: str
    synced_at: datetime


class CalendarEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    provider_event_id: str
    calendar_id: str
    title: str
    start_at: datetime
    end_at: datetime
    is_all_day: bool
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    synced_at: datetime


@router.get("/status", response_model=CalendarStatusRead)
def google_calendar_status(
    user_id: int = 1, db: Session = Depends(get_db)
) -> CalendarStatusRead:
    account = require_optional_account(db, user_id=user_id)
    if account is None:
        return CalendarStatusRead(connected=False)
    return CalendarStatusRead(
        connected=True,
        provider_account_email=account.provider_account_email,
        token_expires_at=account.token_expires_at,
    )


@router.get("/connect")
def connect_google_calendar(user_id: int = 1) -> RedirectResponse:
    return RedirectResponse(build_auth_url(user_id=user_id))


@router.get("/callback")
def google_calendar_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if error:
        return _frontend_redirect("settings", google_calendar="error", detail=error)
    if not code:
        return _frontend_redirect("settings", google_calendar="error", detail="missing_code")

    try:
        user_id = int(state or "1")
    except ValueError:
        user_id = 1

    ensure_dev_user(db, user_id)
    try:
        exchange_code_for_account(db, code=code, user_id=user_id)
    except (GoogleCalendarError, HTTPException) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else "oauth_failed"
        return _frontend_redirect("settings", google_calendar="error", detail=str(detail))

    return _frontend_redirect("settings", google_calendar="connected")


@router.post("/sync", response_model=CalendarSyncRead)
def sync_google_calendar(
    payload: CalendarSyncRequest, db: Session = Depends(get_db)
) -> CalendarSyncRead:
    ensure_dev_user(db, payload.user_id)
    account = require_account(db, user_id=payload.user_id)
    now = datetime.now(timezone.utc)
    start_at = payload.start_at or now - timedelta(days=7)
    end_at = payload.end_at or now + timedelta(days=45)

    try:
        events = list_events(
            db,
            account,
            calendar_id=payload.calendar_id,
            start_at=start_at,
            end_at=end_at,
        )
    except GoogleCalendarError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    synced_at = datetime.now(timezone.utc)
    synced_count = 0
    for event in events:
        provider_event_id = event.get("id")
        if not provider_event_id:
            continue
        try:
            event_start, event_end, is_all_day = parse_google_event_time(event)
        except (GoogleCalendarError, ValueError):
            continue

        cached = db.scalar(
            select(CalendarEventCache)
            .where(CalendarEventCache.user_id == payload.user_id)
            .where(CalendarEventCache.calendar_id == payload.calendar_id)
            .where(CalendarEventCache.provider_event_id == str(provider_event_id))
        )
        if cached is None:
            cached = CalendarEventCache(
                user_id=payload.user_id,
                provider_event_id=str(provider_event_id),
                calendar_id=payload.calendar_id,
            )
        cached.title = str(event.get("summary") or "Busy")
        cached.start_at = event_start
        cached.end_at = event_end
        cached.is_all_day = is_all_day
        cached.raw_payload = event
        cached.synced_at = synced_at
        db.add(cached)
        synced_count += 1

    db.commit()
    return CalendarSyncRead(
        synced_count=synced_count,
        calendar_id=payload.calendar_id,
        synced_at=synced_at,
    )


@router.get("/events", response_model=list[CalendarEventRead])
def list_cached_google_calendar_events(
    user_id: int = 1,
    start_from: datetime | None = None,
    end_to: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[CalendarEventCache]:
    ensure_dev_user(db, user_id)
    query = select(CalendarEventCache).where(CalendarEventCache.user_id == user_id)
    if start_from is not None:
        query = query.where(CalendarEventCache.end_at > start_from)
    if end_to is not None:
        query = query.where(CalendarEventCache.start_at <= end_to)
    return list(db.scalars(query.order_by(CalendarEventCache.start_at.asc())).all())


def require_optional_account(db: Session, *, user_id: int):
    return get_account(db, user_id=user_id)


def _frontend_redirect(path: str, **query: str) -> RedirectResponse:
    base = settings.frontend_app_url.rstrip("/")
    params = urlencode(query)
    suffix = f"/{path}"
    if params:
        suffix += f"?{params}"
    return RedirectResponse(f"{base}{suffix}", status_code=status.HTTP_303_SEE_OTHER)
