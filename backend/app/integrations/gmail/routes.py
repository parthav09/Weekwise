from __future__ import annotations

import logging
from datetime import datetime, time, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.database import get_db
from app.integrations.gmail.client import (
    GmailError,
    build_auth_url,
    exchange_code_for_account,
    get_account,
    require_account,
    revoke_account,
)
from app.models.email import ExtractedTaskCandidate, ExtractedTaskCandidateStatus
from app.schemas.email import (
    ExtractedTaskCandidateAccept,
    ExtractedTaskCandidateRead,
    ExtractedTaskCandidateReject,
    GmailStatusRead,
    GmailSyncRequest,
    GmailSyncResult,
)
from app.schemas.task import TaskCreate, TaskRead
from app.services.dev_user import ensure_dev_user
from app.services.email_extractor import sync_gmail_for_user
from app.services.tasks import create_task_record

router = APIRouter(prefix="/integrations/gmail", tags=["integrations: gmail"])
logger = logging.getLogger(__name__)


@router.get("/status", response_model=GmailStatusRead)
def gmail_status(user_id: int = 1, db: Session = Depends(get_db)) -> GmailStatusRead:
    account = get_account(db, user_id=user_id)
    if account is None:
        return GmailStatusRead(connected=False)
    return GmailStatusRead(
        connected=True,
        provider_account_email=account.provider_account_email,
        token_expires_at=account.token_expires_at,
        last_synced_at=account.last_synced_at,
    )


@router.get("/connect")
def connect_gmail(user_id: int = 1) -> RedirectResponse:
    return RedirectResponse(build_auth_url(user_id=user_id))


@router.get("/callback")
def gmail_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if error:
        return _frontend_redirect("settings", gmail="error", detail=error)
    if not code:
        return _frontend_redirect("settings", gmail="error", detail="missing_code")

    try:
        user_id = int(state or "1")
    except ValueError:
        user_id = 1

    ensure_dev_user(db, user_id)
    try:
        exchange_code_for_account(db, code=code, user_id=user_id)
    except (GmailError, HTTPException) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        logger.warning("Gmail OAuth callback failed for user %s: %s", user_id, exc)
        return _frontend_redirect("settings", gmail="error", detail=str(detail))

    return _frontend_redirect("settings", gmail="connected")


@router.post("/sync", response_model=GmailSyncResult)
def sync_gmail(payload: GmailSyncRequest, db: Session = Depends(get_db)) -> GmailSyncResult:
    ensure_dev_user(db, payload.user_id)
    try:
        return sync_gmail_for_user(db, user_id=payload.user_id)
    except GmailError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/disconnect", status_code=204)
def disconnect_gmail(user_id: int = 1, db: Session = Depends(get_db)) -> Response:
    ensure_dev_user(db, user_id)
    account = require_account(db, user_id=user_id)
    revoke_account(db, account)
    return Response(status_code=204)


@router.get("/candidates", response_model=list[ExtractedTaskCandidateRead])
def list_extracted_task_candidates(
    user_id: int = 1,
    status: ExtractedTaskCandidateStatus | None = None,
    db: Session = Depends(get_db),
) -> list[ExtractedTaskCandidate]:
    ensure_dev_user(db, user_id)
    query = (
        select(ExtractedTaskCandidate)
        .options(selectinload(ExtractedTaskCandidate.email_message))
        .where(ExtractedTaskCandidate.user_id == user_id)
        .order_by(ExtractedTaskCandidate.created_at.desc())
    )
    if status is not None:
        query = query.where(ExtractedTaskCandidate.status == status)
    return list(db.scalars(query).all())


@router.post("/candidates/{candidate_id}/accept", response_model=TaskRead)
def accept_extracted_task_candidate(
    candidate_id: int,
    payload: ExtractedTaskCandidateAccept,
    user_id: int = 1,
    db: Session = Depends(get_db),
) -> TaskRead:
    ensure_dev_user(db, user_id)
    candidate = _get_candidate(db, candidate_id, user_id=user_id)
    if candidate.status == ExtractedTaskCandidateStatus.accepted and candidate.created_task_id:
        raise HTTPException(status_code=409, detail="Candidate was already accepted")

    task_payload = _task_payload_from_candidate(candidate, user_id=user_id, payload=payload)
    task = create_task_record(db, task_payload)
    candidate.status = ExtractedTaskCandidateStatus.accepted
    candidate.created_task_id = task.id
    db.add(candidate)
    db.commit()
    return task


@router.post("/candidates/{candidate_id}/reject", response_model=ExtractedTaskCandidateRead)
def reject_extracted_task_candidate(
    candidate_id: int,
    payload: ExtractedTaskCandidateReject,
    user_id: int = 1,
    db: Session = Depends(get_db),
) -> ExtractedTaskCandidate:
    ensure_dev_user(db, user_id)
    candidate = _get_candidate(db, candidate_id, user_id=user_id)
    candidate.status = ExtractedTaskCandidateStatus.rejected
    if payload.reason:
        candidate.rationale = (
            f"{candidate.rationale}\nRejected: {payload.reason}"
            if candidate.rationale
            else f"Rejected: {payload.reason}"
        )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def _get_candidate(
    db: Session, candidate_id: int, *, user_id: int
) -> ExtractedTaskCandidate:
    candidate = db.scalar(
        select(ExtractedTaskCandidate)
        .options(selectinload(ExtractedTaskCandidate.email_message))
        .where(ExtractedTaskCandidate.id == candidate_id)
        .where(ExtractedTaskCandidate.user_id == user_id)
    )
    if candidate is None:
        raise HTTPException(status_code=404, detail="Email task candidate not found")
    return candidate


def _task_payload_from_candidate(
    candidate: ExtractedTaskCandidate,
    *,
    user_id: int,
    payload: ExtractedTaskCandidateAccept,
) -> TaskCreate:
    due_date = None
    if candidate.suggested_due_date is not None:
        due_date = datetime.combine(candidate.suggested_due_date, time(12), tzinfo=timezone.utc)

    data = {
        "user_id": user_id,
        "title": candidate.suggested_title,
        "description": candidate.suggested_description,
        "priority": candidate.suggested_priority,
        "due_date": due_date,
        "estimated_minutes": candidate.suggested_estimated_minutes,
        "energy_level": candidate.suggested_energy_level,
        "category": candidate.suggested_category,
        "schedule_flexibility": candidate.suggested_schedule_flexibility,
    }
    if payload.overrides is not None:
        data.update(payload.overrides.model_dump(exclude_unset=True))
    return TaskCreate.model_validate(data)


def _frontend_redirect(path: str, **query: str) -> RedirectResponse:
    base = settings.frontend_app_url.rstrip("/")
    params = urlencode(query)
    suffix = f"/{path}"
    if params:
        suffix += f"?{params}"
    return RedirectResponse(f"{base}{suffix}", status_code=status.HTTP_303_SEE_OTHER)
