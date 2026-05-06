"""Phase 6 smoke test for the Gemini-backed AI planner.

Skips itself if GEMINI_API_KEY isn't set.

Otherwise: seeds the same fixture as scripts/smoke_planner.py (Sleep block,
Urgent task, Run habit) into an in-memory SQLite, calls generate_ai_plan, and
checks that:
  * generator == "ai"
  * no task or habit overlaps the Sleep window
  * the Urgent task is on day 0 or 1
  * the Run habit appears on at least 2 distinct days

Run with:  python -m scripts.smoke_ai_planner   (from backend/)
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
from app.core.config import settings  # noqa: E402
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
from app.services.ai_planner import generate_ai_plan  # noqa: E402


def main() -> int:
    if not settings.gemini_api_key:
        print("Skipped: GEMINI_API_KEY not set in backend/.env")
        return 0

    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    db = SessionLocal()
    try:
        db.add(User(id=1, name="Smoke", email="smoke@local"))
        db.flush()

        today = date(2026, 5, 4)  # known Monday
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

        habit = Habit(
            user_id=1,
            title="Run",
            target_count_per_week=3,
            estimated_minutes=45,
            preferred_time_of_day="morning",
        )
        db.add(habit)
        db.commit()

        plan = generate_ai_plan(
            db,
            user_id=1,
            start_at=start_at,
            end_at=end_at,
            day_window=(time(8), time(22)),
        )

        assert plan.generator == "ai", f"expected generator=ai, got {plan.generator}"

        all_blocks = [(d.date, b) for d in plan.days for b in d.blocks]
        task_blocks = [(d, b) for d, b in all_blocks if b.type == "task"]
        habit_blocks = [(d, b) for d, b in all_blocks if b.type == "habit"]
        life_blocks = [(d, b) for d, b in all_blocks if b.type == "life"]

        assert task_blocks, "AI returned no task blocks"
        assert habit_blocks, "AI returned no habit blocks"

        for d, life in life_blocks:
            for d2, other in task_blocks + habit_blocks:
                if d2 != d:
                    continue
                overlap = not (other.end <= life.start or other.start >= life.end)
                assert not overlap, (
                    f"{other.type} '{other.title}' overlaps life block "
                    f"({other.start}-{other.end} vs {life.start}-{life.end})"
                )

        urgent_days = {d for d, b in task_blocks if b.title.lower().startswith("submit")}
        assert urgent_days, "urgent task not scheduled"
        assert urgent_days <= {today, today + timedelta(days=1)}, (
            f"urgent task scheduled too late by AI: {urgent_days}"
        )

        run_days = {d for d, b in habit_blocks if b.title.lower().startswith("run")}
        assert len(run_days) >= 2, f"Run habit appears on {run_days}"

        print("AI smoke test PASSED")
        print(f"  generator: {plan.generator}")
        print(f"  notes: {plan.notes}")
        print(f"  task placements: {[(d.isoformat(), b.title, b.start.strftime('%a %H:%M')) for d, b in task_blocks]}")
        print(f"  habit placements: {[(d.isoformat(), b.title, b.start.strftime('%a %H:%M')) for d, b in habit_blocks]}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
