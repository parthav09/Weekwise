"""performance indexes

Revision ID: 20260513_0011
Revises: 20260513_0010
Create Date: 2026-05-13 00:11:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260513_0011"
down_revision: Union[str, None] = "20260513_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_tasks_user_status_due_date",
        "tasks",
        ["user_id", "status", "due_date"],
        unique=False,
    )
    op.create_index("ix_habits_user_id", "habits", ["user_id"], unique=False)
    op.create_index(
        "ix_habit_completions_user_completed_on",
        "habit_completions",
        ["user_id", "completed_on"],
        unique=False,
    )
    op.create_index(
        "ix_availability_blocks_user_start_end",
        "availability_blocks",
        ["user_id", "start_time", "end_time"],
        unique=False,
    )
    op.create_index(
        "ix_generated_plans_user_scope_window",
        "generated_plans",
        ["user_id", "scope", "start_at", "end_at"],
        unique=False,
    )
    op.create_index(
        "ix_generated_plan_days_plan_date",
        "generated_plan_days",
        ["generated_plan_id", "date"],
        unique=False,
    )
    op.create_index(
        "ix_generated_plan_items_day_start",
        "generated_plan_items",
        ["generated_plan_day_id", "start_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_generated_plan_items_day_start", table_name="generated_plan_items")
    op.drop_index("ix_generated_plan_days_plan_date", table_name="generated_plan_days")
    op.drop_index("ix_generated_plans_user_scope_window", table_name="generated_plans")
    op.drop_index("ix_availability_blocks_user_start_end", table_name="availability_blocks")
    op.drop_index("ix_habit_completions_user_completed_on", table_name="habit_completions")
    op.drop_index("ix_habits_user_id", table_name="habits")
    op.drop_index("ix_tasks_user_status_due_date", table_name="tasks")
