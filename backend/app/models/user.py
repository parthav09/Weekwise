from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    habits = relationship("Habit", back_populates="user", cascade="all, delete-orphan")
    habit_completions = relationship(
        "HabitCompletion", back_populates="user", cascade="all, delete-orphan"
    )
    availability_blocks = relationship(
        "AvailabilityBlock", back_populates="user", cascade="all, delete-orphan"
    )
    generated_plans = relationship(
        "GeneratedPlan", back_populates="user", cascade="all, delete-orphan"
    )
    calendar_accounts = relationship(
        "CalendarAccount", back_populates="user", cascade="all, delete-orphan"
    )
    calendar_event_cache = relationship(
        "CalendarEventCache", back_populates="user", cascade="all, delete-orphan"
    )
    notification_preferences = relationship(
        "NotificationPreference", back_populates="user", cascade="all, delete-orphan"
    )
    web_push_subscriptions = relationship(
        "WebPushSubscription", back_populates="user", cascade="all, delete-orphan"
    )
    scheduled_notifications = relationship(
        "ScheduledNotification", back_populates="user", cascade="all, delete-orphan"
    )
    gmail_accounts = relationship(
        "GmailAccount", back_populates="user", cascade="all, delete-orphan"
    )
    email_messages = relationship(
        "EmailMessage", back_populates="user", cascade="all, delete-orphan"
    )
    extracted_task_candidates = relationship(
        "ExtractedTaskCandidate", back_populates="user", cascade="all, delete-orphan"
    )
    grocery_lists = relationship(
        "GroceryList", back_populates="user", cascade="all, delete-orphan"
    )
    grocery_orders = relationship(
        "GroceryOrder", back_populates="user", cascade="all, delete-orphan"
    )
