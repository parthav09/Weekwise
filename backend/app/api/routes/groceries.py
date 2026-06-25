from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.integrations.gmail.client import GmailError
from app.models.grocery import (
    GroceryList,
    GroceryListItem,
    GroceryListStatus,
    GroceryOrder,
)
from app.schemas.grocery import (
    GroceryListCreate,
    GroceryListItemCreate,
    GroceryListItemRead,
    GroceryListItemUpdate,
    GroceryListRead,
    GroceryListUpdate,
    GroceryOrderRead,
    GrocerySuggestRequest,
    GrocerySuggestResult,
    InstacartHandoff,
    InstacartReceiptSyncRequest,
    InstacartReceiptSyncResult,
    MealPlanRead,
    MealPlanRequest,
    MealPlanToGroceryListRequest,
    MealPlanToGroceryListResult,
    PantryRead,
)
from app.services.dev_user import ensure_dev_user
from app.services.grocery_suggester import GrocerySuggesterError, suggest_items_for_list
from app.services.instacart_handoff import build_handoff
from app.services.meal_planner import MealPlannerError, generate_weekly_meal_plan, meal_plan_to_grocery_list
from app.services.pantry import get_pantry
from app.services.receipt_parser import ReceiptParserError, sync_instacart_receipts_for_user

router = APIRouter(prefix="/groceries", tags=["groceries"])


@router.post("/orders/sync-instacart", response_model=InstacartReceiptSyncResult)
def sync_instacart_receipts(
    payload: InstacartReceiptSyncRequest,
    db: Session = Depends(get_db),
) -> InstacartReceiptSyncResult:
    ensure_dev_user(db, payload.user_id)
    try:
        return sync_instacart_receipts_for_user(db, user_id=payload.user_id)
    except (ReceiptParserError, GmailError) as exc:
        status_code = 503 if "GEMINI_API_KEY" in str(exc) else 502
        detail = str(exc)
        if "gmail.googleapis.com" in detail and "SERVICE_DISABLED" in detail:
            detail = (
                "Gmail API is disabled in your Google Cloud project. Enable the Gmail API "
                "for the project connected to GOOGLE_CLIENT_ID, wait a few minutes, then try again."
            )
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/orders", response_model=list[GroceryOrderRead])
def list_grocery_orders(user_id: int = 1, db: Session = Depends(get_db)) -> list[GroceryOrder]:
    ensure_dev_user(db, user_id)
    return list(
        db.scalars(
            select(GroceryOrder)
            .options(selectinload(GroceryOrder.items))
            .where(GroceryOrder.user_id == user_id)
            .order_by(GroceryOrder.ordered_at.desc())
        ).all()
    )


@router.get("/pantry", response_model=PantryRead)
def read_pantry(
    user_id: int = 1,
    lookback_days: int | None = None,
    db: Session = Depends(get_db),
) -> PantryRead:
    ensure_dev_user(db, user_id)
    return get_pantry(db, user_id=user_id, lookback_days=lookback_days)


@router.post("/meal-plan", response_model=MealPlanRead)
def create_meal_plan(payload: MealPlanRequest, db: Session = Depends(get_db)) -> MealPlanRead:
    ensure_dev_user(db, payload.user_id)
    try:
        return generate_weekly_meal_plan(
            db,
            user_id=payload.user_id,
            lookback_days=payload.lookback_days,
            start_at=payload.start_at,
        )
    except MealPlannerError as exc:
        status_code = 503 if "GEMINI_API_KEY" in str(exc) else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.post("/meal-plan/to-grocery-list", response_model=MealPlanToGroceryListResult)
def create_grocery_list_from_meal_plan(
    payload: MealPlanToGroceryListRequest,
    db: Session = Depends(get_db),
) -> MealPlanToGroceryListResult:
    ensure_dev_user(db, payload.user_id)
    try:
        result = meal_plan_to_grocery_list(
            db,
            user_id=payload.user_id,
            plan=payload.plan,
            title=payload.title,
        )
    except MealPlannerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return MealPlanToGroceryListResult(added_count=result.added_count, list=result.list)


@router.post("/lists", response_model=GroceryListRead, status_code=status.HTTP_201_CREATED)
def create_grocery_list(
    payload: GroceryListCreate, db: Session = Depends(get_db)
) -> GroceryList:
    ensure_dev_user(db, payload.user_id)
    grocery_list = GroceryList(**payload.model_dump())
    db.add(grocery_list)
    db.commit()
    return _get_list(db, grocery_list.id, user_id=payload.user_id)


@router.get("/lists", response_model=list[GroceryListRead])
def list_grocery_lists(
    user_id: int = 1,
    status: GroceryListStatus | None = None,
    db: Session = Depends(get_db),
) -> list[GroceryList]:
    ensure_dev_user(db, user_id)
    query = (
        select(GroceryList)
        .options(selectinload(GroceryList.items))
        .where(GroceryList.user_id == user_id)
        .order_by(GroceryList.created_at.desc())
    )
    if status is not None:
        query = query.where(GroceryList.status == status)
    return list(db.scalars(query).all())


@router.get("/lists/{list_id}", response_model=GroceryListRead)
def get_grocery_list(
    list_id: int, user_id: int = 1, db: Session = Depends(get_db)
) -> GroceryList:
    ensure_dev_user(db, user_id)
    return _get_list(db, list_id, user_id=user_id)


@router.patch("/lists/{list_id}", response_model=GroceryListRead)
def update_grocery_list(
    list_id: int,
    payload: GroceryListUpdate,
    user_id: int = 1,
    db: Session = Depends(get_db),
) -> GroceryList:
    ensure_dev_user(db, user_id)
    grocery_list = _get_list(db, list_id, user_id=user_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(grocery_list, field, value)
    db.add(grocery_list)
    db.commit()
    return _get_list(db, list_id, user_id=user_id)


@router.delete("/lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grocery_list(
    list_id: int, user_id: int = 1, db: Session = Depends(get_db)
) -> None:
    ensure_dev_user(db, user_id)
    grocery_list = _get_list(db, list_id, user_id=user_id)
    db.delete(grocery_list)
    db.commit()


@router.post(
    "/lists/{list_id}/items",
    response_model=GroceryListItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_grocery_item(
    list_id: int,
    payload: GroceryListItemCreate,
    user_id: int = 1,
    db: Session = Depends(get_db),
) -> GroceryListItem:
    ensure_dev_user(db, user_id)
    _get_editable_list(db, list_id, user_id=user_id)
    item = GroceryListItem(grocery_list_id=list_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/lists/{list_id}/items/{item_id}", response_model=GroceryListItemRead)
def update_grocery_item(
    list_id: int,
    item_id: int,
    payload: GroceryListItemUpdate,
    user_id: int = 1,
    db: Session = Depends(get_db),
) -> GroceryListItem:
    ensure_dev_user(db, user_id)
    _get_editable_list(db, list_id, user_id=user_id)
    item = _get_item(db, list_id, item_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/lists/{list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grocery_item(
    list_id: int,
    item_id: int,
    user_id: int = 1,
    db: Session = Depends(get_db),
) -> None:
    ensure_dev_user(db, user_id)
    _get_editable_list(db, list_id, user_id=user_id)
    item = _get_item(db, list_id, item_id)
    db.delete(item)
    db.commit()


@router.post("/lists/{list_id}/suggest", response_model=GrocerySuggestResult)
def suggest_grocery_items(
    list_id: int,
    payload: GrocerySuggestRequest,
    user_id: int = 1,
    db: Session = Depends(get_db),
) -> GrocerySuggestResult:
    ensure_dev_user(db, user_id)
    grocery_list = _get_editable_list(db, list_id, user_id=user_id)
    try:
        added = suggest_items_for_list(
            db,
            grocery_list=grocery_list,
            user_id=user_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
            generated_plan_id=payload.generated_plan_id,
        )
    except GrocerySuggesterError as exc:
        status_code = 503 if "GEMINI_API_KEY" in str(exc) else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    db.commit()
    return GrocerySuggestResult(
        added_count=len(added),
        list=_get_list(db, list_id, user_id=user_id),
    )


@router.get("/lists/{list_id}/handoff/instacart", response_model=InstacartHandoff)
def get_instacart_handoff(
    list_id: int, user_id: int = 1, db: Session = Depends(get_db)
) -> InstacartHandoff:
    ensure_dev_user(db, user_id)
    grocery_list = _get_list(db, list_id, user_id=user_id)
    return build_handoff(grocery_list)


def _get_list(db: Session, list_id: int, *, user_id: int) -> GroceryList:
    grocery_list = db.scalar(
        select(GroceryList)
        .options(selectinload(GroceryList.items))
        .where(GroceryList.id == list_id)
        .where(GroceryList.user_id == user_id)
    )
    if grocery_list is None:
        raise HTTPException(status_code=404, detail="Grocery list not found")
    return grocery_list


def _get_editable_list(db: Session, list_id: int, *, user_id: int) -> GroceryList:
    grocery_list = _get_list(db, list_id, user_id=user_id)
    if grocery_list.status in {GroceryListStatus.ordered, GroceryListStatus.archived}:
        raise HTTPException(
            status_code=409,
            detail="Ordered or archived grocery lists are read-only",
        )
    return grocery_list


def _get_item(db: Session, list_id: int, item_id: int) -> GroceryListItem:
    item = db.scalar(
        select(GroceryListItem)
        .where(GroceryListItem.id == item_id)
        .where(GroceryListItem.grocery_list_id == list_id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Grocery item not found")
    return item
