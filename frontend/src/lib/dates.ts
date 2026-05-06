const DAY_MS = 24 * 60 * 60 * 1000

export function getWeekStart(date = new Date()) {
  const start = new Date(date)
  const day = start.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + mondayOffset)
  start.setHours(0, 0, 0, 0)
  return start
}

export function getWeekEnd(date = new Date()) {
  const end = new Date(getWeekStart(date).getTime() + 6 * DAY_MS)
  end.setHours(23, 59, 59, 999)
  return end
}

export function getWeekDays(date = new Date()) {
  const start = getWeekStart(date)
  return Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * DAY_MS))
}

export function isSameLocalDay(first: string | Date, second: Date) {
  const firstDate = typeof first === "string" ? new Date(first) : first
  return firstDate.toDateString() === second.toDateString()
}

export function toLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseLocalDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function formatShortDay(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short" })
}

export function formatMonthDay(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "No date"
  }

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function toApiDateTime(value: string) {
  if (!value) {
    return null
  }

  return new Date(value).toISOString()
}
