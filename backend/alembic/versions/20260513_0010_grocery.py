"""grocery planning

Revision ID: 20260513_0010
Revises: 20260506_0009
Create Date: 2026-05-13 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260513_0010"
down_revision: Union[str, None] = "20260506_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


grocery_list_status = postgresql.ENUM(
    "draft", "shopping", "ordered", "archived", name="groceryliststatus", create_type=False
)
grocery_list_source = postgresql.ENUM(
    "manual", "ai", "plan", name="grocerylistsource", create_type=False
)
grocery_item_status = postgresql.ENUM(
    "needed", "in_cart", "purchased", "skipped", name="groceryitemstatus", create_type=False
)
grocery_item_category = postgresql.ENUM(
    "produce",
    "dairy",
    "meat",
    "pantry",
    "frozen",
    "beverages",
    "household",
    "other",
    name="groceryitemcategory",
    create_type=False,
)
grocery_order_item_status = postgresql.ENUM(
    "ordered", "substituted", "refunded", name="groceryorderitemstatus", create_type=False
)


def upgrade() -> None:
    grocery_list_status.create(op.get_bind(), checkfirst=True)
    grocery_list_source.create(op.get_bind(), checkfirst=True)
    grocery_item_status.create(op.get_bind(), checkfirst=True)
    grocery_item_category.create(op.get_bind(), checkfirst=True)
    grocery_order_item_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "grocery_lists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("status", grocery_list_status, nullable=False),
        sa.Column("source", grocery_list_source, nullable=False),
        sa.Column("generated_plan_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["generated_plan_id"], ["generated_plans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_grocery_lists_id"), "grocery_lists", ["id"], unique=False)
    op.create_index(op.f("ix_grocery_lists_user_id"), "grocery_lists", ["user_id"], unique=False)

    op.create_table(
        "grocery_list_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("grocery_list_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("category", grocery_item_category, nullable=False),
        sa.Column("status", grocery_item_status, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("estimated_price", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["grocery_list_id"], ["grocery_lists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_grocery_list_items_id"), "grocery_list_items", ["id"], unique=False)
    op.create_index(
        op.f("ix_grocery_list_items_grocery_list_id"),
        "grocery_list_items",
        ["grocery_list_id"],
        unique=False,
    )

    op.create_table(
        "grocery_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("grocery_list_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("provider_order_id", sa.String(length=255), nullable=True),
        sa.Column("store_name", sa.String(length=120), nullable=True),
        sa.Column("ordered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("subtotal", sa.Float(), nullable=True),
        sa.Column("tax", sa.Float(), nullable=True),
        sa.Column("tip", sa.Float(), nullable=True),
        sa.Column("delivery_fee", sa.Float(), nullable=True),
        sa.Column("total", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("source_email_id", sa.Integer(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["grocery_list_id"], ["grocery_lists.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_email_id"], ["email_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", "provider_order_id", name="uq_grocery_orders_provider_order"),
    )
    op.create_index(op.f("ix_grocery_orders_id"), "grocery_orders", ["id"], unique=False)
    op.create_index(op.f("ix_grocery_orders_user_id"), "grocery_orders", ["user_id"], unique=False)

    op.create_table(
        "grocery_order_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("grocery_order_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("unit_price", sa.Float(), nullable=True),
        sa.Column("line_total", sa.Float(), nullable=True),
        sa.Column("status", grocery_order_item_status, nullable=False),
        sa.Column("substitution_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["grocery_order_id"], ["grocery_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_grocery_order_items_id"), "grocery_order_items", ["id"], unique=False)
    op.create_index(
        op.f("ix_grocery_order_items_grocery_order_id"),
        "grocery_order_items",
        ["grocery_order_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_grocery_order_items_grocery_order_id"), table_name="grocery_order_items")
    op.drop_index(op.f("ix_grocery_order_items_id"), table_name="grocery_order_items")
    op.drop_table("grocery_order_items")
    op.drop_index(op.f("ix_grocery_orders_user_id"), table_name="grocery_orders")
    op.drop_index(op.f("ix_grocery_orders_id"), table_name="grocery_orders")
    op.drop_table("grocery_orders")
    op.drop_index(op.f("ix_grocery_list_items_grocery_list_id"), table_name="grocery_list_items")
    op.drop_index(op.f("ix_grocery_list_items_id"), table_name="grocery_list_items")
    op.drop_table("grocery_list_items")
    op.drop_index(op.f("ix_grocery_lists_user_id"), table_name="grocery_lists")
    op.drop_index(op.f("ix_grocery_lists_id"), table_name="grocery_lists")
    op.drop_table("grocery_lists")
    grocery_order_item_status.drop(op.get_bind(), checkfirst=True)
    grocery_item_category.drop(op.get_bind(), checkfirst=True)
    grocery_item_status.drop(op.get_bind(), checkfirst=True)
    grocery_list_source.drop(op.get_bind(), checkfirst=True)
    grocery_list_status.drop(op.get_bind(), checkfirst=True)
