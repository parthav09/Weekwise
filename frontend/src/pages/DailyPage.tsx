import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Flame,
  Plus,
  Sparkles,
  Utensils,
  X,
} from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  completeHabit,
  createTask,
  generateAndSaveActivePlan,
  getActivePlan,
  listGoogleCalendarEvents,
  listHabitCompletions,
  listHabits,
  listLifeBlocks,
  listTasks,
  planReadToOptimisticActivePlan,
  updateActivePlanItem,
  updateTask,
  waitForActivePlan,
} from "../lib/api"
import type {
  ActivePlanBlock,
  ActivePlanItemStatus,
  ActivePlanRead,
  CalendarEvent,
  Habit,
  HabitCompletion,
  LifeBlock,
  Task,
  TaskPriority,
} from "../lib/api"
import { warnError } from "../lib/browserWarnings"
import {
  formatMonthDay,
  formatShortDay,
  getWeekEnd,
  getWeekStart,
  isSameLocalDay,
  parseLocalDateKey,
  toLocalDateKey,
} from "../lib/dates"
import { lifeBlockCategoryConfig } from "../lib/lifeBlockCategories"
import { expandLifeBlocks, formatTimeRange, type LifeBlockOccurrence } from "../lib/lifeBlocks"
import { cn } from "../lib/utils"

const priorityDot: Record<TaskPriority, string> = {
  low: "bg-danger/60",
  medium: "bg-danger/70",
  high: "bg-danger/80",
  urgent: "bg-danger",
}

interface MealIngredientDetail {
  name: string
  quantity?: number | null
  unit?: string | null
  category?: string
  on_hand?: boolean
  notes?: string | null
}

type DailyTimelineItemType = "task" | "habit" | "meal" | "life" | "calendar" | "buffer"

interface DailyTimelineItem {
  id: string
  type: DailyTimelineItemType
  title: string
  start: Date
  end: Date
  subtitle?: string
  notes?: string | null
  status?: string
  task?: Task
  habit?: Habit
  planBlock?: ActivePlanBlock
  lifeBlock?: LifeBlockOccurrence
  calendarEvent?: CalendarEvent
  ingredients?: MealIngredientDetail[]
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function shiftDay(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function DailyPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const date = useMemo(() => {
    const key = searchParams.get("date")
    return key ? parseLocalDateKey(key) : startOfDay(new Date())
  }, [searchParams])

  const dayStart = useMemo(() => startOfDay(date), [date])
  const dayEnd = useMemo(() => endOfDay(date), [date])
  const activeWeekStart = useMemo(() => getWeekStart(dayStart), [dayStart])
  const activeWeekEnd = useMemo(() => {
    const value = getWeekEnd(dayStart)
    value.setHours(23, 59, 59, 0)
    return value
  }, [dayStart])
  const dayKey = toLocalDateKey(dayStart)
  const isToday = isSameLocalDay(dayStart, new Date())

  const [tasks, setTasks] = useState<Task[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [lifeBlocks, setLifeBlocks] = useState<LifeBlock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [completingId, setCompletingId] = useState<number | null>(null)
  const [plan, setPlan] = useState<ActivePlanRead | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])

  const [showAdd, setShowAdd] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftPriority, setDraftPriority] = useState<TaskPriority>("medium")

  const loadDay = useCallback(async () => {
    setIsLoading(true)
    try {
      const [t, h, c, lb, events] = await Promise.all([
        listTasks({ dueFrom: dayStart, dueTo: dayEnd }),
        listHabits(),
        listHabitCompletions(dayStart, dayEnd),
        listLifeBlocks({ startFrom: dayStart, endTo: dayEnd }),
        listGoogleCalendarEvents(dayStart, dayEnd).catch((err) => {
          warnError(err, "Couldn't load Google Calendar events")
          return [] as CalendarEvent[]
        }),
      ])
      setTasks(t)
      setHabits(h)
      setCompletions(c)
      setLifeBlocks(lb)
      setCalendarEvents(events)
    } catch (err) {
      warnError(err, "Couldn't load this day")
    } finally {
      setIsLoading(false)
    }
  }, [dayStart, dayEnd])

  const dayLifeBlocks = useMemo(
    () => expandLifeBlocks(lifeBlocks, dayStart, dayEnd),
    [lifeBlocks, dayStart, dayEnd],
  )

  const planBlocks = useMemo<ActivePlanBlock[]>(() => {
    if (!plan) return []
    return plan.days
      .find((d) => d.date === dayKey)
      ?.blocks.filter((b) => b.type !== "life") ?? []
  }, [plan, dayKey])

  const timelineItems = useMemo(
    () =>
      buildDailyTimeline({
        dayStart,
        tasks,
        habits,
        completions,
        lifeBlocks: dayLifeBlocks,
        calendarEvents,
        planBlocks,
      }),
    [calendarEvents, completions, dayLifeBlocks, dayStart, habits, planBlocks, tasks],
  )

  useEffect(() => {
    void loadDay()
  }, [loadDay])

  useEffect(() => {
    let cancelled = false
    async function loadActive() {
      try {
        const daily = await getActivePlan({ scope: "day", start_at: dayStart, end_at: dayEnd })
        const active =
          daily ??
          (await getActivePlan({
            scope: "week",
            start_at: activeWeekStart,
            end_at: activeWeekEnd,
          }))
        if (!cancelled) setPlan(active)
      } catch (err) {
        if (!cancelled) {
          setPlan(null)
          warnError(err, "Couldn't load active plan")
        }
      }
    }
    void loadActive()
    return () => {
      cancelled = true
    }
  }, [activeWeekEnd, activeWeekStart, dayEnd, dayStart])

  async function handleGeneratePlan() {
    setPlanLoading(true)
    try {
      const result = await generateAndSaveActivePlan(
        { start_at: dayStart, end_at: dayEnd },
        "day",
      )
      setPlan(planReadToOptimisticActivePlan(result, "day"))
      void waitForActivePlan({ scope: "day", start_at: dayStart, end_at: dayEnd }, 6, 350, result.generated_at)
        .then((active) => {
          if (active && active.start_at === result.start_at && active.end_at === result.end_at) {
            setPlan(active)
          }
        })
        .catch((err) => warnError(err, "Couldn't refresh saved active plan"))
    } catch (err) {
      warnError(err, "Couldn't generate plan")
    } finally {
      setPlanLoading(false)
    }
  }

  function setDate(next: Date) {
    if (isSameLocalDay(next, new Date())) {
      setSearchParams({})
    } else {
      setSearchParams({ date: toLocalDateKey(next) })
    }
  }

  async function toggleTask(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done"
    try {
      const updated = await updateTask(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      warnError(err, "Couldn't update task")
    }
  }

  async function logHabit(habit: Habit) {
    setCompletingId(habit.id)
    try {
      const completion = await completeHabit(habit.id, dayStart)
      setCompletions((prev) => [completion, ...prev])
    } catch (err) {
      warnError(err, "Couldn't log habit")
    } finally {
      setCompletingId(null)
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!draftTitle.trim()) return
    const due = new Date(dayStart)
    due.setHours(12, 0, 0, 0)
    try {
      const task = await createTask({
        title: draftTitle.trim(),
        priority: draftPriority,
        due_date: due.toISOString(),
      })
      setTasks((prev) => [...prev, task])
      setDraftTitle("")
      setDraftPriority("medium")
      setShowAdd(false)
    } catch (err) {
      warnError(err, "Couldn't add task")
    }
  }

  async function handlePlanItemStatus(
    block: ActivePlanBlock,
    status: ActivePlanItemStatus,
    feedbackReason?: string | null,
  ) {
    if (block.id < 0) {
      warnError(new Error("The plan is still saving. Try this again in a moment."), "Plan still saving")
      return
    }
    try {
      const updated = await updateActivePlanItem(block.id, {
        status,
        feedback_reason: feedbackReason ?? (status === "planned" ? null : block.feedback_reason),
      })
      setPlan((prev) => updatePlanBlock(prev, updated))
    } catch (err) {
      warnError(err, "Couldn't update plan feedback")
    }
  }

  function isHabitLogged(habitId: number) {
    return completions.some((c) => c.habit_id === habitId && c.completed_on === dayKey)
  }

  const activePlanItems = planBlocks.filter((block) => block.type !== "life")
  const doneTasks = tasks.filter((t) => t.status === "done").length
  const totalThings = activePlanItems.length || tasks.length + habits.length
  const doneThings = activePlanItems.length
    ? activePlanItems.filter((block) => block.status === "done").length
    : doneTasks + habits.filter((h) => isHabitLogged(h.id)).length
  const percent = totalThings ? Math.round((doneThings / totalThings) * 100) : 0
  const headline = isToday ? "Today" : formatShortDay(dayStart)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{headline}</h1>
          <p className="text-sm text-muted-foreground">{formatMonthDay(dayStart)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate(shiftDay(dayStart, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={isToday ? "default" : "outline"}
            size="sm"
            onClick={() => setDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate(shiftDay(dayStart, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant={plan ? "outline" : "default"}
            size="sm"
            disabled={planLoading}
            onClick={handleGeneratePlan}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {planLoading ? "Generating AI schedule..." : plan ? "Regenerate AI schedule" : "Generate AI schedule"}
          </Button>
          {plan && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                plan.generator === "ai"
                  ? "bg-accent/10 text-accent"
                  : "bg-muted text-muted-foreground",
              )}
              title={plan.generator === "ai" ? "Generated by Gemini" : "Generated by built-in rules"}
            >
              {plan.generator === "ai" ? "AI" : "Rules"}
            </span>
          )}
          {plan && (
            <Button variant="ghost" size="icon" onClick={() => setPlan(null)} aria-label="Hide plan">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {plan && plan.notes.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning shadow-sm">
          <p className="mb-1 font-medium">Heads up while planning</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {plan.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="fluid-card p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Day progress</span>
          <span className="text-muted-foreground">
            {doneThings}/{totalThings} done · {percent}%
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Detailed daily schedule</h2>
          <p className="text-sm text-muted-foreground">
            Time-blocked tasks, habits, life blocks, meals, and transition buffers.
          </p>
        </div>
        {timelineItems.length > 0 ? (
          <div className="space-y-3">
            {timelineItems.map((item) => (
              <DailyTimelineCard
                key={item.id}
                item={item}
                isHabitLogged={item.habit ? isHabitLogged(item.habit.id) : false}
                completingId={completingId}
                onToggleTask={item.task ? () => void toggleTask(item.task as Task) : undefined}
                onLogHabit={item.habit ? () => void logHabit(item.habit as Habit) : undefined}
                onPlanItemStatus={
                  item.planBlock
                    ? (status, reason) => void handlePlanItemStatus(item.planBlock as ActivePlanBlock, status, reason)
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            Nothing planned for this day yet. Add tasks, habits, or life blocks to build your schedule.
          </div>
        )}
      </section>

      {dayLifeBlocks.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Life blocks
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {dayLifeBlocks.map((occ) => {
              const cfg = lifeBlockCategoryConfig[occ.block.category]
              const Icon = cfg.icon
              return (
                <li
                  key={`${occ.block.id}-${occ.start.toISOString()}`}
                  className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-sm"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      cfg.className,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{occ.block.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {cfg.label} · {formatTimeRange(occ.start, occ.end)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {calendarEvents.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-200">
            <CalendarDays className="h-3.5 w-3.5" />
            Google Calendar
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {calendarEvents.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-xl border border-sky-300/40 bg-sky-50 p-3 text-sky-900 shadow-sm dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="text-xs opacity-75">
                    {event.is_all_day
                      ? "All day"
                      : formatTimeRange(new Date(event.start_at), new Date(event.end_at))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {planBlocks.length > 0 ? "Tasks in AI schedule" : "Tasks"}{" "}
            <span className="text-sm font-normal text-muted-foreground">({tasks.length})</span>
          </h2>
          {planBlocks.length === 0 ? (
            <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {showAdd ? "Cancel" : "Add task"}
            </Button>
          ) : null}
        </div>

        {showAdd && planBlocks.length === 0 && (
          <form
            onSubmit={handleAdd}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            <Input
              placeholder="What's on the agenda?"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="h-9 min-w-[200px] flex-1"
              autoFocus
            />
            <select
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value as TaskPriority)}
              className="h-9 rounded-lg border border-border bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
        )}

        {planBlocks.length > 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-6 text-center text-sm text-muted-foreground">
            The AI-scheduled task blocks are shown in the detailed schedule above.
          </div>
        ) : tasks.length === 0 && !isLoading && !showAdd ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-6 text-center text-sm text-muted-foreground">
            Nothing scheduled for {isToday ? "today" : formatMonthDay(dayStart)}.
          </div>
        ) : null}

        <ul className="space-y-2">
          {planBlocks.length === 0 && tasks.map((task) => {
            const isDone = task.status === "done"
            return (
              <li
                key={task.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-sm",
                  isDone && "opacity-70",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleTask(task)}
                  aria-label={isDone ? "Mark not done" : "Mark done"}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                <span className={cn("inline-block h-2 w-2 rounded-full", priorityDot[task.priority])} />
                <span className={cn("flex-1 text-sm", isDone && "line-through text-muted-foreground")}>
                  {task.title}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">
          Habits <span className="text-sm font-normal text-muted-foreground">({habits.length})</span>
        </h2>

        {habits.length === 0 && !isLoading && (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No habits yet.
          </div>
        )}

        <ul className="space-y-2">
          {habits.map((habit) => {
            const logged = isHabitLogged(habit.id)
            return (
              <li
                key={habit.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm",
                  logged
                    ? "border-sky-300/50 bg-sky-50 dark:border-sky-400/25 dark:bg-sky-500/10"
                    : "border-sky-200/70 bg-sky-50/50 dark:border-sky-400/20 dark:bg-sky-500/5",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-100",
                  )}
                >
                  <Flame className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{habit.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Target {habit.target_count_per_week}× / week
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={logged ? "outline" : "default"}
                  disabled={logged || completingId === habit.id}
                  onClick={() => logHabit(habit)}
                >
                  {logged ? "Logged" : completingId === habit.id ? "..." : "Log"}
                </Button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function updatePlanBlock(plan: ActivePlanRead | null, updated: ActivePlanBlock) {
  if (!plan) return plan
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => (block.id === updated.id ? updated : block)),
    })),
  }
}

function planBlockSubtitle(block: ActivePlanBlock) {
  if (block.type === "meal") {
    const mealType = stringMetadata(block.metadata, "meal_type") || "meal"
    return `AI meal timing · ${mealType}`
  }
  if (block.type === "habit") return "AI-scheduled habit"
  if (block.type === "task") return "AI-scheduled task"
  return "Life block"
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === "string" && value.trim() ? value : null
}

function ingredientMetadata(metadata: Record<string, unknown>): MealIngredientDetail[] {
  const rawIngredients = metadata.ingredients
  if (!Array.isArray(rawIngredients)) return []
  return rawIngredients.flatMap((raw): MealIngredientDetail[] => {
    if (!raw || typeof raw !== "object") return []
    const value = raw as Record<string, unknown>
    const name = value.name
    if (typeof name !== "string" || !name.trim()) return []
    return [
      {
        name,
        quantity: typeof value.quantity === "number" ? value.quantity : null,
        unit: typeof value.unit === "string" ? value.unit : null,
        category: typeof value.category === "string" ? value.category : undefined,
        on_hand: typeof value.on_hand === "boolean" ? value.on_hand : false,
        notes: typeof value.notes === "string" ? value.notes : null,
      },
    ]
  })
}

function buildDailyTimeline({
  dayStart,
  tasks,
  habits,
  completions,
  lifeBlocks,
  calendarEvents,
  planBlocks,
}: {
  dayStart: Date
  tasks: Task[]
  habits: Habit[]
  completions: HabitCompletion[]
  lifeBlocks: LifeBlockOccurrence[]
  calendarEvents: CalendarEvent[]
  planBlocks: ActivePlanBlock[]
}) {
  const items: DailyTimelineItem[] = []

  for (const lifeBlock of lifeBlocks) {
    const cfg = lifeBlockCategoryConfig[lifeBlock.block.category]
    items.push({
      id: `life-${lifeBlock.block.id}-${lifeBlock.start.toISOString()}`,
      type: "life",
      title: lifeBlock.block.title,
      start: lifeBlock.start,
      end: lifeBlock.end,
      subtitle: `${cfg.label} · ${lifeBlock.block.block_type}`,
      lifeBlock,
    })
  }

  for (const event of calendarEvents) {
    items.push({
      id: `calendar-${event.id}`,
      type: "calendar",
      title: event.title,
      start: new Date(event.start_at),
      end: new Date(event.end_at),
      subtitle: event.is_all_day ? "Google Calendar · all day" : "Google Calendar",
      calendarEvent: event,
    })
  }

  if (planBlocks.length > 0) {
    for (const block of planBlocks) {
      items.push({
        id: `plan-${block.id}`,
        type: block.type,
        title: block.title,
        start: new Date(block.start),
        end: new Date(block.end),
        subtitle: planBlockSubtitle(block),
        notes: stringMetadata(block.metadata, "science_rationale") || stringMetadata(block.metadata, "notes"),
        status: block.status,
        planBlock: block,
        ingredients: ingredientMetadata(block.metadata),
      })
    }
  } else {
    for (const task of tasks) {
      const start = task.due_date ? new Date(task.due_date) : atTime(dayStart, 12, 0)
      const end = new Date(start.getTime() + (task.estimated_minutes ?? 30) * 60_000)
      items.push({
        id: `task-${task.id}`,
        type: "task",
        title: task.title,
        start,
        end,
        subtitle: `${task.priority} priority · ${task.category}`,
        notes: task.description,
        status: task.status,
        task,
      })
    }

    habits.forEach((habit, index) => {
      const start = habitStart(dayStart, habit, index)
      const end = new Date(start.getTime() + (habit.estimated_minutes ?? 30) * 60_000)
      const done = completions.some((completion) => completion.habit_id === habit.id)
      items.push({
        id: `habit-${habit.id}`,
        type: "habit",
        title: habit.title,
        start,
        end,
        subtitle: `Target ${habit.target_count_per_week}x / week${done ? " · logged today" : ""}`,
        status: done ? "done" : "planned",
        habit,
      })
    })
  }

  return withBuffers(items)
}

function withBuffers(items: DailyTimelineItem[]) {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime())
  const result: DailyTimelineItem[] = []
  for (const item of sorted) {
    const previous = result[result.length - 1]
    if (previous && previous.type !== "buffer") {
      const gapMs = item.start.getTime() - previous.end.getTime()
      if (gapMs >= 10 * 60_000) {
        result.push({
          id: `buffer-${previous.id}-${item.id}`,
          type: "buffer",
          title: "Buffer / transition",
          start: previous.end,
          end: item.start,
          subtitle: "Reset, travel, prep, or breathe before the next block.",
        })
      }
    }
    result.push(item)
  }
  return result
}

function atTime(day: Date, hour: number, minute: number) {
  const value = new Date(day)
  value.setHours(hour, minute, 0, 0)
  return value
}

function habitStart(day: Date, habit: Habit, index: number) {
  const preferred = (habit.preferred_time_of_day ?? "").toLowerCase()
  if (preferred === "morning") return atTime(day, 9, index * 5)
  if (preferred === "afternoon") return atTime(day, 14, index * 5)
  if (preferred === "evening") return atTime(day, 18, index * 5)
  return atTime(day, 16, index * 5)
}

function DailyTimelineCard({
  item,
  isHabitLogged,
  completingId,
  onToggleTask,
  onLogHabit,
  onPlanItemStatus,
}: {
  item: DailyTimelineItem
  isHabitLogged: boolean
  completingId: number | null
  onToggleTask?: () => void
  onLogHabit?: () => void
  onPlanItemStatus?: (status: ActivePlanItemStatus, feedbackReason?: string | null) => void
}) {
  const Icon = timelineIcon(item.type)
  const isBuffer = item.type === "buffer"
  const onHand = item.ingredients?.filter((ingredient) => ingredient.on_hand) ?? []
  const toBuy = item.ingredients?.filter((ingredient) => !ingredient.on_hand) ?? []
  const isDone = item.status === "done"
  const isSkipped = item.status === "skipped"

  return (
    <article
      className={cn(
        "grid gap-3 rounded-2xl border p-4 shadow-sm md:grid-cols-[150px_1fr]",
        timelineTone(item.type),
        isBuffer && "border-dashed shadow-none",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium md:block">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span>{formatTimeRange(item.start, item.end)}</span>
        </div>
        {item.status ? (
          <span className="rounded-full bg-card/70 px-2 py-0.5 text-[10px] uppercase tracking-wide">
            {item.status}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        <div>
          <h3 className="text-base font-semibold">{item.title}</h3>
          {item.subtitle ? <p className="text-sm opacity-75">{item.subtitle}</p> : null}
        </div>

        {item.planBlock && item.notes ? (
          <p className="rounded-xl bg-card/70 p-3 text-sm">
            <span className="font-medium">AI schedule note:</span> {item.notes}
          </p>
        ) : null}

        {item.planBlock && onPlanItemStatus ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onPlanItemStatus(isDone ? "planned" : "done")}
            >
              {isDone ? "Undo" : "Done"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const reason = window.prompt("Why skip this? Future plans can use this feedback.")
                if (reason === null) return
                onPlanItemStatus("skipped", reason.trim() || null)
              }}
            >
              {isSkipped ? "Update skip" : "Skip"}
            </Button>
          </div>
        ) : null}

        {item.type === "task" && item.task ? (
          <div className="rounded-xl bg-card/70 p-3 text-sm">
            <p>
              <span className="font-medium">Task details:</span> {item.task.description || "No description yet."}
            </p>
            <p className="mt-1 text-xs opacity-75">
              Estimated {item.task.estimated_minutes ?? 30} min · {item.task.energy_level} energy · {item.task.schedule_flexibility}
            </p>
            {onToggleTask ? (
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onToggleTask}>
                {item.task.status === "done" ? "Mark not done" : "Mark done"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {item.type === "habit" && item.habit ? (
          <div className="rounded-xl bg-card/70 p-3 text-sm">
            <p>
              <span className="font-medium">Habit details:</span> target {item.habit.target_count_per_week} times per week.
            </p>
            <p className="mt-1 text-xs opacity-75">
              Estimated {item.habit.estimated_minutes ?? 30} min
              {item.habit.preferred_time_of_day ? ` · prefers ${item.habit.preferred_time_of_day}` : ""}
            </p>
            {onLogHabit ? (
              <Button
                type="button"
                size="sm"
                variant={isHabitLogged ? "outline" : "default"}
                className="mt-3"
                disabled={isHabitLogged || completingId === item.habit.id}
                onClick={onLogHabit}
              >
                {isHabitLogged ? "Logged" : completingId === item.habit.id ? "Logging..." : "Log habit"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {item.type === "meal" ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-card/70 p-3 text-sm">
              <p className="font-medium">Recipe</p>
              <p className="mt-1 whitespace-pre-line text-muted-foreground">
                {item.notes || "Recipe instructions were not included. Regenerate the meal plan to get prep steps."}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TimelineIngredientList title="In your stock" ingredients={onHand} empty="No pantry matches for this meal." />
              <TimelineIngredientList title="Need to buy" ingredients={toBuy} empty="You have everything needed." />
            </div>
          </div>
        ) : null}

        {item.type === "life" && item.lifeBlock ? (
          <p className="rounded-xl bg-card/70 p-3 text-sm">
            This is a {item.lifeBlock.block.block_type} life block for {lifeBlockCategoryConfig[item.lifeBlock.block.category].label.toLowerCase()}.
          </p>
        ) : null}

        {item.type === "calendar" && item.calendarEvent ? (
          <p className="rounded-xl bg-card/70 p-3 text-sm">
            Calendar event synced from Google Calendar.
          </p>
        ) : null}

        {isBuffer ? (
          <p className="text-sm opacity-75">{item.subtitle}</p>
        ) : null}
      </div>
    </article>
  )
}

function TimelineIngredientList({
  title,
  ingredients,
  empty,
}: {
  title: string
  ingredients: MealIngredientDetail[]
  empty: string
}) {
  return (
    <section className="rounded-xl bg-card/70 p-3">
      <p className="text-sm font-medium">{title}</p>
      {ingredients.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {ingredients.map((ingredient) => (
            <li key={ingredient.name} className="text-sm">
              {ingredient.name}
              {formatIngredientAmount(ingredient) ? (
                <span className="text-muted-foreground"> · {formatIngredientAmount(ingredient)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

function formatIngredientAmount(ingredient: MealIngredientDetail) {
  if (ingredient.quantity == null) return ingredient.unit ?? ""
  return `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ""}`
}

function timelineIcon(type: DailyTimelineItemType) {
  if (type === "meal") return Utensils
  if (type === "habit") return Flame
  if (type === "life") return CalendarDays
  if (type === "calendar") return CalendarDays
  if (type === "buffer") return Clock3
  return Circle
}

function timelineTone(type: DailyTimelineItemType) {
  if (type === "meal") return "border-success/30 bg-success/10 text-success"
  if (type === "habit") return "border-sky-300/40 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100"
  if (type === "task") return "border-danger/25 bg-danger/10 text-danger"
  if (type === "calendar") return "border-sky-300/40 bg-sky-50 text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100"
  if (type === "buffer") return "border-border/70 bg-muted/30 text-muted-foreground"
  return "border-border bg-card text-foreground"
}
