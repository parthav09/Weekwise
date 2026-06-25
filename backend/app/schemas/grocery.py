from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.grocery import (
    GroceryItemCategory,
    GroceryItemStatus,
    GroceryListSource,
    GroceryListStatus,
    GroceryOrderItemStatus,
)


class GroceryListItemBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    quantity: float | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, max_length=32)
    category: GroceryItemCategory = GroceryItemCategory.other
    status: GroceryItemStatus = GroceryItemStatus.needed
    notes: str | None = None
    estimated_price: float | None = Field(default=None, ge=0)


class GroceryListItemCreate(GroceryListItemBase):
    pass


class GroceryListItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    quantity: float | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, max_length=32)
    category: GroceryItemCategory | None = None
    status: GroceryItemStatus | None = None
    notes: str | None = None
    estimated_price: float | None = Field(default=None, ge=0)


class GroceryListItemRead(GroceryListItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    grocery_list_id: int
    created_at: datetime
    updated_at: datetime


class GroceryListBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    status: GroceryListStatus = GroceryListStatus.draft
    source: GroceryListSource = GroceryListSource.manual
    generated_plan_id: int | None = None
    notes: str | None = None


class GroceryListCreate(GroceryListBase):
    user_id: int = 1


class GroceryListUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: GroceryListStatus | None = None
    source: GroceryListSource | None = None
    generated_plan_id: int | None = None
    notes: str | None = None


class GroceryListRead(GroceryListBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    items: list[GroceryListItemRead] = []
    created_at: datetime
    updated_at: datetime


class GroceryOrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    grocery_order_id: int
    name: str
    quantity: float | None
    unit: str | None
    unit_price: float | None
    line_total: float | None
    status: GroceryOrderItemStatus
    substitution_name: str | None
    created_at: datetime
    updated_at: datetime


class GroceryOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    grocery_list_id: int | None
    provider: str
    provider_order_id: str | None
    store_name: str | None
    ordered_at: datetime
    delivered_at: datetime | None
    subtotal: float | None
    tax: float | None
    tip: float | None
    delivery_fee: float | None
    total: float | None
    currency: str
    source_email_id: int | None
    notes: str | None
    items: list[GroceryOrderItemRead] = []
    created_at: datetime
    updated_at: datetime


class GrocerySuggestRequest(BaseModel):
    start_at: datetime | None = None
    end_at: datetime | None = None
    generated_plan_id: int | None = None


class GrocerySuggestResult(BaseModel):
    added_count: int
    list: GroceryListRead


class InstacartHandoff(BaseModel):
    url: str
    query: str
    item_names: list[str]


class InstacartReceiptSyncRequest(BaseModel):
    user_id: int = 1


class InstacartReceiptSyncResult(BaseModel):
    fetched_count: int
    new_order_count: int
    new_item_count: int
    skipped_count: int
    last_synced_at: datetime | None = None


class PantryItem(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None
    category: GroceryItemCategory = GroceryItemCategory.other
    last_purchased_at: datetime
    order_count: int = 1


class PantryRead(BaseModel):
    lookback_days: int
    item_count: int
    items: list[PantryItem] = []


class MealPlanRequest(BaseModel):
    user_id: int = 1
    lookback_days: int | None = Field(default=None, ge=1, le=365)
    start_at: datetime | None = None


class MealPlanIngredient(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None
    category: str = "other"
    on_hand: bool = False
    notes: str | None = None


class MealPlanMeal(BaseModel):
    title: str
    meal_type: str = "meal"
    ingredients: list[MealPlanIngredient] = []
    notes: str | None = None


class MealPlanDay(BaseModel):
    date: date
    label: str
    meals: list[MealPlanMeal] = []


class MealPlanRead(BaseModel):
    start_at: datetime
    end_at: datetime
    pantry_item_count: int
    days: list[MealPlanDay] = []


class MealPlanToGroceryListRequest(BaseModel):
    user_id: int = 1
    title: str | None = Field(default=None, max_length=255)
    plan: MealPlanRead


class MealPlanToGroceryListResult(BaseModel):
    added_count: int
    list: GroceryListRead
