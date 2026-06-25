import enum
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, Float, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GroceryListStatus(str, enum.Enum):
    draft = "draft"
    shopping = "shopping"
    ordered = "ordered"
    archived = "archived"


class GroceryListSource(str, enum.Enum):
    manual = "manual"
    ai = "ai"
    plan = "plan"


class GroceryItemStatus(str, enum.Enum):
    needed = "needed"
    in_cart = "in_cart"
    purchased = "purchased"
    skipped = "skipped"


class GroceryItemCategory(str, enum.Enum):
    produce = "produce"
    dairy = "dairy"
    meat = "meat"
    pantry = "pantry"
    frozen = "frozen"
    beverages = "beverages"
    household = "household"
    other = "other"


class GroceryOrderItemStatus(str, enum.Enum):
    ordered = "ordered"
    substituted = "substituted"
    refunded = "refunded"


class GroceryList(Base):
    __tablename__ = "grocery_lists"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[GroceryListStatus] = mapped_column(
        Enum(GroceryListStatus, name="groceryliststatus"),
        default=GroceryListStatus.draft,
    )
    source: Mapped[GroceryListSource] = mapped_column(
        Enum(GroceryListSource, name="grocerylistsource"),
        default=GroceryListSource.manual,
    )
    generated_plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("generated_plans.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="grocery_lists")
    generated_plan = relationship("GeneratedPlan")
    items = relationship(
        "GroceryListItem",
        back_populates="grocery_list",
        cascade="all, delete-orphan",
        order_by="GroceryListItem.created_at",
    )
    orders = relationship("GroceryOrder", back_populates="grocery_list")


class GroceryListItem(Base):
    __tablename__ = "grocery_list_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    grocery_list_id: Mapped[int] = mapped_column(
        ForeignKey("grocery_lists.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    category: Mapped[GroceryItemCategory] = mapped_column(
        Enum(GroceryItemCategory, name="groceryitemcategory"),
        default=GroceryItemCategory.other,
    )
    status: Mapped[GroceryItemStatus] = mapped_column(
        Enum(GroceryItemStatus, name="groceryitemstatus"),
        default=GroceryItemStatus.needed,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    grocery_list = relationship("GroceryList", back_populates="items")


class GroceryOrder(Base):
    __tablename__ = "grocery_orders"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "provider",
            "provider_order_id",
            name="uq_grocery_orders_provider_order",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    grocery_list_id: Mapped[int | None] = mapped_column(
        ForeignKey("grocery_lists.id", ondelete="SET NULL"), nullable=True
    )
    provider: Mapped[str] = mapped_column(String(50), default="instacart")
    provider_order_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    store_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ordered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subtotal: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax: Mapped[float | None] = mapped_column(Float, nullable=True)
    tip: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivery_fee: Mapped[float | None] = mapped_column(Float, nullable=True)
    total: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    source_email_id: Mapped[int | None] = mapped_column(
        ForeignKey("email_messages.id", ondelete="SET NULL"), nullable=True
    )
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="grocery_orders")
    grocery_list = relationship("GroceryList", back_populates="orders")
    source_email = relationship("EmailMessage")
    items = relationship(
        "GroceryOrderItem",
        back_populates="grocery_order",
        cascade="all, delete-orphan",
        order_by="GroceryOrderItem.created_at",
    )


class GroceryOrderItem(Base):
    __tablename__ = "grocery_order_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    grocery_order_id: Mapped[int] = mapped_column(
        ForeignKey("grocery_orders.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    line_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[GroceryOrderItemStatus] = mapped_column(
        Enum(GroceryOrderItemStatus, name="groceryorderitemstatus"),
        default=GroceryOrderItemStatus.ordered,
    )
    substitution_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    grocery_order = relationship("GroceryOrder", back_populates="items")
