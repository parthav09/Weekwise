"""life block categories (phase 4)

Revision ID: 20260506_0005
Revises: 20260505_0004
Create Date: 2026-05-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260506_0005"
down_revision: Union[str, None] = "20260505_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


life_block_category = postgresql.ENUM(
    "sleep",
    "workout",
    "commute",
    "meal",
    "class_",
    "work",
    "social",
    "focus",
    "free",
    "other",
    name="lifeblockcategory",
    create_type=False,
)


def upgrade() -> None:
    life_block_category.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "availability_blocks",
        sa.Column(
            "category",
            life_block_category,
            server_default=sa.text("'other'::lifeblockcategory"),
            nullable=False,
        ),
    )
    op.alter_column("availability_blocks", "category", server_default=None)


def downgrade() -> None:
    op.drop_column("availability_blocks", "category")
    life_block_category.drop(op.get_bind(), checkfirst=True)
