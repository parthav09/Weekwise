"""Rule-based planner used by the /api/plans endpoints.

Phase 5 implementation. The contract (PlanRequest -> PlanRead) is shared with
Phase 6, where the same endpoint will be backed by an LLM. Keep the algorithm
self-contained and side-effect free.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.availability_block import (
    AvailabilityBlock,
    AvailabilityBlockType,
    LifeBlockCategory,
)
from app.models.habit import Habit, HabitCompletion
from app.models.task import (
    Task,
    TaskEnergyLevel,
    TaskPriority,
    TaskStatus,
)
from app.schemas.plan import PlanBlock, PlanDay, PlanRead
from app.services.external_busy import ExternalBusyBlock, load_external_busy_blocks


_WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_BUFFER = timedelta(minutes=5)
_DEFAULT_TASK_MIN = 30
_MEAL_SLOTS = (
    ("breakfast", time(9, 0), timedelta(minutes=30), 120),
    ("lunch", time(12, 45), timedelta(minutes=35), 120),
    ("dinner", time(18, 30), timedelta(minutes=45), 150),
)
_RULE_MEALS: dict[str, tuple[dict[str, Any], ...]] = {
    "breakfast": (
        {
            "title": "Greek yogurt oats with berries",
            "science_rationale": "Protein, fiber, and slow carbs make this a steady post-workout or deep-work breakfast.",
            "notes": "Stir yogurt, oats, berries, and chia. Add milk or water to loosen, then top with nuts if available.",
            "ingredients": [
                {"name": "Greek yogurt", "category": "dairy"},
                {"name": "rolled oats", "category": "pantry"},
                {"name": "berries", "category": "produce"},
                {"name": "chia seeds", "category": "pantry"},
            ],
        },
        {
            "title": "Egg and spinach avocado toast",
            "science_rationale": "Eggs and whole-grain carbs support satiety while spinach adds micronutrients.",
            "notes": "Scramble eggs with spinach. Serve on toast with avocado and fruit on the side if available.",
            "ingredients": [
                {"name": "eggs", "category": "dairy"},
                {"name": "spinach", "category": "produce"},
                {"name": "whole-grain bread", "category": "pantry"},
                {"name": "avocado", "category": "produce"},
            ],
        },
        {
            "title": "Banana peanut butter protein smoothie",
            "science_rationale": "Easy carbs plus protein make this realistic when the morning is tight.",
            "notes": "Blend banana, milk, peanut butter, and protein or yogurt. Add ice and oats for a thicker smoothie.",
            "ingredients": [
                {"name": "banana", "category": "produce"},
                {"name": "milk", "category": "dairy"},
                {"name": "peanut butter", "category": "pantry"},
                {"name": "protein powder or Greek yogurt", "category": "dairy"},
            ],
        },
    ),
    "lunch": (
        {
            "title": "Chicken rice bowl with roasted vegetables",
            "science_rationale": "Lean protein, rice, and vegetables make this a practical midday recovery meal.",
            "notes": "Warm rice and chicken. Add roasted vegetables, olive oil, and a quick yogurt or salsa sauce.",
            "ingredients": [
                {"name": "chicken", "category": "meat"},
                {"name": "rice", "category": "pantry"},
                {"name": "mixed vegetables", "category": "produce"},
                {"name": "olive oil", "category": "pantry"},
            ],
        },
        {
            "title": "Turkey avocado whole-wheat wrap",
            "science_rationale": "Portable protein and carbs keep lunch realistic without a heavy afternoon crash.",
            "notes": "Layer turkey, avocado, greens, and yogurt sauce in a tortilla. Add fruit or carrots on the side.",
            "ingredients": [
                {"name": "turkey", "category": "meat"},
                {"name": "whole-wheat tortilla", "category": "pantry"},
                {"name": "avocado", "category": "produce"},
                {"name": "greens", "category": "produce"},
            ],
        },
        {
            "title": "Lentil quinoa salad with feta",
            "science_rationale": "Legumes and quinoa provide protein, fiber, and durable energy for the afternoon.",
            "notes": "Toss lentils, quinoa, chopped vegetables, feta, and vinaigrette. Make extra for tomorrow.",
            "ingredients": [
                {"name": "lentils", "category": "pantry"},
                {"name": "quinoa", "category": "pantry"},
                {"name": "cucumber and tomato", "category": "produce"},
                {"name": "feta", "category": "dairy"},
            ],
        },
    ),
    "dinner": (
        {
            "title": "Salmon, sweet potato, and broccoli plate",
            "science_rationale": "Omega-3 fats, complex carbs, and vegetables support recovery after a full day.",
            "notes": "Roast sweet potato and broccoli. Pan-sear salmon, then finish with lemon or yogurt sauce.",
            "ingredients": [
                {"name": "salmon", "category": "meat"},
                {"name": "sweet potato", "category": "produce"},
                {"name": "broccoli", "category": "produce"},
                {"name": "lemon", "category": "produce"},
            ],
        },
        {
            "title": "Turkey chili with beans",
            "science_rationale": "High-protein chili is filling, batchable, and useful for the next day's leftovers.",
            "notes": "Simmer turkey, beans, tomatoes, and spices. Serve with rice or a tortilla if training was hard.",
            "ingredients": [
                {"name": "ground turkey", "category": "meat"},
                {"name": "beans", "category": "pantry"},
                {"name": "tomatoes", "category": "produce"},
                {"name": "rice or tortilla", "category": "pantry"},
            ],
        },
        {
            "title": "Tofu vegetable stir-fry with brown rice",
            "science_rationale": "Plant protein, vegetables, and brown rice make a balanced lighter dinner.",
            "notes": "Sear tofu until crisp. Stir-fry vegetables, add sauce, and serve over brown rice.",
            "ingredients": [
                {"name": "tofu", "category": "other"},
                {"name": "brown rice", "category": "pantry"},
                {"name": "stir-fry vegetables", "category": "produce"},
                {"name": "soy ginger sauce", "category": "pantry"},
            ],
        },
    ),
}


@dataclass
class _Interval:
    start: datetime
    end: datetime

    @property
    def duration(self) -> timedelta:
        return self.end - self.start


@dataclass
class _LifeOccurrence:
    block: AvailabilityBlock
    start: datetime
    end: datetime


@dataclass
class LifeBlockOccurrence:
    """Public, AI-planner-facing form of a life-block occurrence."""

    block: AvailabilityBlock
    start: datetime
    end: datetime


@dataclass
class PlanningContext:
    """Everything the planners (rules + AI) need to make a plan."""

    user_id: int
    start_at: datetime
    end_at: datetime
    day_start: time
    day_end: time
    days: list[date]
    tasks: list[Task]
    habits: list[Habit]
    completions: list[HabitCompletion]
    life_blocks: list[AvailabilityBlock]
    life_occurrences: list[LifeBlockOccurrence]
    external_busy_blocks: list[ExternalBusyBlock]


def load_planning_context(
    db: Session,
    *,
    user_id: int,
    start_at: datetime,
    end_at: datetime,
    day_window: tuple[time, time] = (time(8), time(22)),
) -> PlanningContext:
    """Single source of truth for planner inputs. Used by both rule and AI planners."""
    start_at = _ensure_aware(start_at)
    end_at = _ensure_aware(end_at)
    days = _enumerate_days(start_at, end_at)

    tasks = _load_tasks(db, user_id=user_id, end_at=end_at)
    habits = _load_habits(db, user_id=user_id)
    life_blocks = _load_life_blocks(
        db, user_id=user_id, start_at=start_at, end_at=end_at
    )
    completions = _load_habit_completions(
        db, user_id=user_id, start_at=start_at, end_at=end_at
    )
    occurrences = [
        LifeBlockOccurrence(o.block, o.start, o.end)
        for o in _expand_life_blocks(life_blocks, days)
    ]
    external_busy_blocks = load_external_busy_blocks(
        db, user_id=user_id, start_at=start_at, end_at=end_at
    )

    return PlanningContext(
        user_id=user_id,
        start_at=start_at,
        end_at=end_at,
        day_start=day_window[0],
        day_end=day_window[1],
        days=days,
        tasks=tasks,
        habits=habits,
        completions=completions,
        life_blocks=life_blocks,
        life_occurrences=occurrences,
        external_busy_blocks=external_busy_blocks,
    )


def ensure_aware(dt: datetime) -> datetime:
    """Public alias for the timezone normalizer."""
    return _ensure_aware(dt)


def effective_planning_start(
    start_at: datetime,
    end_at: datetime,
    *,
    now: datetime | None = None,
) -> datetime:
    """Return the first instant where new scheduled blocks may be placed."""
    start_at = _ensure_aware(start_at)
    end_at = _ensure_aware(end_at)
    current = _ensure_aware(now) if now is not None else datetime.now(start_at.tzinfo)
    if start_at < current < end_at:
        return _round_up_to_next_five_minutes(current)
    return start_at


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def generate_plan(
    db: Session,
    *,
    user_id: int,
    start_at: datetime,
    end_at: datetime,
    day_window: tuple[time, time] = (time(8), time(22)),
) -> PlanRead:
    context = load_planning_context(
        db,
        user_id=user_id,
        start_at=start_at,
        end_at=end_at,
        day_window=day_window,
    )
    return generate_plan_from_context(context)


def generate_plan_from_context(context: PlanningContext) -> PlanRead:
    start_at = context.start_at
    end_at = context.end_at
    scheduling_start_at = effective_planning_start(start_at, end_at)
    day_start = context.day_start
    day_end = context.day_end
    tasks = context.tasks
    habits = context.habits
    external_busy_blocks = context.external_busy_blocks
    completions = context.completions
    days = context.days
    scheduling_days = [d for d in days if d >= scheduling_start_at.date()]
    notes: list[str] = []

    # Use already-expanded life-block recurrences from the planning context.
    occurrences = [
        _LifeOccurrence(occ.block, occ.start, occ.end)
        for occ in context.life_occurrences
    ]
    occurrences_by_day: dict[date, list[_LifeOccurrence]] = defaultdict(list)
    for occ in occurrences:
        occurrences_by_day[occ.start.date()].append(occ)
    calendar_busy_by_day = _external_busy_by_day(external_busy_blocks, days)

    # Build per-day plan structures.
    plan_days: dict[date, PlanDay] = {d: PlanDay(date=d, blocks=[]) for d in days}

    # 1) Lay down life blocks first (visual + drives free windows).
    for d, occs in occurrences_by_day.items():
        for occ in occs:
            plan_days[d].blocks.append(
                PlanBlock(
                    start=occ.start,
                    end=occ.end,
                    type="life",
                    title=occ.block.title,
                    source_id=occ.block.id,
                    metadata={
                        "category": occ.block.category.value
                        if isinstance(occ.block.category, LifeBlockCategory)
                        else str(occ.block.category),
                        "block_type": occ.block.block_type.value
                        if isinstance(occ.block.block_type, AvailabilityBlockType)
                        else str(occ.block.block_type),
                    },
                )
            )

    # 2) Build the free windows per day (day_start..day_end minus blocked/recovery).
    free_windows: dict[date, list[_Interval]] = {}
    for d in days:
        bounds = _Interval(
            _at(d, day_start, start_at.tzinfo),
            _at(d, day_end, start_at.tzinfo),
        )
        # Clip to the request window.
        bounds.start = max(bounds.start, scheduling_start_at)
        bounds.end = min(bounds.end, end_at)
        if bounds.end <= bounds.start:
            free_windows[d] = []
            continue
        busy = [
            _Interval(o.start, o.end)
            for o in occurrences_by_day.get(d, [])
            if _is_busy(o.block.block_type)
        ]
        busy.extend(calendar_busy_by_day.get(d, []))
        free_windows[d] = _subtract(bounds, busy)

    # 3) Add realistic meal anchors before tasks/habits fill the day.
    _place_rule_meals(plan_days, free_windows, scheduling_days, scheduling_start_at, end_at, notes)

    # 4) Place all tasks greedily by score. Task due times are treated as
    # deadline/context only; the planner chooses the actual work slot.
    scored = sorted(
        tasks, key=lambda t: _task_score(t, scheduling_start_at), reverse=True
    )
    for task in scored:
        duration = timedelta(minutes=task.estimated_minutes or _DEFAULT_TASK_MIN)
        placed = _place_task(task, duration, free_windows, scheduling_days)
        if placed is None:
            notes.append(f'No room for "{task.title}" this period')
            continue
        plan_day = plan_days.setdefault(
            placed.start.date(), PlanDay(date=placed.start.date(), blocks=[])
        )
        plan_day.blocks.append(_task_block(task, placed))

    # 5) Spread habits across the week.
    week_completions: dict[int, set[date]] = defaultdict(set)
    for c in completions:
        week_completions[c.habit_id].add(c.completed_on)

    for habit in habits:
        already_done = len(week_completions.get(habit.id, set()))
        remaining = max(0, habit.target_count_per_week - already_done)
        if remaining == 0:
            continue
        candidate_days = [
            d
            for d in scheduling_days
            if d not in week_completions.get(habit.id, set())
        ]
        if not candidate_days:
            notes.append(f'"{habit.title}" already completed enough times')
            continue
        # Distribute as evenly as possible.
        chosen = _evenly_pick(candidate_days, remaining)
        duration = timedelta(minutes=habit.estimated_minutes or 30)
        for d in chosen:
            slot = _place_habit(d, habit, duration, free_windows.get(d, []))
            if slot is None:
                notes.append(f'No room for habit "{habit.title}" on {d.isoformat()}')
                continue
            plan_days.setdefault(d, PlanDay(date=d, blocks=[])).blocks.append(
                PlanBlock(
                    start=slot.start,
                    end=slot.end,
                    type="habit",
                    title=habit.title,
                    source_id=habit.id,
                    metadata={
                        "preferred_time_of_day": habit.preferred_time_of_day,
                        "target_count_per_week": habit.target_count_per_week,
                    },
                )
            )
            free_windows[d] = _carve(free_windows[d], slot)

    # Final tidy: sort blocks per day by start time.
    for plan_day in plan_days.values():
        plan_day.blocks.sort(key=lambda b: b.start)

    return PlanRead(
        generated_at=datetime.now(timezone.utc),
        generator="rules",
        start_at=start_at,
        end_at=end_at,
        days=[plan_days[d] for d in days],
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def _load_tasks(db: Session, *, user_id: int, end_at: datetime) -> list[Task]:
    stmt = (
        select(Task)
        .where(Task.user_id == user_id)
        .where(Task.status != TaskStatus.done)
    )
    rows = list(db.scalars(stmt).all())
    # Drop tasks whose due date is past the end of the window unless they have
    # no due date at all.
    return [
        t for t in rows if t.due_date is None or _ensure_aware(t.due_date) <= end_at + timedelta(days=14)
    ]


def _load_habits(db: Session, *, user_id: int) -> list[Habit]:
    return list(db.scalars(select(Habit).where(Habit.user_id == user_id)).all())


def _load_life_blocks(
    db: Session, *, user_id: int, start_at: datetime, end_at: datetime
) -> list[AvailabilityBlock]:
    stmt = select(AvailabilityBlock).where(AvailabilityBlock.user_id == user_id)
    rows = list(db.scalars(stmt).all())
    # Keep blocks whose anchor or recurrence might fall inside the window.
    out: list[AvailabilityBlock] = []
    for b in rows:
        if b.recurrence_rule:
            out.append(b)
            continue
        b_start = _ensure_aware(b.start_time)
        b_end = _ensure_aware(b.end_time)
        if b_end >= start_at and b_start <= end_at:
            out.append(b)
    return out


def _load_habit_completions(
    db: Session, *, user_id: int, start_at: datetime, end_at: datetime
) -> list[HabitCompletion]:
    stmt = (
        select(HabitCompletion)
        .where(HabitCompletion.user_id == user_id)
        .where(HabitCompletion.completed_on >= start_at.date())
        .where(HabitCompletion.completed_on <= end_at.date())
    )
    return list(db.scalars(stmt).all())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _round_up_to_next_five_minutes(dt: datetime) -> datetime:
    rounded = dt.replace(second=0, microsecond=0)
    if dt > rounded:
        rounded += timedelta(minutes=1)
    remainder = rounded.minute % 5
    if remainder:
        rounded += timedelta(minutes=5 - remainder)
    return rounded


def _at(d: date, t: time, tz: timezone | None) -> datetime:
    return datetime.combine(d, t, tzinfo=tz or timezone.utc)


def _enumerate_days(start_at: datetime, end_at: datetime) -> list[date]:
    days: list[date] = []
    cursor = start_at.date()
    last = end_at.date()
    while cursor <= last:
        days.append(cursor)
        cursor += timedelta(days=1)
    return days


def _is_busy(block_type: AvailabilityBlockType | str) -> bool:
    val = block_type.value if isinstance(block_type, AvailabilityBlockType) else block_type
    return val in {"blocked", "recovery"}


def _expand_life_blocks(
    blocks: Iterable[AvailabilityBlock], days: list[date]
) -> list[_LifeOccurrence]:
    out: list[_LifeOccurrence] = []
    days_set = set(days)
    for block in blocks:
        base_start = _ensure_aware(block.start_time)
        base_end = _ensure_aware(block.end_time)
        rule = (block.recurrence_rule or "").strip().lower()

        if not rule:
            if base_start.date() in days_set:
                out.append(_LifeOccurrence(block, base_start, base_end))
            continue

        for day in days:
            if not _rule_matches(rule, day):
                continue
            start = datetime.combine(day, base_start.timetz())
            end = datetime.combine(day, base_end.timetz())
            if end <= start:
                end += timedelta(days=1)
            out.append(_LifeOccurrence(block, start, end))

    out.sort(key=lambda o: o.start)
    return out


def _rule_matches(rule: str, day: date) -> bool:
    if rule == "daily":
        return True
    if rule.startswith("weekly:"):
        wanted = {w.strip() for w in rule[len("weekly:") :].split(",") if w.strip()}
        return _WEEKDAY_KEYS[day.weekday()] in wanted
    return False


def _subtract(bounds: _Interval, busy: list[_Interval]) -> list[_Interval]:
    if not busy:
        return [bounds]
    free: list[_Interval] = [bounds]
    for b in sorted(busy, key=lambda x: x.start):
        next_free: list[_Interval] = []
        for window in free:
            if b.end <= window.start or b.start >= window.end:
                next_free.append(window)
                continue
            if b.start > window.start:
                next_free.append(_Interval(window.start, min(b.start, window.end)))
            if b.end < window.end:
                next_free.append(_Interval(max(b.end, window.start), window.end))
        free = next_free
    return [w for w in free if w.duration > timedelta(0)]


def _external_busy_by_day(
    blocks: Iterable[ExternalBusyBlock], days: list[date]
) -> dict[date, list[_Interval]]:
    out: dict[date, list[_Interval]] = defaultdict(list)
    for block in blocks:
        start = _ensure_aware(block.start)
        end = _ensure_aware(block.end)
        for day in days:
            if end <= datetime.combine(day, time.min, tzinfo=start.tzinfo):
                continue
            if start >= datetime.combine(day + timedelta(days=1), time.min, tzinfo=start.tzinfo):
                continue
            out[day].append(_Interval(start, end))
    return out


def _fits_any_window(slot: _Interval, windows: list[_Interval]) -> bool:
    return any(window.start <= slot.start and slot.end <= window.end for window in windows)


def _carve(windows: list[_Interval], used: _Interval) -> list[_Interval]:
    out: list[_Interval] = []
    used_with_buffer = _Interval(used.start, used.end + _BUFFER)
    for w in windows:
        if used_with_buffer.end <= w.start or used_with_buffer.start >= w.end:
            out.append(w)
            continue
        if used_with_buffer.start > w.start:
            out.append(_Interval(w.start, used_with_buffer.start))
        if used_with_buffer.end < w.end:
            out.append(_Interval(used_with_buffer.end, w.end))
    return [w for w in out if w.duration >= timedelta(minutes=10)]


def _task_score(task: Task, now: datetime) -> float:
    priority_score = {
        TaskPriority.urgent: 100,
        TaskPriority.high: 70,
        TaskPriority.medium: 40,
        TaskPriority.low: 10,
    }[task.priority]
    deadline_bonus = 0.0
    if task.due_date is not None:
        due = _ensure_aware(task.due_date)
        due_day_end = datetime.combine(due.date(), time.max, tzinfo=due.tzinfo)
        delta = due_day_end - now
        hours = max(delta.total_seconds() / 3600.0, 0.0)
        if hours <= 48:
            deadline_bonus = 50 - min(hours, 48)
    return priority_score + deadline_bonus


def _prefers_morning(task: Task) -> bool:
    return task.energy_level == TaskEnergyLevel.high


def _prefers_afternoon(task: Task) -> bool:
    return task.energy_level == TaskEnergyLevel.low


def _place_task(
    task: Task,
    duration: timedelta,
    free_windows: dict[date, list[_Interval]],
    days: list[date],
) -> _Interval | None:
    target_days = list(days)
    if task.due_date is not None:
        due_day = _ensure_aware(task.due_date).date()
        # Prefer earlier days, but not after due date.
        target_days = [d for d in days if d <= due_day] or days

    for d in target_days:
        windows = free_windows.get(d, [])
        if not windows:
            continue
        ordered = _ordered_windows(windows, task)
        for window in ordered:
            if window.duration < duration:
                continue
            slot = _Interval(window.start, window.start + duration)
            free_windows[d] = _carve(windows, slot)
            return slot
    return None


def _ordered_windows(windows: list[_Interval], task: Task) -> list[_Interval]:
    if _prefers_morning(task):
        return sorted(windows, key=lambda w: w.start)
    if _prefers_afternoon(task):
        return sorted(windows, key=lambda w: -w.start.timestamp())
    return sorted(windows, key=lambda w: w.start)


def _place_habit(
    day: date,
    habit: Habit,
    duration: timedelta,
    windows: list[_Interval],
) -> _Interval | None:
    if not windows:
        return None
    ordered = sorted(windows, key=lambda w: _habit_window_key(w, habit))
    for window in ordered:
        if window.duration >= duration:
            return _Interval(window.start, window.start + duration)
    return None


def _place_rule_meals(
    plan_days: dict[date, PlanDay],
    free_windows: dict[date, list[_Interval]],
    days: list[date],
    start_at: datetime,
    end_at: datetime,
    notes: list[str],
) -> None:
    tz = start_at.tzinfo
    for day_index, day in enumerate(days):
        for meal_type, preferred_time, duration, max_shift_minutes in _MEAL_SLOTS:
            preferred_start = _at(day, preferred_time, tz)
            if preferred_start + duration <= start_at or preferred_start >= end_at:
                continue
            slot = _place_meal_near(
                preferred_start,
                duration,
                free_windows.get(day, []),
                max_shift_minutes=max_shift_minutes,
            )
            if slot is None:
                if _has_meaningful_free_time(free_windows.get(day, []), duration):
                    notes.append(f"No realistic {meal_type} slot found on {day.isoformat()}")
                continue
            plan_days.setdefault(day, PlanDay(date=day, blocks=[])).blocks.append(
                _meal_block(meal_type, day_index, slot)
            )
            free_windows[day] = _carve(free_windows.get(day, []), slot)


def _place_meal_near(
    preferred_start: datetime,
    duration: timedelta,
    windows: list[_Interval],
    *,
    max_shift_minutes: int,
) -> _Interval | None:
    candidates: list[tuple[float, datetime]] = []
    for window in windows:
        latest_start = window.end - duration
        if latest_start < window.start:
            continue
        start = min(max(preferred_start, window.start), latest_start)
        shift_minutes = abs((start - preferred_start).total_seconds()) / 60
        if shift_minutes <= max_shift_minutes:
            candidates.append((shift_minutes, start))
    if not candidates:
        return None
    _, start = min(candidates, key=lambda candidate: candidate[0])
    return _Interval(start, start + duration)


def _has_meaningful_free_time(windows: list[_Interval], duration: timedelta) -> bool:
    return any(window.duration >= duration for window in windows)


def _meal_block(meal_type: str, day_index: int, slot: _Interval) -> PlanBlock:
    recipe = _RULE_MEALS[meal_type][day_index % len(_RULE_MEALS[meal_type])]
    ingredients = [
        {
            "name": ingredient["name"],
            "category": ingredient.get("category", "other"),
            "quantity": None,
            "unit": None,
            "on_hand": False,
            "notes": None,
        }
        for ingredient in recipe["ingredients"]
    ]
    return PlanBlock(
        start=slot.start,
        end=slot.end,
        type="meal",
        title=recipe["title"],
        source_id=None,
        metadata={
            "meal_type": meal_type,
            "science_rationale": recipe["science_rationale"],
            "notes": recipe["notes"],
            "ingredients": ingredients,
            "source": "rule_meal_anchor",
        },
    )


def _habit_window_key(window: _Interval, habit: Habit) -> float:
    pref = (habit.preferred_time_of_day or "").lower()
    hour = window.start.hour
    if pref == "morning":
        return abs(hour - 8)
    if pref == "afternoon":
        return abs(hour - 14)
    if pref == "evening":
        return abs(hour - 19)
    return float(hour)


def _evenly_pick(days: list[date], count: int) -> list[date]:
    if count >= len(days):
        return days
    if count <= 0:
        return []
    step = len(days) / count
    picked: list[date] = []
    for i in range(count):
        idx = min(int(i * step + step / 2), len(days) - 1)
        picked.append(days[idx])
    # Dedupe while preserving order.
    seen: set[date] = set()
    out: list[date] = []
    for d in picked:
        if d not in seen:
            seen.add(d)
            out.append(d)
    return out


def _task_block(task: Task, slot: _Interval) -> PlanBlock:
    return PlanBlock(
        start=slot.start,
        end=slot.end,
        type="task",
        title=task.title,
        source_id=task.id,
        metadata={
            "priority": task.priority.value,
            "category": task.category.value,
            "energy_level": task.energy_level.value,
            "schedule_flexibility": task.schedule_flexibility.value,
            "due_date": _ensure_aware(task.due_date).isoformat() if task.due_date else None,
        },
    )
