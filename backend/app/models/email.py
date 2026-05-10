import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.task import (
    TaskCategory,
    TaskEnergyLevel,
    TaskPriority,
    TaskScheduleFlexibility,
)


class ExtractedTaskCandidateStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class GmailAccount(Base):
    __tablename__ = "gmail_accounts"
    __table_args__ = (UniqueConstraint("user_id", name="uq_gmail_accounts_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(50), default="google")
    provider_account_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="gmail_accounts")


class EmailMessage(Base):
    __tablename__ = "email_messages"
    __table_args__ = (
        UniqueConstraint("user_id", "provider_message_id", name="uq_email_messages_provider"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider_message_id: Mapped[str] = mapped_column(String(255))
    provider_thread_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sender: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_extracted: Mapped[bool] = mapped_column(Boolean, default=False)
    extracted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="email_messages")
    candidates = relationship(
        "ExtractedTaskCandidate",
        back_populates="email_message",
        cascade="all, delete-orphan",
    )


class ExtractedTaskCandidate(Base):
    __tablename__ = "extracted_task_candidates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    email_message_id: Mapped[int] = mapped_column(
        ForeignKey("email_messages.id", ondelete="CASCADE")
    )
    status: Mapped[ExtractedTaskCandidateStatus] = mapped_column(
        Enum(ExtractedTaskCandidateStatus, name="extractedtaskcandidatestatus"),
        default=ExtractedTaskCandidateStatus.pending,
    )
    source: Mapped[str] = mapped_column(String(50), default="gmail")
    suggested_title: Mapped[str] = mapped_column(String(255))
    suggested_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, name="taskpriority"),
        default=TaskPriority.medium,
    )
    suggested_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    suggested_estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    suggested_energy_level: Mapped[TaskEnergyLevel] = mapped_column(
        Enum(TaskEnergyLevel, name="taskenergylevel"),
        default=TaskEnergyLevel.medium,
    )
    suggested_category: Mapped[TaskCategory] = mapped_column(
        Enum(TaskCategory, name="taskcategory"),
        default=TaskCategory.personal,
    )
    suggested_schedule_flexibility: Mapped[TaskScheduleFlexibility] = mapped_column(
        Enum(TaskScheduleFlexibility, name="taskscheduleflexibility"),
        default=TaskScheduleFlexibility.flexible,
    )
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="extracted_task_candidates")
    email_message = relationship("EmailMessage", back_populates="candidates")
    created_task = relationship("Task")
