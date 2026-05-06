"""enforce one habit completion per day

Revision ID: 20260504_0003
Revises: 20260504_0002
Create Date: 2026-05-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260504_0003"
down_revision: Union[str, None] = "20260504_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("habit_completions", sa.Column("completed_on", sa.Date(), nullable=True))
    op.execute("UPDATE habit_completions SET completed_on = completed_at::date")
    op.execute(
        """
        DELETE FROM habit_completions duplicate
        USING habit_completions original
        WHERE duplicate.habit_id = original.habit_id
          AND duplicate.completed_on = original.completed_on
          AND duplicate.id > original.id
        """
    )
    op.alter_column("habit_completions", "completed_on", nullable=False)
    op.create_unique_constraint(
        "uq_habit_completions_habit_id_completed_on",
        "habit_completions",
        ["habit_id", "completed_on"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_habit_completions_habit_id_completed_on",
        "habit_completions",
        type_="unique",
    )
    op.drop_column("habit_completions", "completed_on")
