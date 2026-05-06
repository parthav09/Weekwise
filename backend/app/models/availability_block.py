import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AvailabilityBlockType(str, enum.Enum):
    available = "available"
    blocked = "blocked"
    recovery = "recovery"


class LifeBlockCategory(str, enum.Enum):
    sleep = "sleep"
    workout = "workout"
    commute = "commute"
    meal = "meal"
    class_ = "class_"
    work = "work"
    social = "social"
    focus = "focus"
    free = "free"
    other = "other"


class AvailabilityBlock(Base):
    __tablename__ = "availability_blocks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    block_type: Mapped[AvailabilityBlockType] = mapped_column(
        Enum(AvailabilityBlockType), default=AvailabilityBlockType.available
    )
    category: Mapped[LifeBlockCategory] = mapped_column(
        Enum(LifeBlockCategory, name="lifeblockcategory"),
        default=LifeBlockCategory.other,
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recurrence_rule: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="availability_blocks")

