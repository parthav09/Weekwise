import type {
  TaskCategory,
  TaskEnergyLevel,
  TaskPriority,
  TaskScheduleFlexibility,
} from "./api"

export interface VoiceTaskDraft {
  title: string
  description: string
  priority: TaskPriority
  due_date: string
  estimated_minutes: string
  energy_level: TaskEnergyLevel
  category: TaskCategory
  schedule_flexibility: TaskScheduleFlexibility
}

const DAY_MS = 24 * 60 * 60 * 1000

const weekdayIndexes: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const monthIndexes: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
}

const categoryMatchers: Array<{ category: TaskCategory; pattern: RegExp }> = [
  { category: "school", pattern: /\b(homework|assignment|essay|exam|quiz|study|class|lecture|professor|campus)\b/i },
  { category: "work", pattern: /\b(work|client|email|report|presentation|meeting|standup|proposal|deadline|office)\b/i },
  { category: "fitness", pattern: /\b(gym|run|workout|lift|yoga|stretch|walk|cardio|exercise)\b/i },
  { category: "social", pattern: /\b(call|text|meet|party|dinner|lunch|coffee|friend|family|date)\b/i },
  { category: "errands", pattern: /\b(buy|pick up|pickup|drop off|grocer|pharmacy|bank|return|mail|ship|store)\b/i },
]

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function toLocalInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function withTime(date: Date, hour = 17, minute = 0) {
  const next = new Date(date)
  next.setHours(hour, minute, 0, 0)
  return next
}

function nextWeekday(base: Date, weekday: number, forceNextWeek: boolean) {
  const date = startOfDay(base)
  let offset = (weekday - date.getDay() + 7) % 7
  if (offset === 0 || forceNextWeek) offset += 7
  date.setDate(date.getDate() + offset)
  return date
}

function parseSpokenNumber(raw: string) {
  const normalized = raw.toLowerCase().trim()
  const words: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  }
  return words[normalized] ?? Number(normalized)
}

function parseTime(raw: string) {
  const normalized = raw.toLowerCase().replace(/\./g, "").trim()
  if (normalized === "noon") return { hour: 12, minute: 0 }
  if (normalized === "midnight") return { hour: 0, minute: 0 }

  const match = normalized.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(\d{2}))?\s*(am|pm)?\b/)
  if (!match) return null

  const hourValue = parseSpokenNumber(match[1])
  if (!Number.isFinite(hourValue)) return null

  let hour = hourValue
  const minute = match[2] ? Number(match[2]) : 0
  const meridiem = match[3]

  if (meridiem === "pm" && hour < 12) hour += 12
  if (meridiem === "am" && hour === 12) hour = 0
  if (!meridiem && hour >= 1 && hour <= 7) hour += 12

  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

function parseDueDate(text: string, baseDate = new Date()) {
  const normalized = text.toLowerCase()
  let dueDate: Date | null = null
  let defaultHour = 17

  if (/\btonight\b/.test(normalized)) {
    dueDate = startOfDay(baseDate)
    defaultHour = 20
  } else if (/\btomorrow\b/.test(normalized)) {
    dueDate = startOfDay(new Date(baseDate.getTime() + DAY_MS))
  } else if (/\btoday\b/.test(normalized)) {
    dueDate = startOfDay(baseDate)
  }

  if (/\bmorning\b/.test(normalized)) defaultHour = 9
  if (/\bafternoon\b/.test(normalized)) defaultHour = 14
  if (/\bevening\b/.test(normalized)) defaultHour = 18
  if (/\bnight\b|\btonight\b/.test(normalized)) defaultHour = 20

  const weekdayMatch = normalized.match(/\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (weekdayMatch) {
    const weekday = weekdayIndexes[weekdayMatch[2]]
    dueDate = nextWeekday(baseDate, weekday, weekdayMatch[1] === "next")
  }

  const monthMatch = normalized.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/)
  if (monthMatch) {
    const month = monthIndexes[monthMatch[1]]
    const day = Number(monthMatch[2])
    const year = monthMatch[3] ? Number(monthMatch[3]) : baseDate.getFullYear()
    dueDate = new Date(year, month, day)
    if (dueDate.getTime() < startOfDay(baseDate).getTime() && !monthMatch[3]) {
      dueDate.setFullYear(year + 1)
    }
  }

  const inMatch = normalized.match(/\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minute|minutes|hour|hours|day|days|week|weeks)\b/)
  if (inMatch) {
    const amount = parseSpokenNumber(inMatch[1])
    if (Number.isFinite(amount)) {
      dueDate = new Date(baseDate)
      const unit = inMatch[2]
      if (unit.startsWith("minute")) dueDate.setMinutes(dueDate.getMinutes() + amount)
      if (unit.startsWith("hour")) dueDate.setHours(dueDate.getHours() + amount)
      if (unit.startsWith("day")) dueDate.setDate(dueDate.getDate() + amount)
      if (unit.startsWith("week")) dueDate.setDate(dueDate.getDate() + amount * 7)
    }
  }

  if (!dueDate) return ""

  const timeMatch = normalized.match(/\b(?:at|by|before|around)\s+((?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::\d{2})?\s*(?:am|pm)?|noon|midnight)\b/)
  const parsedTime = timeMatch ? parseTime(timeMatch[1]) : null
  const finalDate = parsedTime
    ? withTime(dueDate, parsedTime.hour, parsedTime.minute)
    : withTime(dueDate, defaultHour, 0)

  return toLocalInputValue(finalDate)
}

function parseEstimatedMinutes(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minute|minutes|hour|hours|day|days|week|weeks)\b/g, "")
  const match = normalized.match(/\b(?:for|take|takes|about|around)?\s*(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(minute|minutes|mins|min|hour|hours|hr|hrs)\b/)
  if (!match) return ""

  const amount = parseSpokenNumber(match[1])
  if (!Number.isFinite(amount)) return ""

  const unit = match[2]
  return String(unit.startsWith("hour") || unit.startsWith("hr") ? amount * 60 : amount)
}

function inferPriority(text: string): TaskPriority {
  if (/\b(urgent|asap|right away|critical|immediately)\b/i.test(text)) return "urgent"
  if (/\b(important|high priority|deadline|must|need to)\b/i.test(text)) return "high"
  if (/\b(low priority|sometime|whenever|eventually)\b/i.test(text)) return "low"
  return "medium"
}

function inferEnergy(text: string): TaskEnergyLevel {
  if (/\b(deep work|focus|hard|study|write|build|plan|research)\b/i.test(text)) return "high"
  if (/\b(call|email|text|reply|pay|schedule|book|order|buy)\b/i.test(text)) return "low"
  return "medium"
}

function inferCategory(text: string): TaskCategory {
  return categoryMatchers.find(({ pattern }) => pattern.test(text))?.category ?? "personal"
}

function inferFlexibility(text: string): TaskScheduleFlexibility {
  return /\b(at|by|before|appointment|meeting|class|flight|reservation)\b/i.test(text)
    ? "fixed"
    : "flexible"
}

function cleanTitle(text: string) {
  const cleaned = text
    .replace(/\b(add|create|make)\s+(a\s+)?(new\s+)?task\s+(to|for)?\b/gi, "")
    .replace(/\b(remind me to|i need to|i have to|need to|have to|please)\b/gi, "")
    .replace(/\b(today|tomorrow|tonight|this\s+week|next\s+week)\b/gi, "")
    .replace(/\b(morning|afternoon|evening|night)\b/gi, "")
    .replace(/\b(?:next|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
    .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
    .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b/gi, "")
    .replace(/\b(?:at|by|before|around)\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(/\b(?:at|by|before|around)\s+(noon|midnight)\b/gi, "")
    .replace(/\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minute|minutes|hour|hours|day|days|week|weeks)\b/gi, "")
    .replace(/\b(?:for|take|takes|about|around)?\s*(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(minute|minutes|mins|min|hour|hours|hr|hrs)\b/gi, "")
    .replace(/\b(urgent|asap|right away|critical|important|high priority|low priority|sometime|whenever|eventually)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")

  if (!cleaned) return ""
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function splitTranscript(transcript: string) {
  return transcript
    .replace(/\b(?:first|second|third|fourth|fifth),?\s+/gi, ". ")
    .replace(/\b(?:new task|next task),?\s+/gi, ". ")
    .split(/\s*(?:[.;\n]|\band then\b|\bthen\b|\balso\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function parseVoiceTaskTranscript(transcript: string, baseDate = new Date()): VoiceTaskDraft[] {
  return splitTranscript(transcript)
    .map((part) => ({
      title: cleanTitle(part),
      description: part.trim(),
      priority: inferPriority(part),
      due_date: parseDueDate(part, baseDate),
      estimated_minutes: parseEstimatedMinutes(part),
      energy_level: inferEnergy(part),
      category: inferCategory(part),
      schedule_flexibility: inferFlexibility(part),
    }))
    .filter((draft) => draft.title.length > 0)
}
