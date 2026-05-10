from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.gmail.client import (
    GmailError,
    list_messages,
    parse_message,
    require_account,
)
from app.models.email import EmailMessage, ExtractedTaskCandidate
from app.models.task import (
    TaskCategory,
    TaskEnergyLevel,
    TaskPriority,
    TaskScheduleFlexibility,
)
from app.schemas.email import GmailSyncResult


logger = logging.getLogger(__name__)


class EmailExtractorError(RuntimeError):
    pass


def sync_gmail_for_user(db: Session, *, user_id: int) -> GmailSyncResult:
    account = require_account(db, user_id=user_id)
    raw_messages = list_messages(
        db,
        account,
        lookback_days=settings.gmail_sync_lookback_days,
        max_messages=settings.gmail_sync_max_messages,
    )

    new_email_count = 0
    candidate_count = 0
    now = datetime.now(timezone.utc)

    for raw in raw_messages:
        try:
            parsed = parse_message(raw)
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Skipping malformed Gmail message: %s", exc)
            continue

        message = db.scalar(
            select(EmailMessage)
            .where(EmailMessage.user_id == user_id)
            .where(EmailMessage.provider_message_id == parsed["provider_message_id"])
        )
        is_new = message is None
        if message is None:
            message = EmailMessage(user_id=user_id, **parsed)
            db.add(message)
            db.flush()
            new_email_count += 1

        if message.is_extracted:
            continue

        try:
            candidates = extract_candidates_from_message(db, user_id=user_id, email=message)
        except (EmailExtractorError, GmailError) as exc:
            logger.warning("Email extraction failed for message %s: %s", message.id, exc)
            candidates = []
        candidate_count += len(candidates)
        message.is_extracted = True
        message.extracted_at = now
        db.add(message)

        if is_new:
            db.flush()

    account.last_synced_at = now
    db.add(account)
    db.commit()
    return GmailSyncResult(
        fetched_count=len(raw_messages),
        new_email_count=new_email_count,
        candidate_count=candidate_count,
    )


def extract_candidates_from_message(
    db: Session,
    *,
    user_id: int,
    email: EmailMessage,
) -> list[ExtractedTaskCandidate]:
    payload = {
        "today": date.today().isoformat(),
        "email": {
            "sender": email.sender,
            "subject": email.subject,
            "snippet": email.snippet,
            "received_at": email.received_at.isoformat(),
        },
    }
    raw = _call_gemini(payload)
    data = _parse_json(raw)
    if not data.get("is_actionable"):
        return []

    candidates: list[ExtractedTaskCandidate] = []
    for raw_candidate in (data.get("candidates") or [])[:3]:
        candidate = _candidate_from_payload(
            raw_candidate,
            user_id=user_id,
            email_message_id=email.id,
        )
        if candidate is None:
            continue
        db.add(candidate)
        candidates.append(candidate)
    db.flush()
    return candidates


_SYSTEM_PROMPT = """You extract task candidates from email metadata for a personal planner.

Use only the provided sender, subject, snippet, received_at, and today fields.
Return JSON only.

Rules:
- If the email is not actionable for the user, return {"is_actionable": false, "candidates": []}.
- Never invent facts not implied by the snippet.
- Create at most 3 candidates.
- Keep titles short and concrete.
- due_date must be YYYY-MM-DD or null.
- estimated_minutes should be a realistic integer or null.
- priority must be one of: low, medium, high, urgent.
- category must be one of: school, work, fitness, social, errands, personal.
- energy_level must be one of: low, medium, high.
- schedule_flexibility must be one of: flexible, fixed.
- confidence is a number from 0 to 1.
"""


def _call_gemini(payload: dict[str, Any]) -> str:
    if not settings.gemini_api_key:
        raise EmailExtractorError("no GEMINI_API_KEY configured")

    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types
    except Exception as exc:  # noqa: BLE001
        raise EmailExtractorError(f"google-genai not installed: {exc}") from exc

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.email_extractor_model or settings.ai_planner_model,
            contents=[
                _SYSTEM_PROMPT,
                "Email input:\n" + json.dumps(payload, ensure_ascii=False),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_extractor_response_schema(types),
                temperature=0.1,
            ),
        )
    except genai_errors.APIError as exc:
        raise EmailExtractorError(f"gemini api error: {exc.code}") from exc
    except Exception as exc:  # noqa: BLE001
        raise EmailExtractorError(f"gemini call failed: {type(exc).__name__}") from exc

    text = (response.text or "").strip()
    if not text:
        raise EmailExtractorError("gemini returned an empty response")
    return text


def _extractor_response_schema(types_mod):  # type: ignore[no-untyped-def]
    Type = types_mod.Type
    Schema = types_mod.Schema

    candidate_schema = Schema(
        type=Type.OBJECT,
        properties={
            "title": Schema(type=Type.STRING),
            "description": Schema(type=Type.STRING, nullable=True),
            "priority": Schema(type=Type.STRING, enum=["low", "medium", "high", "urgent"]),
            "category": Schema(
                type=Type.STRING,
                enum=["school", "work", "fitness", "social", "errands", "personal"],
            ),
            "energy_level": Schema(type=Type.STRING, enum=["low", "medium", "high"]),
            "schedule_flexibility": Schema(type=Type.STRING, enum=["flexible", "fixed"]),
            "estimated_minutes": Schema(type=Type.INTEGER, nullable=True),
            "due_date": Schema(type=Type.STRING, nullable=True),
            "confidence": Schema(type=Type.NUMBER, nullable=True),
            "rationale": Schema(type=Type.STRING, nullable=True),
        },
        required=["title"],
    )

    return Schema(
        type=Type.OBJECT,
        properties={
            "is_actionable": Schema(type=Type.BOOLEAN),
            "candidates": Schema(type=Type.ARRAY, items=candidate_schema),
        },
        required=["is_actionable", "candidates"],
    )


def _parse_json(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise EmailExtractorError(f"invalid JSON from gemini: {exc.msg}") from exc
    if not isinstance(data, dict):
        raise EmailExtractorError("gemini response was not an object")
    return data


def _candidate_from_payload(
    data: Any,
    *,
    user_id: int,
    email_message_id: int,
) -> ExtractedTaskCandidate | None:
    if not isinstance(data, dict):
        return None
    title = str(data.get("title") or "").strip()
    if not title:
        return None
    try:
        priority = TaskPriority(str(data.get("priority") or TaskPriority.medium.value))
        category = TaskCategory(str(data.get("category") or TaskCategory.personal.value))
        energy_level = TaskEnergyLevel(
            str(data.get("energy_level") or TaskEnergyLevel.medium.value)
        )
        flexibility = TaskScheduleFlexibility(
            str(data.get("schedule_flexibility") or TaskScheduleFlexibility.flexible.value)
        )
    except ValueError:
        return None

    due_date = _parse_due_date(data.get("due_date"))
    minutes = _parse_minutes(data.get("estimated_minutes"))
    confidence = _parse_confidence(data.get("confidence"))

    return ExtractedTaskCandidate(
        user_id=user_id,
        email_message_id=email_message_id,
        suggested_title=title[:255],
        suggested_description=_optional_text(data.get("description")),
        suggested_priority=priority,
        suggested_due_date=due_date,
        suggested_estimated_minutes=minutes,
        suggested_energy_level=energy_level,
        suggested_category=category,
        suggested_schedule_flexibility=flexibility,
        confidence=confidence,
        rationale=_optional_text(data.get("rationale")),
    )


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_due_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _parse_minutes(value: Any) -> int | None:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return None
    return minutes if minutes >= 1 else None


def _parse_confidence(value: Any) -> float | None:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return None
    return min(1.0, max(0.0, confidence))
