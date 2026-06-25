from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.gmail.client import (
    GmailError,
    access_token,
    extract_plain_text,
    get_message_full,
    list_message_ids,
    parse_message,
    require_account,
)
from app.models.email import EmailMessage
from app.models.grocery import GroceryOrder, GroceryOrderItem, GroceryOrderItemStatus
from app.schemas.grocery import InstacartReceiptSyncResult
from app.services.instacart_receipt import parse_instacart_receipt


logger = logging.getLogger(__name__)


class ReceiptParserError(RuntimeError):
    pass


def sync_instacart_receipts_for_user(db: Session, *, user_id: int) -> InstacartReceiptSyncResult:
    account = require_account(db, user_id=user_id)
    token = access_token(db, account)
    query = _build_receipt_query()
    lookback = max(1, settings.receipt_sync_lookback_days)
    max_messages = max(1, min(settings.receipt_sync_max_messages, 100))

    message_ids = list_message_ids(
        token,
        query=query,
        max_results=max_messages,
    )

    new_orders = 0
    new_items = 0
    skipped = 0

    for message_id in message_ids:
        try:
            raw = get_message_full(token, message_id)
            parsed_meta = parse_message(raw)
            email = _upsert_email_message(db, user_id=user_id, parsed_meta=parsed_meta)

            if _order_exists_for_email(db, user_id=user_id, email_id=email.id):
                skipped += 1
                continue

            body_text = extract_plain_text(raw.get("payload"))
            if not body_text.strip():
                skipped += 1
                continue

            extracted = _extract_receipt(
                {
                    "sender": email.sender,
                    "subject": email.subject,
                    "received_at": email.received_at.isoformat(),
                    "body": body_text,
                }
            )
            if not extracted.get("is_receipt"):
                skipped += 1
                continue

            provider_order_id = _optional_text(extracted.get("provider_order_id"))
            if provider_order_id and _order_exists_for_provider(
                db,
                user_id=user_id,
                provider_order_id=provider_order_id,
            ):
                skipped += 1
                continue

            order, item_count = _persist_order(
                db,
                user_id=user_id,
                email=email,
                extracted=extracted,
            )
            if order is None:
                skipped += 1
                continue

            new_orders += 1
            new_items += item_count
        except (ReceiptParserError, GmailError) as exc:
            logger.warning("Receipt sync skipped message %s: %s", message_id, exc)
            skipped += 1

    account.last_synced_at = datetime.now(timezone.utc)
    db.add(account)
    db.commit()

    return InstacartReceiptSyncResult(
        fetched_count=len(message_ids),
        new_order_count=new_orders,
        new_item_count=new_items,
        skipped_count=skipped,
        last_synced_at=account.last_synced_at,
    )


def _build_receipt_query() -> str:
    senders = [
        part.strip()
        for part in settings.instacart_receipt_senders.replace(",", " ").split()
        if part.strip()
    ]
    if not senders:
        senders = ["instacart.com"]
    sender_query = " OR ".join(f"from:{sender}" for sender in senders)
    lookback = max(1, settings.receipt_sync_lookback_days)
    return f"({sender_query}) newer_than:{lookback}d receipt -is:chat -in:spam"


def _upsert_email_message(
    db: Session,
    *,
    user_id: int,
    parsed_meta: dict[str, Any],
) -> EmailMessage:
    message = db.scalar(
        select(EmailMessage)
        .where(EmailMessage.user_id == user_id)
        .where(EmailMessage.provider_message_id == parsed_meta["provider_message_id"])
    )
    if message is None:
        message = EmailMessage(user_id=user_id, **parsed_meta)
        db.add(message)
        db.flush()
        return message

    message.sender = parsed_meta.get("sender")
    message.subject = parsed_meta.get("subject")
    message.snippet = parsed_meta.get("snippet")
    message.received_at = parsed_meta["received_at"]
    db.add(message)
    db.flush()
    return message


def _order_exists_for_email(db: Session, *, user_id: int, email_id: int) -> bool:
    existing = db.scalar(
        select(GroceryOrder.id)
        .where(GroceryOrder.user_id == user_id)
        .where(GroceryOrder.source_email_id == email_id)
    )
    return existing is not None


def _order_exists_for_provider(
    db: Session,
    *,
    user_id: int,
    provider_order_id: str,
) -> bool:
    existing = db.scalar(
        select(GroceryOrder.id)
        .where(GroceryOrder.user_id == user_id)
        .where(GroceryOrder.provider == "instacart")
        .where(GroceryOrder.provider_order_id == provider_order_id)
    )
    return existing is not None


def _persist_order(
    db: Session,
    *,
    user_id: int,
    email: EmailMessage,
    extracted: dict[str, Any],
) -> tuple[GroceryOrder | None, int]:
    items = _parse_order_items(extracted.get("items"))
    if not items:
        return None, 0

    ordered_at = _parse_datetime(extracted.get("ordered_at")) or email.received_at
    order = GroceryOrder(
        user_id=user_id,
        provider="instacart",
        provider_order_id=_optional_text(extracted.get("provider_order_id")),
        store_name=_optional_text(extracted.get("store_name"), max_length=120),
        ordered_at=ordered_at,
        subtotal=_parse_money(extracted.get("subtotal")),
        tax=_parse_money(extracted.get("tax")),
        tip=_parse_money(extracted.get("tip")),
        delivery_fee=_parse_money(extracted.get("delivery_fee")),
        total=_parse_money(extracted.get("total")),
        currency=str(extracted.get("currency") or "USD")[:8],
        source_email_id=email.id,
        raw_payload=extracted,
    )
    db.add(order)
    db.flush()

    for item in items:
        db.add(
            GroceryOrderItem(
                grocery_order_id=order.id,
                name=item["name"],
                quantity=item.get("quantity"),
                unit=item.get("unit"),
                unit_price=item.get("unit_price"),
                line_total=item.get("line_total"),
                status=GroceryOrderItemStatus.ordered,
                substitution_name=item.get("substitution_name"),
            )
        )
    db.flush()
    return order, len(items)


def _parse_order_items(raw_items: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_items, list):
        return []
    parsed: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_items[:100]:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        parsed.append(
            {
                "name": name[:255],
                "quantity": _parse_quantity(raw.get("quantity")),
                "unit": _optional_text(raw.get("unit"), max_length=32),
                "unit_price": _parse_money(raw.get("unit_price")),
                "line_total": _parse_money(raw.get("line_total")),
                "substitution_name": _optional_text(raw.get("substitution_name"), max_length=255),
            }
        )
        seen.add(key)
    return parsed


_SYSTEM_PROMPT = """You extract Instacart grocery receipt data from email text for a personal planner.

Use only the provided sender, subject, received_at, and body fields.
Return JSON only.

Rules:
- Set is_receipt=true only when the email is clearly an Instacart order confirmation or receipt.
- provider_order_id should be the Instacart order id/number if present, else null.
- ordered_at should be ISO-8601 datetime when inferable from the email, else null.
- Monetary fields are numbers in USD unless another currency is explicit.
- items should include grocery line items only (not fees/tax/tip rows).
- quantity is a positive number or null; unit is short like ct, lb, oz, pack, bunch, or null.
- Include at most 100 items.
"""


def _extract_receipt(payload: dict[str, Any]) -> dict[str, Any]:
    # Primary path: deterministic parsing of the Instacart receipt layout. This
    # is free, instant, and unaffected by LLM rate limits / quota.
    deterministic = parse_instacart_receipt(payload)
    if deterministic and deterministic.get("items"):
        return deterministic

    # Fallback: only call the LLM when deterministic parsing came up empty and a
    # key is configured. Avoids burning quota on every message.
    if settings.gemini_api_key:
        try:
            raw = _call_gemini(payload)
            return _parse_json(raw)
        except ReceiptParserError as exc:
            logger.warning("Gemini receipt fallback failed: %s", exc)

    return {"is_receipt": False, "items": []}


def _call_gemini(payload: dict[str, Any]) -> str:
    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types
    except Exception as exc:  # noqa: BLE001
        raise ReceiptParserError(f"google-genai not installed: {exc}") from exc

    client = genai.Client(api_key=settings.gemini_api_key)
    max_attempts = 3
    last_error: Exception | None = None

    for attempt in range(max_attempts):
        try:
            response = client.models.generate_content(
                model=settings.email_extractor_model or settings.ai_planner_model,
                contents=[
                    _SYSTEM_PROMPT,
                    "Receipt email input:\n" + json.dumps(payload, ensure_ascii=False),
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=_receipt_response_schema(types),
                    temperature=0.1,
                ),
            )
        except genai_errors.APIError as exc:
            last_error = exc
            # Retry on rate-limit (429) with exponential backoff; fail fast otherwise.
            if exc.code == 429 and attempt < max_attempts - 1:
                time.sleep(2 ** attempt)
                continue
            raise ReceiptParserError(f"gemini api error: {exc.code}") from exc
        except Exception as exc:  # noqa: BLE001
            raise ReceiptParserError(f"gemini call failed: {type(exc).__name__}") from exc

        text = (response.text or "").strip()
        if not text:
            raise ReceiptParserError("gemini returned an empty response")
        return text

    raise ReceiptParserError(f"gemini api error: {getattr(last_error, 'code', 'unknown')}")


def _receipt_response_schema(types_mod):  # type: ignore[no-untyped-def]
    Type = types_mod.Type
    Schema = types_mod.Schema

    item_schema = Schema(
        type=Type.OBJECT,
        properties={
            "name": Schema(type=Type.STRING),
            "quantity": Schema(type=Type.NUMBER, nullable=True),
            "unit": Schema(type=Type.STRING, nullable=True),
            "unit_price": Schema(type=Type.NUMBER, nullable=True),
            "line_total": Schema(type=Type.NUMBER, nullable=True),
            "substitution_name": Schema(type=Type.STRING, nullable=True),
        },
        required=["name"],
    )

    return Schema(
        type=Type.OBJECT,
        properties={
            "is_receipt": Schema(type=Type.BOOLEAN),
            "provider_order_id": Schema(type=Type.STRING, nullable=True),
            "store_name": Schema(type=Type.STRING, nullable=True),
            "ordered_at": Schema(type=Type.STRING, nullable=True),
            "subtotal": Schema(type=Type.NUMBER, nullable=True),
            "tax": Schema(type=Type.NUMBER, nullable=True),
            "tip": Schema(type=Type.NUMBER, nullable=True),
            "delivery_fee": Schema(type=Type.NUMBER, nullable=True),
            "total": Schema(type=Type.NUMBER, nullable=True),
            "currency": Schema(type=Type.STRING, nullable=True),
            "items": Schema(type=Type.ARRAY, items=item_schema),
        },
        required=["is_receipt", "items"],
    )


def _parse_json(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ReceiptParserError(f"invalid JSON from gemini: {exc.msg}") from exc
    if not isinstance(data, dict):
        raise ReceiptParserError("gemini response was not an object")
    return data


def _optional_text(value: Any, *, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length] if max_length is not None else text


def _parse_money(value: Any) -> float | None:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount if amount >= 0 else None


def _parse_quantity(value: Any) -> float | None:
    try:
        quantity = float(value)
    except (TypeError, ValueError):
        return None
    return quantity if quantity > 0 else None


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
