from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CalendarAccount(Base):
    __tablename__ = "calendar_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_calendar_accounts_user_provider"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(50), default="google")
    provider_account_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="calendar_accounts")


class CalendarEventCache(Base):
    __tablename__ = "calendar_event_cache"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "calendar_id",
            "provider_event_id",
            name="uq_calendar_event_cache_provider_event",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider_event_id: Mapped[str] = mapped_column(String(255))
    calendar_id: Mapped[str] = mapped_column(String(255), default="primary")
    title: Mapped[str] = mapped_column(String(255))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_all_day: Mapped[bool] = mapped_column(default=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user = relationship("User", back_populates="calendar_event_cache")
