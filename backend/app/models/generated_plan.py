import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GeneratedPlanGenerator(str, enum.Enum):
    rules = "rules"
    ai = "ai"


class GeneratedPlanScope(str, enum.Enum):
    day = "day"
    week = "week"


class GeneratedPlanItemStatus(str, enum.Enum):
    planned = "planned"
    done = "done"
    skipped = "skipped"
    moved = "moved"
    failed = "failed"


class GeneratedPlan(Base):
    __tablename__ = "generated_plans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    scope: Mapped[GeneratedPlanScope] = mapped_column(Enum(GeneratedPlanScope))
    generator: Mapped[GeneratedPlanGenerator] = mapped_column(Enum(GeneratedPlanGenerator))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    notes: Mapped[list[str]] = mapped_column(JSON, default=list)
    plan_payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="generated_plans")
    days = relationship(
        "GeneratedPlanDay",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="GeneratedPlanDay.date",
    )
    items = relationship(
        "GeneratedPlanItem",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="GeneratedPlanItem.start_at",
    )


class GeneratedPlanDay(Base):
    __tablename__ = "generated_plan_days"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    generated_plan_id: Mapped[int] = mapped_column(
        ForeignKey("generated_plans.id", ondelete="CASCADE")
    )
    date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    plan = relationship("GeneratedPlan", back_populates="days")
    items = relationship(
        "GeneratedPlanItem",
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="GeneratedPlanItem.start_at",
    )


class GeneratedPlanItem(Base):
    __tablename__ = "generated_plan_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    generated_plan_id: Mapped[int] = mapped_column(
        ForeignKey("generated_plans.id", ondelete="CASCADE")
    )
    generated_plan_day_id: Mapped[int] = mapped_column(
        ForeignKey("generated_plan_days.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(255))
    item_type: Mapped[str] = mapped_column(String(50))
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[GeneratedPlanItemStatus] = mapped_column(
        Enum(GeneratedPlanItemStatus), default=GeneratedPlanItemStatus.planned
    )
    feedback_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    moved_to_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    moved_to_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    item_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    plan = relationship("GeneratedPlan", back_populates="items")
    day = relationship("GeneratedPlanDay", back_populates="items")
