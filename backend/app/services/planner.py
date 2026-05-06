"""Rule-based planner used by the /api/plans endpoints.

Phase 5 implementation. The contract (PlanRequest -> PlanRead) is shared with
Phase 6, where the same endpoint will be backed by an LLM. Keep the algorithm
self-contained and side-effect free.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable

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
    TaskScheduleFlexibility,
    TaskStatus,
)
from app.schemas.plan import PlanBlock, PlanDay, PlanRead


_WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_BUFFER = timedelta(minutes=5)
_DEFAULT_TASK_MIN = 30


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
    )


def ensure_aware(dt: datetime) -> datetime:
    """Public alias for the timezone normalizer."""
    return _ensure_aware(dt)


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
    start_at = _ensure_aware(start_at)
    end_at = _ensure_aware(end_at)
    day_start, day_end = day_window

    tasks = _load_tasks(db, user_id=user_id, end_at=end_at)
    habits = _load_habits(db, user_id=user_id)
    life_blocks = _load_life_blocks(db, user_id=user_id, start_at=start_at, end_at=end_at)
    completions = _load_habit_completions(
        db, user_id=user_id, start_at=start_at, end_at=end_at
    )

    days = _enumerate_days(start_at, end_at)
    notes: list[str] = []

    # Expand life-block recurrences into concrete occurrences.
    occurrences = _expand_life_blocks(life_blocks, days)
    occurrences_by_day: dict[date, list[_LifeOccurrence]] = defaultdict(list)
    for occ in occurrences:
        occurrences_by_day[occ.start.date()].append(occ)

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
        bounds.start = max(bounds.start, start_at)
        bounds.end = min(bounds.end, end_at)
        if bounds.end <= bounds.start:
            free_windows[d] = []
            continue
        busy = [
            _Interval(o.start, o.end)
            for o in occurrences_by_day.get(d, [])
            if _is_busy(o.block.block_type)
        ]
        free_windows[d] = _subtract(bounds, busy)

    # 3) Place fixed tasks first (they pin to due_date).
    fixed_tasks, flexible_tasks = _split_fixed(tasks)

    for task in fixed_tasks:
        if task.due_date is None:
            notes.append(f'"{task.title}" is fixed but has no due date; skipped')
            continue
        slot = _slot_for_fixed(task)
        if slot is None:
            continue
        if slot.end <= start_at or slot.start >= end_at:
            continue
        d = slot.start.date()
        plan_days.setdefault(d, PlanDay(date=d, blocks=[])).blocks.append(
            _task_block(task, slot)
        )
        if d in free_windows and free_windows[d]:
            free_windows[d] = _carve(free_windows[d], slot)

    # 4) Place flexible tasks greedily by score.
    scored = sorted(
        flexible_tasks, key=lambda t: _task_score(t, start_at), reverse=True
    )
    for task in scored:
        duration = timedelta(minutes=task.estimated_minutes or _DEFAULT_TASK_MIN)
        placed = _place_task(task, duration, free_windows, days)
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
            d for d in days if d not in week_completions.get(habit.id, set())
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


def _split_fixed(tasks: list[Task]) -> tuple[list[Task], list[Task]]:
    fixed: list[Task] = []
    flexible: list[Task] = []
    for t in tasks:
        if t.schedule_flexibility == TaskScheduleFlexibility.fixed:
            fixed.append(t)
        else:
            flexible.append(t)
    return fixed, flexible


def _slot_for_fixed(task: Task) -> _Interval | None:
    if task.due_date is None:
        return None
    duration = timedelta(minutes=task.estimated_minutes or _DEFAULT_TASK_MIN)
    start = _ensure_aware(task.due_date)
    return _Interval(start, start + duration)


def _task_score(task: Task, now: datetime) -> float:
    priority_score = {
        TaskPriority.urgent: 100,
        TaskPriority.high: 70,
        TaskPriority.medium: 40,
        TaskPriority.low: 10,
    }[task.priority]
    deadline_bonus = 0.0
    if task.due_date is not None:
        delta = _ensure_aware(task.due_date) - now
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
