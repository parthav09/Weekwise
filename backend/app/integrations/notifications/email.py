import smtplib
from email.message import EmailMessage

from app.core.config import settings
from app.models.notification import ScheduledNotification


class EmailNotificationError(Exception):
    pass


def send(notification: ScheduledNotification) -> bool:
    if not settings.smtp_host or not settings.smtp_port or not settings.smtp_from_email:
        raise EmailNotificationError("SMTP settings are not configured")
    if notification.user is None or not notification.user.email:
        raise EmailNotificationError("Notification user has no email address")

    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = notification.user.email
    message["Subject"] = notification.title
    message.set_content(notification.body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except Exception as exc:  # pragma: no cover - depends on external SMTP.
        raise EmailNotificationError(str(exc)) from exc

    return True
