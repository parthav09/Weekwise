from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.notification import (
    NotificationChannel,
    NotificationStatus,
    ScheduledNotification,
    WebPushSubscription,
)
from app.schemas.notification import (
    NotificationDispatchResult,
    PreferenceRead,
    PreferenceUpdate,
    ScheduledNotificationRead,
    WebPushSubscriptionCreate,
    WebPushSubscriptionRead,
)
from app.services.dev_user import ensure_dev_user
from app.services.notifications import (
    dispatch_due_notifications,
    get_or_create_preferences,
    update_preference,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/preferences", response_model=list[PreferenceRead])
def get_notification_preferences(
    user_id: int = 1, db: Session = Depends(get_db)
) -> list[PreferenceRead]:
    ensure_dev_user(db, user_id)
    return get_or_create_preferences(db, user_id)


@router.patch("/preferences/{channel}", response_model=PreferenceRead)
def patch_notification_preference(
    channel: NotificationChannel,
    payload: PreferenceUpdate,
    user_id: int = 1,
    db: Session = Depends(get_db),
) -> PreferenceRead:
    ensure_dev_user(db, user_id)
    return update_preference(
        db,
        channel=channel,
        enabled=payload.enabled,
        default_lead_minutes=payload.default_lead_minutes,
        user_id=user_id,
    )


@router.get("/web-push/public-key")
def get_web_push_public_key() -> dict[str, str | None]:
    return {"public_key": settings.web_push_vapid_public_key}


@router.get("/web-push/subscriptions", response_model=list[WebPushSubscriptionRead])
def list_web_push_subscriptions(
    user_id: int = 1, db: Session = Depends(get_db)
) -> list[WebPushSubscriptionRead]:
    ensure_dev_user(db, user_id)
    return db.scalars(
        select(WebPushSubscription)
        .where(WebPushSubscription.user_id == user_id)
        .order_by(WebPushSubscription.created_at.desc())
    ).all()


@router.post("/web-push/subscribe", response_model=WebPushSubscriptionRead)
def subscribe_to_web_push(
    payload: WebPushSubscriptionCreate,
    db: Session = Depends(get_db),
) -> WebPushSubscriptionRead:
    ensure_dev_user(db, payload.user_id)
    subscription = db.scalar(
        select(WebPushSubscription).where(WebPushSubscription.endpoint == payload.endpoint)
    )
    if subscription is None:
        subscription = WebPushSubscription(
            user_id=payload.user_id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
        )
    else:
        subscription.user_id = payload.user_id
        subscription.p256dh = payload.p256dh
        subscription.auth = payload.auth
    db.add(subscription)
    db.flush()
    update_preference(db, NotificationChannel.web_push, enabled=True, user_id=payload.user_id)
    db.refresh(subscription)
    return subscription


@router.delete("/web-push/{subscription_id}", status_code=204)
def delete_web_push_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
) -> Response:
    subscription = db.get(WebPushSubscription, subscription_id)
    if subscription is None:
        raise HTTPException(status_code=404, detail="Web push subscription not found")
    db.delete(subscription)
    db.commit()
    return Response(status_code=204)


@router.get("/scheduled", response_model=list[ScheduledNotificationRead])
def list_scheduled_notifications(
    user_id: int = 1,
    start_from: datetime | None = None,
    end_to: datetime | None = None,
    status: NotificationStatus | None = None,
    db: Session = Depends(get_db),
) -> list[ScheduledNotificationRead]:
    ensure_dev_user(db, user_id)
    query = (
        select(ScheduledNotification)
        .where(ScheduledNotification.user_id == user_id)
        .order_by(ScheduledNotification.send_at)
    )
    if start_from is not None:
        query = query.where(ScheduledNotification.send_at >= start_from)
    if end_to is not None:
        query = query.where(ScheduledNotification.send_at <= end_to)
    if status is not None:
        query = query.where(ScheduledNotification.status == status)
    return db.scalars(query).all()


@router.post("/run-dispatch", response_model=NotificationDispatchResult)
def run_notification_dispatch(
    now: datetime | None = None, db: Session = Depends(get_db)
) -> NotificationDispatchResult:
    return dispatch_due_notifications(db, now=now)
