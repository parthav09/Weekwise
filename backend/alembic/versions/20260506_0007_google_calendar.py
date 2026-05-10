"""google calendar integration

Revision ID: 20260506_0007
Revises: 20260505_0006
Create Date: 2026-05-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260506_0007"
down_revision: Union[str, None] = "20260505_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calendar_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("provider_account_email", sa.String(length=255), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_calendar_accounts_user_provider"),
    )
    op.create_index(op.f("ix_calendar_accounts_id"), "calendar_accounts", ["id"], unique=False)

    op.create_table(
        "calendar_event_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider_event_id", sa.String(length=255), nullable=False),
        sa.Column("calendar_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_all_day", sa.Boolean(), nullable=False),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "calendar_id",
            "provider_event_id",
            name="uq_calendar_event_cache_provider_event",
        ),
    )
    op.create_index(op.f("ix_calendar_event_cache_id"), "calendar_event_cache", ["id"], unique=False)
    op.create_index(
        "ix_calendar_event_cache_user_start_end",
        "calendar_event_cache",
        ["user_id", "start_at", "end_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_event_cache_user_start_end", table_name="calendar_event_cache")
    op.drop_index(op.f("ix_calendar_event_cache_id"), table_name="calendar_event_cache")
    op.drop_table("calendar_event_cache")
    op.drop_index(op.f("ix_calendar_accounts_id"), table_name="calendar_accounts")
    op.drop_table("calendar_accounts")
