import type { LifeBlock } from "./api"
import { isSameLocalDay, toLocalDateKey } from "./dates"

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

export interface LifeBlockOccurrence {
  block: LifeBlock
  start: Date
  end: Date
}

function setTimeOnDay(day: Date, source: Date) {
  const out = new Date(day)
  out.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0)
  return out
}

function ruleAllowsWeekday(rule: string | null, day: Date): boolean {
  if (!rule) return false
  if (rule === "daily") return true
  if (rule.startsWith("weekly:")) {
    const days = rule.slice("weekly:".length).split(",").map((d) => d.trim().toLowerCase())
    return days.includes(WEEKDAY_KEYS[day.getDay()])
  }
  return false
}

/**
 * Returns concrete occurrences of `blocks` inside `[windowStart, windowEnd]`.
 * One-time blocks fall in if they overlap the window. Recurring blocks (`daily` or
 * `weekly:mon,tue,...`) emit one occurrence per matching day, anchored at the
 * original block's local time.
 */
export function expandLifeBlocks(
  blocks: LifeBlock[],
  windowStart: Date,
  windowEnd: Date,
): LifeBlockOccurrence[] {
  const out: LifeBlockOccurrence[] = []

  const days: Date[] = []
  const cursor = new Date(windowStart)
  cursor.setHours(0, 0, 0, 0)
  const last = new Date(windowEnd)
  last.setHours(0, 0, 0, 0)
  while (cursor <= last) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  for (const block of blocks) {
    const baseStart = new Date(block.start_time)
    const baseEnd = new Date(block.end_time)

    if (!block.recurrence_rule) {
      if (baseEnd >= windowStart && baseStart <= windowEnd) {
        out.push({ block, start: baseStart, end: baseEnd })
      }
      continue
    }

    for (const day of days) {
      if (!ruleAllowsWeekday(block.recurrence_rule, day)) continue
      const start = setTimeOnDay(day, baseStart)
      const end = setTimeOnDay(day, baseEnd)
      if (end <= start) end.setDate(end.getDate() + 1)
      out.push({ block, start, end })
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return out
}

export function groupOccurrencesByDay(
  occurrences: LifeBlockOccurrence[],
): Map<string, LifeBlockOccurrence[]> {
  const map = new Map<string, LifeBlockOccurrence[]>()
  for (const occ of occurrences) {
    const key = toLocalDateKey(occ.start)
    const arr = map.get(key) ?? []
    arr.push(occ)
    map.set(key, arr)
  }
  return map
}

export function occurrencesOnDay(
  occurrences: LifeBlockOccurrence[],
  day: Date,
): LifeBlockOccurrence[] {
  return occurrences.filter((occ) => isSameLocalDay(occ.start, day))
}

export function formatTimeRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${fmt(start)} – ${fmt(end)}`
}
