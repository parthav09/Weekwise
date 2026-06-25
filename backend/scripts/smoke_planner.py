"""Phase 5 smoke test for the rule-based planner.

Runs against an in-memory SQLite. Seeds:
  * One Sleep life block (recurring nightly)
  * One Urgent task due tomorrow
  * One Habit with target_count_per_week=3

Then asserts that the generated plan:
  - never overlaps the Sleep block,
  - schedules the urgent task on day 0 or 1,
  - ignores saved task clock times when choosing task slots,
  - distributes the habit across multiple days,
  - includes realistic planned meal blocks.

Run with:  python -m scripts.smoke_planner   (from backend/)
"""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: F401, E402  (register all mappers)
from app.core.database import Base  # noqa: E402
from app.models.availability_block import (  # noqa: E402
    AvailabilityBlock,
    AvailabilityBlockType,
    LifeBlockCategory,
)
from app.models.habit import Habit  # noqa: E402
from app.models.task import (  # noqa: E402
    Task,
    TaskPriority,
    TaskScheduleFlexibility,
    TaskStatus,
)
from app.models.user import User  # noqa: E402
from app.services.planner import generate_plan  # noqa: E402


def main() -> int:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    db = SessionLocal()
    try:
        user = User(id=1, name="Smoke", email="smoke@local")
        db.add(user)
        db.flush()

        # Anchor the test on a known Monday so weekday math is predictable.
        today = date(2026, 5, 4)
        start_at = datetime.combine(today, time(0), tzinfo=timezone.utc)
        end_at = start_at + timedelta(days=6, hours=23, minutes=59)

        sleep = AvailabilityBlock(
            user_id=1,
            title="Sleep",
            block_type=AvailabilityBlockType.blocked,
            category=LifeBlockCategory.sleep,
            start_time=datetime.combine(today, time(23, 0), tzinfo=timezone.utc),
            end_time=datetime.combine(today + timedelta(days=1), time(7, 0), tzinfo=timezone.utc),
            recurrence_rule="daily",
        )
        db.add(sleep)

        urgent = Task(
            user_id=1,
            title="Submit assignment",
            priority=TaskPriority.urgent,
            status=TaskStatus.todo,
            due_date=datetime.combine(today + timedelta(days=1), time(17, 0), tzinfo=timezone.utc),
            estimated_minutes=60,
            schedule_flexibility=TaskScheduleFlexibility.flexible,
        )
        db.add(urgent)

        fixed_time_task = Task(
            user_id=1,
            title="Draft project update",
            priority=TaskPriority.high,
            status=TaskStatus.todo,
            due_date=datetime.combine(today, time(21, 30), tzinfo=timezone.utc),
            estimated_minutes=30,
            schedule_flexibility=TaskScheduleFlexibility.fixed,
        )
        db.add(fixed_time_task)

        habit = Habit(
            user_id=1,
            title="Run",
            target_count_per_week=3,
            estimated_minutes=45,
            preferred_time_of_day="morning",
        )
        db.add(habit)
        db.commit()

        plan = generate_plan(
            db,
            user_id=1,
            start_at=start_at,
            end_at=end_at,
            day_window=(time(8), time(22)),
        )

        # --- Assertions ---
        all_blocks = [(d.date, b) for d in plan.days for b in d.blocks]
        task_blocks = [(d, b) for d, b in all_blocks if b.type == "task"]
        habit_blocks = [(d, b) for d, b in all_blocks if b.type == "habit"]
        meal_blocks = [(d, b) for d, b in all_blocks if b.type == "meal"]
        life_blocks = [(d, b) for d, b in all_blocks if b.type == "life"]

        assert task_blocks, "expected at least one task block"
        assert habit_blocks, "expected habit blocks"
        assert meal_blocks, "expected planned meal blocks"
        assert life_blocks, "expected life blocks (sleep)"

        # Sleep should never overlap scheduled blocks.
        for d, life in life_blocks:
            if life.metadata.get("category") != "sleep":
                continue
            for d2, other in task_blocks + habit_blocks + meal_blocks:
                if d2 != d:
                    continue
                overlap = not (other.end <= life.start or other.start >= life.end)
                assert not overlap, (
                    f"{other.type} '{other.title}' overlaps Sleep "
                    f"({other.start} - {other.end} vs {life.start} - {life.end})"
                )

        # Urgent task should land on day 0 or day 1.
        urgent_days = {d for d, b in task_blocks if b.title == "Submit assignment"}
        assert urgent_days, "urgent task wasn't scheduled"
        assert urgent_days <= {today, today + timedelta(days=1)}, (
            f"urgent task scheduled too late: {urgent_days}"
        )

        fixed_time_blocks = [b for _, b in task_blocks if b.title == "Draft project update"]
        assert fixed_time_blocks, "fixed-time task wasn't scheduled"
        assert fixed_time_blocks[0].start.time() != time(21, 30), (
            "task was pinned to saved due time instead of being planned"
        )

        # Habit should appear on >= 2 distinct days (target=3, week long).
        habit_days = {d for d, b in habit_blocks if b.title == "Run"}
        assert len(habit_days) >= 2, f"habit only appears on {habit_days}"

        # Meals should cover normal daily anchors.
        meal_types = {b.metadata.get("meal_type") for _, b in meal_blocks}
        assert {"breakfast", "lunch", "dinner"} <= meal_types, (
            f"missing expected meal anchors: {meal_types}"
        )

        # All task/habit/meal blocks fall inside the 8-22 day window.
        for _, b in task_blocks + habit_blocks + meal_blocks:
            assert b.start.hour >= 8 and b.end.hour <= 22, (
                f"block out of day window: {b.start} - {b.end}"
            )

        print("Smoke test PASSED")
        print(f"  notes: {plan.notes}")
        print(f"  task placements: {[(d.isoformat(), b.title) for d, b in task_blocks]}")
        print(f"  habit placements: {[(d.isoformat(), b.title, b.start.strftime('%H:%M')) for d, b in habit_blocks]}")
        print(f"  first-day meals: {[(b.metadata.get('meal_type'), b.title, b.start.strftime('%H:%M')) for d, b in meal_blocks if d == today]}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
