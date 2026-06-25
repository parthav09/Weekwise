import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TaskEnergyLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class TaskCategory(str, enum.Enum):
    school = "school"
    work = "work"
    fitness = "fitness"
    social = "social"
    errands = "errands"
    personal = "personal"


class TaskScheduleFlexibility(str, enum.Enum):
    flexible = "flexible"
    fixed = "fixed"


class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_user_status_due_date", "user_id", "status", "due_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority), default=TaskPriority.medium
    )
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), default=TaskStatus.todo)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    energy_level: Mapped[TaskEnergyLevel] = mapped_column(
        Enum(TaskEnergyLevel, name="taskenergylevel"),
        default=TaskEnergyLevel.medium,
    )
    category: Mapped[TaskCategory] = mapped_column(
        Enum(TaskCategory, name="taskcategory"),
        default=TaskCategory.personal,
    )
    schedule_flexibility: Mapped[TaskScheduleFlexibility] = mapped_column(
        Enum(TaskScheduleFlexibility, name="taskscheduleflexibility"),
        default=TaskScheduleFlexibility.flexible,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="tasks")
