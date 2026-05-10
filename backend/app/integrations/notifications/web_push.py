import json
from datetime import UTC, datetime

from app.core.config import settings
from app.models.notification import ScheduledNotification


class WebPushNotificationError(Exception):
    pass


def send(notification: ScheduledNotification) -> bool:
    if (
        not settings.web_push_vapid_public_key
        or not settings.web_push_vapid_private_key
        or not settings.web_push_contact_email
    ):
        raise WebPushNotificationError("Web push VAPID settings are not configured")
    if notification.user is None or not notification.user.web_push_subscriptions:
        raise WebPushNotificationError("No active web push subscriptions")

    try:
        from pywebpush import WebPushException, webpush
    except ImportError as exc:  # pragma: no cover - dependency may be optional locally.
        raise WebPushNotificationError("pywebpush is not installed") from exc

    payload = json.dumps(
        {
            "title": notification.title,
            "body": notification.body,
            "data": notification.payload or {},
        }
    )
    errors: list[str] = []
    delivered = 0
    for subscription in notification.user.web_push_subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=settings.web_push_vapid_private_key,
                vapid_claims={"sub": f"mailto:{settings.web_push_contact_email}"},
            )
            subscription.last_used_at = datetime.now(UTC)
            delivered += 1
        except WebPushException as exc:
            errors.append(str(exc))

    if delivered == 0:
        raise WebPushNotificationError("; ".join(errors) or "Web push delivery failed")

    return True
