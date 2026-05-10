"""notifications

Revision ID: 20260506_0008
Revises: 20260506_0007
Create Date: 2026-05-06 00:08:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260506_0008"
down_revision: Union[str, None] = "20260506_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


notification_channel = postgresql.ENUM(
    "web_push", "email", "inapp", name="notificationchannel", create_type=False
)
notification_status = postgresql.ENUM(
    "pending",
    "sent",
    "failed",
    "skipped",
    "cancelled",
    name="notificationstatus",
    create_type=False,
)


def upgrade() -> None:
    op.execute("ALTER TYPE generatedplanitemstatus ADD VALUE IF NOT EXISTS 'cancelled'")
    notification_channel.create(op.get_bind(), checkfirst=True)
    notification_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("channel", notification_channel, nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("default_lead_minutes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "channel", name="uq_notification_preferences_user_channel"),
    )
    op.create_index(op.f("ix_notification_preferences_id"), "notification_preferences", ["id"], unique=False)

    op.create_table(
        "web_push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", name="uq_web_push_subscriptions_endpoint"),
    )
    op.create_index(op.f("ix_web_push_subscriptions_id"), "web_push_subscriptions", ["id"], unique=False)

    op.create_table(
        "scheduled_notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("generated_plan_item_id", sa.Integer(), nullable=True),
        sa.Column("channel", notification_channel, nullable=False),
        sa.Column("status", notification_status, nullable=False),
        sa.Column("send_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["generated_plan_item_id"], ["generated_plan_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scheduled_notifications_id"), "scheduled_notifications", ["id"], unique=False)
    op.create_index(op.f("ix_scheduled_notifications_send_at"), "scheduled_notifications", ["send_at"], unique=False)
    op.create_index(
        "ix_scheduled_notifications_user_status_send",
        "scheduled_notifications",
        ["user_id", "status", "send_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_scheduled_notifications_user_status_send", table_name="scheduled_notifications")
    op.drop_index(op.f("ix_scheduled_notifications_send_at"), table_name="scheduled_notifications")
    op.drop_index(op.f("ix_scheduled_notifications_id"), table_name="scheduled_notifications")
    op.drop_table("scheduled_notifications")
    op.drop_index(op.f("ix_web_push_subscriptions_id"), table_name="web_push_subscriptions")
    op.drop_table("web_push_subscriptions")
    op.drop_index(op.f("ix_notification_preferences_id"), table_name="notification_preferences")
    op.drop_table("notification_preferences")
    notification_status.drop(op.get_bind(), checkfirst=True)
    notification_channel.drop(op.get_bind(), checkfirst=True)
