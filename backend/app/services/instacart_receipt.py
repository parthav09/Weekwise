"""Deterministic parser for Instacart order-confirmation / receipt emails.

Instacart receipts are machine-generated and follow a stable layout, so we can
extract line items, totals, and metadata with plain string/regex parsing. This
runs first (free, instant, no API quota) before falling back to an LLM.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

# Quantity line, e.g. "2 x $2.76" or "4.58 lb x $1.08".
_QTY_LINE = re.compile(
    r"(?P<qty>\d+(?:\.\d+)?)\s*(?P<unit>lb|lbs|oz|kg|g|ct|pack|bunch|each)?\s*x\s*\$\s*(?P<price>\d+(?:\.\d+)?)",
    re.IGNORECASE,
)

# Money amount, e.g. "$5.52".
_MONEY = re.compile(r"\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)")

# Trailing pack size in a product name, e.g. "(18 oz)" / "(3 lb)" / "(~ 0.75 lb)".
_SIZE_SUFFIX = re.compile(r"\s*\((?:~\s*)?[\d.]+\s*[a-zA-Z]+\)\s*$")

# Store name from "Your order from Walmart was placed ..." / "Items found (Walmart)".
_STORE_FROM = re.compile(r"order from\s+(.+?)\s+was\s+(?:placed|delivered)", re.IGNORECASE)
_STORE_PARENS = re.compile(r"items?\s+found\s*\((.+?)\)", re.IGNORECASE)

_DATE_PLACED = re.compile(
    r"placed on\s+([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})",
    re.IGNORECASE,
)
_DATE_DELIVERED = re.compile(
    r"delivered (?:on\s+)?([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})",
    re.IGNORECASE,
)

# Lines that are never product names (section headers, totals, boilerplate).
_NAME_BLOCKLIST = (
    "final item price",
    "subtotal",
    "adjustment",
    "items found",
    "item found",
    "items subtotal",
    "weight adjustment",
    "replacement",
    "your order",
    "order total",
    "service fee",
    "checkout bag",
    "delivery",
    "tip",
    "total",
    "instacart",
    "rate your order",
    "get help",
    "charges",
    "original charge",
    "temporarily authorized",
    "learn more",
    "member",
    "promotional",
    "terms apply",
    "invite friends",
    "share",
)

# Provider order id, best-effort. Instacart uses a few label variants.
_ORDER_ID = re.compile(r"order\s*(?:#|number|id)\s*[:#]?\s*([A-Za-z0-9-]{4,})", re.IGNORECASE)

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def parse_instacart_receipt(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Parse an Instacart receipt email body into the extraction dict shape.

    Returns ``None`` when the email does not look like an Instacart receipt or
    no line items could be found, signalling the caller to try another method.
    """
    body = str(payload.get("body") or "")
    sender = str(payload.get("sender") or "").lower()
    subject = str(payload.get("subject") or "").lower()

    if not body.strip():
        return None

    looks_instacart = (
        "instacart" in sender
        or "instacart" in subject
        or "instacart" in body.lower()
    )
    if not looks_instacart:
        return None

    lines = [line.strip() for line in body.splitlines()]
    items = _extract_items(lines)
    if not items:
        return None

    return {
        "is_receipt": True,
        "provider_order_id": _extract_order_id(body),
        "store_name": _extract_store_name(body),
        "ordered_at": _extract_ordered_at(body),
        "subtotal": _extract_labeled_amount(lines, ("items subtotal", "subtotal")),
        "tax": _extract_labeled_amount(lines, ("tax",)),
        "tip": _extract_labeled_amount(lines, ("tip",)),
        "delivery_fee": _extract_labeled_amount(lines, ("delivery fee", "service fee")),
        "total": _extract_labeled_amount(lines, ("total charged", "order total", "total")),
        "currency": "USD",
        "items": items,
    }


def _extract_items(lines: list[str]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for index, line in enumerate(lines):
        match = _QTY_LINE.search(line)
        if not match:
            continue

        name = _find_item_name(lines, index)
        if not name:
            continue

        key = name.lower()
        if key in seen:
            continue
        seen.add(key)

        quantity = _to_float(match.group("qty"))
        unit_price = _to_float(match.group("price"))
        unit = _normalize_unit(match.group("unit"))
        line_total = _find_line_total(lines, index)
        if line_total is None and quantity is not None and unit_price is not None:
            line_total = round(quantity * unit_price, 2)

        items.append(
            {
                "name": name,
                "quantity": quantity,
                "unit": unit,
                "unit_price": unit_price,
                "line_total": line_total,
                "substitution_name": None,
            }
        )

    return items


def _find_item_name(lines: list[str], qty_index: int) -> str | None:
    """Walk backwards from a quantity line to the nearest product-name line."""
    for offset in range(1, 21):
        cursor = qty_index - offset
        if cursor < 0:
            break
        candidate = lines[cursor].strip()
        if not candidate or candidate.startswith("$"):
            continue
        if re.fullmatch(r"\([^)]*\)", candidate):
            continue
        if _QTY_LINE.search(candidate):
            break
        lowered = candidate.lower()
        if any(token in lowered for token in _NAME_BLOCKLIST):
            continue
        if not re.search(r"[A-Za-z]{2,}", candidate):
            continue
        # A bare category header (e.g. "Eggs & Dairy") sits above the name and
        # has no digits/parens; the real name almost always has a size suffix.
        cleaned = _SIZE_SUFFIX.sub("", candidate).strip(" -")
        if cleaned:
            return cleaned[:255]
    return None


def _find_line_total(lines: list[str], qty_index: int) -> float | None:
    label = "final item price"
    for offset in range(0, 5):
        cursor = qty_index + offset
        if cursor >= len(lines):
            break
        position = lines[cursor].lower().find(label)
        if position == -1:
            continue
        # The amount always follows the label, never the per-unit price before it.
        after = lines[cursor][position + len(label):]
        inline = _MONEY.search(after)
        if inline:
            return _to_float(inline.group(1).replace(",", ""))
        if cursor + 1 < len(lines):
            nxt = _MONEY.search(lines[cursor + 1])
            if nxt:
                return _to_float(nxt.group(1).replace(",", ""))
    return None


def _extract_store_name(body: str) -> str | None:
    match = _STORE_FROM.search(body)
    if match:
        return match.group(1).strip()[:120]
    match = _STORE_PARENS.search(body)
    if match:
        return match.group(1).strip()[:120]
    return None


def _extract_order_id(body: str) -> str | None:
    match = _ORDER_ID.search(body)
    if not match:
        return None
    candidate = match.group(1).strip()
    return candidate[:255] if candidate else None


def _extract_ordered_at(body: str) -> str | None:
    match = _DATE_PLACED.search(body) or _DATE_DELIVERED.search(body)
    if not match:
        return None
    month = _MONTHS.get(match.group(1).lower())
    if not month:
        return None
    try:
        day = int(match.group(2))
        year = int(match.group(3))
        dt = datetime(year, month, day, tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None
    return dt.isoformat()


def _extract_labeled_amount(lines: list[str], labels: tuple[str, ...]) -> float | None:
    # Labels are tried in priority order; the negative lookbehind keeps "total"
    # from matching inside "subtotal". Only same-line amounts that follow the
    # label are accepted, so header rows like "Order Totals" are ignored.
    for label in labels:
        pattern = re.compile(r"(?<![a-z])" + re.escape(label) + r"\b", re.IGNORECASE)
        for line in lines:
            match = pattern.search(line)
            if not match:
                continue
            after = line[match.end():]
            inline = _MONEY.search(after)
            if inline:
                return _to_float(inline.group(1).replace(",", ""))
    return None


def _normalize_unit(value: str | None) -> str | None:
    if not value:
        return None
    unit = value.strip().lower()
    if unit == "lbs":
        unit = "lb"
    return unit[:32] or None


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
