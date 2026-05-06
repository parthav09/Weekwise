"""generated plan feedback loop

Revision ID: 20260505_0006
Revises: 20260506_0005
Create Date: 2026-05-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260505_0006"
down_revision: Union[str, None] = "20260506_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


plan_generator = postgresql.ENUM("rules", "ai", name="generatedplangenerator", create_type=False)
plan_scope = postgresql.ENUM("day", "week", name="generatedplanscope", create_type=False)
plan_item_status = postgresql.ENUM(
    "planned",
    "done",
    "skipped",
    "moved",
    "failed",
    name="generatedplanitemstatus",
    create_type=False,
)


def upgrade() -> None:
    plan_generator.create(op.get_bind(), checkfirst=True)
    plan_scope.create(op.get_bind(), checkfirst=True)
    plan_item_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "generated_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("scope", plan_scope, nullable=False),
        sa.Column("generator", plan_generator, nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("plan_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_generated_plans_id"), "generated_plans", ["id"], unique=False)
    op.create_index(
        "ix_generated_plans_user_start_end",
        "generated_plans",
        ["user_id", "start_at", "end_at"],
        unique=False,
    )

    op.create_table(
        "generated_plan_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("generated_plan_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["generated_plan_id"], ["generated_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_generated_plan_days_id"), "generated_plan_days", ["id"], unique=False)

    op.create_table(
        "generated_plan_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("generated_plan_id", sa.Integer(), nullable=False),
        sa.Column("generated_plan_day_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("item_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", plan_item_status, nullable=False),
        sa.Column("feedback_reason", sa.Text(), nullable=True),
        sa.Column("moved_to_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("moved_to_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["generated_plan_day_id"], ["generated_plan_days.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["generated_plan_id"], ["generated_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_generated_plan_items_id"), "generated_plan_items", ["id"], unique=False)
    op.create_index(
        "ix_generated_plan_items_plan_start",
        "generated_plan_items",
        ["generated_plan_id", "start_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_generated_plan_items_plan_start", table_name="generated_plan_items")
    op.drop_index(op.f("ix_generated_plan_items_id"), table_name="generated_plan_items")
    op.drop_table("generated_plan_items")
    op.drop_index(op.f("ix_generated_plan_days_id"), table_name="generated_plan_days")
    op.drop_table("generated_plan_days")
    op.drop_index("ix_generated_plans_user_start_end", table_name="generated_plans")
    op.drop_index(op.f("ix_generated_plans_id"), table_name="generated_plans")
    op.drop_table("generated_plans")

    plan_item_status.drop(op.get_bind(), checkfirst=True)
    plan_scope.drop(op.get_bind(), checkfirst=True)
    plan_generator.drop(op.get_bind(), checkfirst=True)
