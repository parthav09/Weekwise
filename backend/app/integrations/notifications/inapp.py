from app.models.notification import ScheduledNotification


class InAppNotificationError(Exception):
    pass


def send(notification: ScheduledNotification) -> bool:
    notification.payload = {
        **(notification.payload or {}),
        "inapp_delivered": True,
    }
    return True
