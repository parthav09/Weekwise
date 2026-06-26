from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib import parse, request
from urllib.error import HTTPError, URLError

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.email import GmailAccount


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1"


class GmailError(RuntimeError):
    pass


def build_auth_url(*, user_id: int = 1) -> str:
    _require_oauth_config()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.gmail_redirect_uri,
        "response_type": "code",
        "scope": " ".join(settings.gmail_scope_list),
        "access_type": "offline",
        "prompt": "consent",
        "state": str(user_id),
    }
    return f"{GOOGLE_AUTH_URL}?{parse.urlencode(params)}"


def exchange_code_for_account(db: Session, *, code: str, user_id: int) -> GmailAccount:
    _require_oauth_config()
    token_data = _post_form(
        GOOGLE_TOKEN_URL,
        {
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.gmail_redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    email = _fetch_account_email(token_data["access_token"])
    return _upsert_account(db, user_id=user_id, token_data=token_data, email=email)


def get_account(db: Session, *, user_id: int = 1) -> GmailAccount | None:
    return db.scalar(select(GmailAccount).where(GmailAccount.user_id == user_id))


def require_account(db: Session, *, user_id: int = 1) -> GmailAccount:
    account = get_account(db, user_id=user_id)
    if account is None:
        raise HTTPException(status_code=400, detail="Gmail is not connected")
    return account


def access_token(db: Session, account: GmailAccount) -> str:
    expires_at = account.token_expires_at
    now = datetime.now(timezone.utc)
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at is None or expires_at > now + timedelta(minutes=2):
        return account.access_token

    if not account.refresh_token:
        raise HTTPException(status_code=400, detail="Gmail refresh token is missing")

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


def list_messages(
    db: Session,
    account: GmailAccount,
    *,
    lookback_days: int,
    max_messages: int,
) -> list[dict[str, Any]]:
    token = access_token(db, account)
    capped_max = max(1, min(max_messages, settings.gmail_sync_max_messages, 100))
    query = f"category:primary newer_than:{max(1, lookback_days)}d -is:chat -in:spam"
    params = {
        "q": query,
        "maxResults": str(capped_max),
    }
    url = f"{GMAIL_API}/users/me/messages?{parse.urlencode(params)}"
    data = _get_json(url, token)
    summaries = data.get("messages") or []
    messages: list[dict[str, Any]] = []
    for summary in summaries[:capped_max]:
        message_id = summary.get("id")
        if not message_id:
            continue
        messages.append(get_message_metadata(token, str(message_id)))
    return messages


def get_message_metadata(token: str, message_id: str) -> dict[str, Any]:
    params = [
        ("format", "metadata"),
        ("metadataHeaders", "From"),
        ("metadataHeaders", "Subject"),
        ("metadataHeaders", "Date"),
    ]
    url = f"{GMAIL_API}/users/me/messages/{parse.quote(message_id, safe='')}?{parse.urlencode(params)}"
    return _get_json(url, token)


def parse_message(raw: dict[str, Any]) -> dict[str, Any]:
    headers = {
        str(header.get("name", "")).lower(): str(header.get("value", ""))
        for header in (raw.get("payload") or {}).get("headers") or []
    }
    return {
        "provider_message_id": str(raw["id"]),
        "provider_thread_id": raw.get("threadId"),
        "sender": headers.get("from"),
        "subject": headers.get("subject"),
        "snippet": _truncate(raw.get("snippet"), 2_000),
        "received_at": _parse_received_at(headers.get("date")),
        "raw_payload": {
            "id": raw.get("id"),
            "threadId": raw.get("threadId"),
            "labelIds": raw.get("labelIds", []),
            "snippet": raw.get("snippet"),
        },
    }


def revoke_account(db: Session, account: GmailAccount) -> None:
    token = account.refresh_token or account.access_token
    if token:
        try:
            _post_form(GOOGLE_REVOKE_URL, {"token": token})
        except GmailError:
            pass
    db.delete(account)
    db.commit()


def _require_oauth_config() -> None:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth is not configured on the backend",
        )


def _upsert_account(
    db: Session,
    *,
    user_id: int,
    token_data: dict[str, Any],
    email: str | None,
) -> GmailAccount:
    account = get_account(db, user_id=user_id)
    if account is None:
        account = GmailAccount(
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
    except GmailError:
        return None
    email = data.get("email")
    return str(email) if email else None


def _expires_at(expires_in: Any) -> datetime | None:
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None
    return datetime.now(timezone.utc) + timedelta(seconds=seconds)


def _parse_received_at(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _truncate(value: Any, max_len: int) -> str | None:
    if value is None:
        return None
    return str(value)[:max_len]


def _post_form(url: str, form: dict[str, Any]) -> dict[str, Any]:
    data = parse.urlencode({k: v for k, v in form.items() if v is not None}).encode()
    req = request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    return _read_json(req)


def _get_json(url: str, token: str) -> dict[str, Any]:
    req = request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return _read_json(req)


def _read_json(req: request.Request) -> dict[str, Any]:
    try:
        with request.urlopen(req, timeout=20) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GmailError(f"Gmail API error {exc.code}: {detail}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise GmailError(f"Gmail API request failed: {exc}") from exc
