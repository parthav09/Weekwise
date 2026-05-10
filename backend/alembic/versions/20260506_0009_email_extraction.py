"""email extraction

Revision ID: 20260506_0009
Revises: 20260506_0008
Create Date: 2026-05-06 00:09:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260506_0009"
down_revision: Union[str, None] = "20260506_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


candidate_status = postgresql.ENUM(
    "pending", "accepted", "rejected", name="extractedtaskcandidatestatus", create_type=False
)
task_priority = postgresql.ENUM(
    "low", "medium", "high", "urgent", name="taskpriority", create_type=False
)
task_energy_level = postgresql.ENUM(
    "low", "medium", "high", name="taskenergylevel", create_type=False
)
task_category = postgresql.ENUM(
    "school", "work", "fitness", "social", "errands", "personal", name="taskcategory", create_type=False
)
task_schedule_flexibility = postgresql.ENUM(
    "flexible", "fixed", name="taskscheduleflexibility", create_type=False
)


def upgrade() -> None:
    candidate_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "gmail_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("provider_account_email", sa.String(length=255), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_gmail_accounts_user"),
    )
    op.create_index(op.f("ix_gmail_accounts_id"), "gmail_accounts", ["id"], unique=False)

    op.create_table(
        "email_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider_message_id", sa.String(length=255), nullable=False),
        sa.Column("provider_thread_id", sa.String(length=255), nullable=True),
        sa.Column("sender", sa.String(length=255), nullable=True),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_extracted", sa.Boolean(), nullable=False),
        sa.Column("extracted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider_message_id", name="uq_email_messages_provider"),
    )
    op.create_index(op.f("ix_email_messages_id"), "email_messages", ["id"], unique=False)

    op.create_table(
        "extracted_task_candidates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("email_message_id", sa.Integer(), nullable=False),
        sa.Column("status", candidate_status, nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("suggested_title", sa.String(length=255), nullable=False),
        sa.Column("suggested_description", sa.Text(), nullable=True),
        sa.Column("suggested_priority", task_priority, nullable=False),
        sa.Column("suggested_due_date", sa.Date(), nullable=True),
        sa.Column("suggested_estimated_minutes", sa.Integer(), nullable=True),
        sa.Column("suggested_energy_level", task_energy_level, nullable=False),
        sa.Column("suggested_category", task_category, nullable=False),
        sa.Column("suggested_schedule_flexibility", task_schedule_flexibility, nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("created_task_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["email_message_id"], ["email_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_extracted_task_candidates_id"), "extracted_task_candidates", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_extracted_task_candidates_id"), table_name="extracted_task_candidates")
    op.drop_table("extracted_task_candidates")
    op.drop_index(op.f("ix_email_messages_id"), table_name="email_messages")
    op.drop_table("email_messages")
    op.drop_index(op.f("ix_gmail_accounts_id"), table_name="gmail_accounts")
    op.drop_table("gmail_accounts")
    candidate_status.drop(op.get_bind(), checkfirst=True)
