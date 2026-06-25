from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.integrations.notifications import email, inapp, web_push
from app.models.generated_plan import GeneratedPlanItem
from app.models.notification import (
    NotificationChannel,
    NotificationPreference,
    NotificationStatus,
    ScheduledNotification,
)
from app.models.user import User
from app.schemas.notification import NotificationDispatchResult, NotificationFailure


def _now() -> datetime:
    return datetime.now(UTC)


def _default_enabled(channel: NotificationChannel) -> bool:
    return channel == NotificationChannel.inapp


def _ensure_preferences(db: Session, user_id: int) -> list[NotificationPreference]:
    existing = {
        pref.channel: pref
        for pref in db.scalars(
            select(NotificationPreference).where(NotificationPreference.user_id == user_id)
        ).all()
    }
    for channel in NotificationChannel:
        if channel in existing:
            continue
        pref = NotificationPreference(
            user_id=user_id,
            channel=channel,
            enabled=_default_enabled(channel),
            default_lead_minutes=settings.notification_default_lead_minutes,
        )
        db.add(pref)
        existing[channel] = pref
    db.flush()
    return [existing[channel] for channel in NotificationChannel]


def get_or_create_preferences(db: Session, user_id: int = 1) -> list[NotificationPreference]:
    preferences = _ensure_preferences(db, user_id)
    db.commit()
    return preferences


def update_preference(
    db: Session,
    channel: NotificationChannel,
    enabled: bool | None = None,
    default_lead_minutes: int | None = None,
    user_id: int = 1,
) -> NotificationPreference:
    preferences = {pref.channel: pref for pref in _ensure_preferences(db, user_id)}
    preference = preferences[channel]
    if enabled is not None:
        preference.enabled = enabled
    if default_lead_minutes is not None:
        preference.default_lead_minutes = default_lead_minutes
    db.add(preference)
    db.commit()
    db.refresh(preference)
    return preference


def cancel_notifications_for_item(db: Session, item_id: int) -> int:
    notifications = db.scalars(
        select(ScheduledNotification).where(
            ScheduledNotification.generated_plan_item_id == item_id,
            ScheduledNotification.status == NotificationStatus.pending,
        )
    ).all()
    for notification in notifications:
        notification.status = NotificationStatus.cancelled
        notification.failure_reason = "Plan item was updated"
        db.add(notification)
    db.commit()
    return len(notifications)


def reschedule_notifications_for_item(
    db: Session,
    item: GeneratedPlanItem,
    lead_minutes: int | None = None,
) -> list[ScheduledNotification]:
    cancel_notifications_for_item(db, item.id)
    preferences = [pref for pref in _ensure_preferences(db, item.plan.user_id) if pref.enabled]
    created = _schedule_notifications_for_item(db, item, preferences, _now(), lead_minutes)
    db.commit()
    return created


def dispatch_due_notifications(
    db: Session,
    now: datetime | None = None,
) -> NotificationDispatchResult:
    dispatch_now = now or _now()
    due_notifications = db.scalars(
        select(ScheduledNotification)
        .options(
            selectinload(ScheduledNotification.user).selectinload(
                User.web_push_subscriptions
            )
        )
        .where(
            ScheduledNotification.status == NotificationStatus.pending,
            ScheduledNotification.send_at <= dispatch_now,
        )
        .order_by(ScheduledNotification.send_at)
    ).all()
    result = NotificationDispatchResult(pending_count=len(due_notifications))
    preferences_by_user = _preferences_by_user(db, {n.user_id for n in due_notifications})

    for notification in due_notifications:
        if not settings.notifications_enabled:
            _skip(notification, "Notifications are disabled")
            result.skipped_count += 1
            continue

        preference = preferences_by_user.get(notification.user_id, {}).get(notification.channel)
        if preference is not None and not preference.enabled:
            _skip(notification, f"{notification.channel.value} notifications are disabled")
            result.skipped_count += 1
            continue

        try:
            _dispatch(notification)
        except Exception as exc:
            notification.status = NotificationStatus.failed
            notification.failure_reason = str(exc)
            result.failed_count += 1
            result.failures.append(
                NotificationFailure(
                    notification_id=notification.id,
                    channel=notification.channel,
                    reason=str(exc),
                )
            )
        else:
            notification.status = NotificationStatus.sent
            notification.sent_at = dispatch_now
            notification.failure_reason = None
            result.sent_count += 1
        db.add(notification)

    db.commit()
    return result


def _schedule_notifications_for_item(
    db: Session,
    item: GeneratedPlanItem,
    preferences: list[NotificationPreference],
    now: datetime,
    lead_minutes: int | None,
) -> list[ScheduledNotification]:
    start_at = item.moved_to_start if item.moved_to_start and item.status.value == "moved" else item.start_at
    if start_at <= now:
        return []

    created: list[ScheduledNotification] = []
    for preference in preferences:
        minutes = lead_minutes if lead_minutes is not None else preference.default_lead_minutes
        send_at = max(now, start_at - timedelta(minutes=minutes))
        notification = ScheduledNotification(
            user_id=item.plan.user_id,
            generated_plan_item_id=item.id,
            channel=preference.channel,
            status=NotificationStatus.pending,
            send_at=send_at,
            title=f"Upcoming: {item.title}",
            body=f"{item.title} starts at {start_at.strftime('%-I:%M %p')}.",
            payload={
                "generated_plan_id": item.generated_plan_id,
                "generated_plan_item_id": item.id,
                "item_type": item.item_type,
                "start_at": start_at.isoformat(),
            },
        )
        db.add(notification)
        created.append(notification)
    db.flush()
    return created


def _preferences_by_user(
    db: Session, user_ids: set[int]
) -> dict[int, dict[NotificationChannel, NotificationPreference]]:
    if not user_ids:
        return {}
    rows = db.scalars(
        select(NotificationPreference).where(NotificationPreference.user_id.in_(user_ids))
    ).all()
    result: dict[int, dict[NotificationChannel, NotificationPreference]] = {}
    for row in rows:
        result.setdefault(row.user_id, {})[row.channel] = row
    return result


def _dispatch(notification: ScheduledNotification) -> None:
    if notification.channel == NotificationChannel.web_push:
        web_push.send(notification)
        return
    if notification.channel == NotificationChannel.email:
        email.send(notification)
        return
    if notification.channel == NotificationChannel.inapp:
        inapp.send(notification)
        return
    raise ValueError(f"Unsupported notification channel: {notification.channel}")


def _skip(notification: ScheduledNotification, reason: str) -> None:
    notification.status = NotificationStatus.skipped
    notification.failure_reason = reason
