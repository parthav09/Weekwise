"""task planning metadata (phase 3)

Revision ID: 20260505_0004
Revises: 20260504_0003
Create Date: 2026-05-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260505_0004"
down_revision: Union[str, None] = "20260504_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


task_energy = postgresql.ENUM(
    "low", "medium", "high", name="taskenergylevel", create_type=False
)
task_category = postgresql.ENUM(
    "school",
    "work",
    "fitness",
    "social",
    "errands",
    "personal",
    name="taskcategory",
    create_type=False,
)
task_schedule = postgresql.ENUM(
    "flexible", "fixed", name="taskscheduleflexibility", create_type=False
)


def upgrade() -> None:
    op.execute("ALTER TYPE taskpriority ADD VALUE 'urgent'")

    task_energy.create(op.get_bind(), checkfirst=True)
    task_category.create(op.get_bind(), checkfirst=True)
    task_schedule.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "tasks",
        sa.Column(
            "energy_level",
            task_energy,
            server_default=sa.text("'medium'::taskenergylevel"),
            nullable=False,
        ),
    )
    op.add_column(
        "tasks",
        sa.Column(
            "category",
            task_category,
            server_default=sa.text("'personal'::taskcategory"),
            nullable=False,
        ),
    )
    op.add_column(
        "tasks",
        sa.Column(
            "schedule_flexibility",
            task_schedule,
            server_default=sa.text("'flexible'::taskscheduleflexibility"),
            nullable=False,
        ),
    )

    op.alter_column("tasks", "energy_level", server_default=None)
    op.alter_column("tasks", "category", server_default=None)
    op.alter_column("tasks", "schedule_flexibility", server_default=None)


def downgrade() -> None:
    op.drop_column("tasks", "schedule_flexibility")
    op.drop_column("tasks", "category")
    op.drop_column("tasks", "energy_level")

    task_schedule.drop(op.get_bind(), checkfirst=True)
    task_category.drop(op.get_bind(), checkfirst=True)
    task_energy.drop(op.get_bind(), checkfirst=True)
