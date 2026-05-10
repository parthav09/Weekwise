from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from urllib import parse, request
from urllib.error import HTTPError, URLError

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.calendar import CalendarAccount


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


class GoogleCalendarError(RuntimeError):
    pass


def build_auth_url(*, user_id: int = 1) -> str:
    _require_oauth_config()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(settings.google_scopes),
        "access_type": "offline",
        "prompt": "consent",
        "state": str(user_id),
    }
    return f"{GOOGLE_AUTH_URL}?{parse.urlencode(params)}"


def exchange_code_for_account(db: Session, *, code: str, user_id: int) -> CalendarAccount:
    _require_oauth_config()
    token_data = _post_form(
        GOOGLE_TOKEN_URL,
        {
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    email = _fetch_account_email(token_data["access_token"])
    return _upsert_account(db, user_id=user_id, token_data=token_data, email=email)


def get_account(db: Session, *, user_id: int = 1) -> CalendarAccount | None:
    return db.scalar(
        select(CalendarAccount)
        .where(CalendarAccount.user_id == user_id)
        .where(CalendarAccount.provider == "google")
    )


def require_account(db: Session, *, user_id: int = 1) -> CalendarAccount:
    account = get_account(db, user_id=user_id)
    if account is None:
        raise HTTPException(status_code=400, detail="Google Calendar is not connected")
    return account


def access_token(db: Session, account: CalendarAccount) -> str:
    expires_at = account.token_expires_at
    now = datetime.now(timezone.utc)
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at is None or expires_at > now + timedelta(minutes=2):
        return account.access_token

    if not account.refresh_token:
        raise HTTPException(status_code=400, detail="Google Calendar refresh token is missing")

    token_data = _post_form(
        GOOGLE_TOKEN_URL,
        {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": account.refresh_token,
            "grant_type": "refresh_token",
        },
    )
    account.access_token = token_data["access_token"]
    account.token_expires_at = _expires_at(token_data.get("expires_in"))
    db.add(account)
    db.commit()
    db.refresh(account)
    return account.access_token


def list_events(
    db: Session,
    account: CalendarAccount,
    *,
    calendar_id: str,
    start_at: datetime,
    end_at: datetime,
) -> list[dict[str, Any]]:
    token = access_token(db, account)
    params = {
        "timeMin": _iso_z(start_at),
        "timeMax": _iso_z(end_at),
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": "2500",
    }
    url = (
        f"{GOOGLE_CALENDAR_API}/calendars/"
        f"{parse.quote(calendar_id, safe='')}/events?{parse.urlencode(params)}"
    )
    data = _get_json(url, token)
    return [item for item in data.get("items", []) if item.get("status") != "cancelled"]


def create_event(
    db: Session,
    account: CalendarAccount,
    *,
    calendar_id: str,
    title: str,
    start_at: datetime,
    end_at: datetime,
    metadata: dict[str, str],
) -> str:
    token = access_token(db, account)
    body = {
        "summary": title,
        "start": {"dateTime": start_at.isoformat()},
        "end": {"dateTime": end_at.isoformat()},
        "extendedProperties": {"private": metadata},
    }
    url = f"{GOOGLE_CALENDAR_API}/calendars/{parse.quote(calendar_id, safe='')}/events"
    data = _post_json(url, body, token)
    event_id = data.get("id")
    if not event_id:
        raise GoogleCalendarError("Google did not return an event id")
    return str(event_id)


def parse_google_event_time(event: dict[str, Any]) -> tuple[datetime, datetime, bool]:
    start = event.get("start") or {}
    end = event.get("end") or {}
    if start.get("dateTime") and end.get("dateTime"):
        return (
            datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00")),
            datetime.fromisoformat(end["dateTime"].replace("Z", "+00:00")),
            False,
        )
    if start.get("date") and end.get("date"):
        start_day = date.fromisoformat(start["date"])
        end_day = date.fromisoformat(end["date"])
        return (
            datetime.combine(start_day, time.min, tzinfo=timezone.utc),
            datetime.combine(end_day, time.min, tzinfo=timezone.utc),
            True,
        )
    raise GoogleCalendarError("Google event is missing start or end time")


def _require_oauth_config() -> None:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=500,
            detail="Google Calendar OAuth is not configured on the backend",
        )


def _upsert_account(
    db: Session,
    *,
    user_id: int,
    token_data: dict[str, Any],
    email: str | None,
) -> CalendarAccount:
    account = get_account(db, user_id=user_id)
    if account is None:
        account = CalendarAccount(
            user_id=user_id,
            provider="google",
            access_token=token_data["access_token"],
        )
    else:
        account.access_token = token_data["access_token"]

    account.provider_account_email = email
    if token_data.get("refresh_token"):
        account.refresh_token = token_data["refresh_token"]
    account.token_expires_at = _expires_at(token_data.get("expires_in"))
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _fetch_account_email(token: str) -> str | None:
    try:
        data = _get_json(GOOGLE_USERINFO_URL, token)
    except GoogleCalendarError:
        return None
    email = data.get("email")
    return str(email) if email else None


def _expires_at(expires_in: Any) -> datetime | None:
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None
    return datetime.now(timezone.utc) + timedelta(seconds=seconds)


def _iso_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _post_form(url: str, form: dict[str, Any]) -> dict[str, Any]:
    data = parse.urlencode({k: v for k, v in form.items() if v is not None}).encode()
    req = request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    return _read_json(req)


def _post_json(url: str, body: dict[str, Any], token: str) -> dict[str, Any]:
    req = request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    return _read_json(req)


def _get_json(url: str, token: str) -> dict[str, Any]:
    req = request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return _read_json(req)


def _read_json(req: request.Request) -> dict[str, Any]:
    try:
        with request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GoogleCalendarError(f"Google API error {exc.code}: {detail}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise GoogleCalendarError(f"Google API request failed: {exc}") from exc
