import {
  CheckCircle2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flame,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  createTask,
  deleteTask,
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
  getWeekDays,
  getWeekEnd,
  getWeekStart,
  isSameLocalDay,
  toLocalDateKey,
} from "../lib/dates"
import {
  expandLifeBlocks,
  formatTimeRange,
  groupOccurrencesByDay,
  type LifeBlockOccurrence,
} from "../lib/lifeBlocks"
import { lifeBlockCategoryConfig } from "../lib/lifeBlockCategories"
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

interface MealDetail {
  title: string
  start: string
  end: string
  mealType: string
  notes: string | null
  ingredients: MealIngredientDetail[]
}

function dayAtNoon(day: Date) {
  const d = new Date(day)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

function shiftWeek(start: Date, weeks: number) {
  const next = new Date(start)
  next.setDate(next.getDate() + weeks * 7)
  return next
}

export function WeeklyPlanPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart())
  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  const [tasks, setTasks] = useState<Task[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [lifeBlocks, setLifeBlocks] = useState<LifeBlock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [plan, setPlan] = useState<ActivePlanRead | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedMeal, setSelectedMeal] = useState<MealDetail | null>(null)

  const loadWeek = useCallback(async () => {
    setIsLoading(true)
    try {
      const [t, h, c, lb, events] = await Promise.all([
        listTasks({ dueFrom: weekStart, dueTo: weekEnd, includeUnscheduled: true }),
        listHabits(),
        listHabitCompletions(weekStart, weekEnd),
        listLifeBlocks({ startFrom: weekStart, endTo: weekEnd }),
        listGoogleCalendarEvents(weekStart, weekEnd).catch((err) => {
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
      warnError(err, "Couldn't load this week")
    } finally {
      setIsLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    void loadWeek()
  }, [loadWeek])

  useEffect(() => {
    let cancelled = false
    async function loadActive() {
      try {
        const active = await getActivePlan({
          scope: "week",
          start_at: weekStart,
          end_at: new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59),
        })
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
  }, [weekStart, weekEnd])

  async function handleGeneratePlan() {
    setPlanLoading(true)
    setSuccessMessage(null)
    const endAt = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59)
    try {
      const result = await generateAndSaveActivePlan({
        start_at: weekStart,
        end_at: endAt,
      }, "week")
      setPlan(planReadToOptimisticActivePlan(result, "week"))
      const itemCount = result.days.reduce(
        (sum, day) => sum + day.blocks.filter((item) => item.type !== "life").length,
        0,
      )
      setSuccessMessage(
        `Showing ${itemCount} AI-scheduled item${itemCount === 1 ? "" : "s"} now. Saving the active plan in the background.`,
      )
      void waitForActivePlan({
        scope: "week",
        start_at: weekStart,
        end_at: endAt,
      }, 6, 350, result.generated_at)
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

  async function handleQuickAdd(day: Date, title: string, priority: TaskPriority) {
    try {
      const task = await createTask({
        title,
        priority,
        due_date: dayAtNoon(day),
      })
      setTasks((prev) => [...prev, task])
    } catch (err) {
      warnError(err, "Couldn't add task")
    }
  }

  async function handleToggleDone(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done"
    try {
      const updated = await updateTask(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      warnError(err, "Couldn't update task")
    }
  }

  async function handleMove(task: Task, day: Date) {
    try {
      const updated = await updateTask(task.id, { due_date: dayAtNoon(day) })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      warnError(err, "Couldn't move task")
    }
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    try {
      await deleteTask(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch (err) {
      warnError(err, "Couldn't delete task")
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

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const day of weekDays) map.set(toLocalDateKey(day), [])
    for (const task of tasks) {
      if (!task.due_date) continue
      const key = toLocalDateKey(new Date(task.due_date))
      map.get(key)?.push(task)
    }
    return map
  }, [tasks, weekDays])

  const completionsByDay = useMemo(() => {
    const map = new Map<string, HabitCompletion[]>()
    for (const day of weekDays) map.set(toLocalDateKey(day), [])
    for (const c of completions) {
      const key = c.completed_on || toLocalDateKey(new Date(c.completed_at))
      map.get(key)?.push(c)
    }
    return map
  }, [completions, weekDays])

  const lifeBlocksByDay = useMemo(() => {
    const occurrences = expandLifeBlocks(lifeBlocks, weekStart, weekEnd)
    return groupOccurrencesByDay(occurrences)
  }, [lifeBlocks, weekStart, weekEnd])

  const calendarEventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of weekDays) map.set(toLocalDateKey(day), [])
    for (const event of calendarEvents) {
      const start = new Date(event.start_at)
      const end = new Date(event.end_at)
      for (const day of weekDays) {
        const dayStart = new Date(day)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(day)
        dayEnd.setHours(23, 59, 59, 999)
        if (end > dayStart && start <= dayEnd) {
          map.get(toLocalDateKey(day))?.push(event)
        }
      }
    }
    for (const events of map.values()) {
      events.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    }
    return map
  }, [calendarEvents, weekDays])

  const today = new Date()
  const isCurrentWeek = isSameLocalDay(weekStart, getWeekStart(today))
  const visiblePlanStart = getVisiblePlanStart(weekStart, weekEnd, today)
  const stalePlanReason = useMemo(
    () => planStaleReason(plan, tasks, habits),
    [plan, tasks, habits],
  )
  const displayPlan = stalePlanReason ? null : plan

  const planBlocksByDay = useMemo(() => {
    const map = new Map<string, ActivePlanBlock[]>()
    if (!displayPlan) return map
    for (const day of displayPlan.days) {
      const filtered = day.blocks.filter(
        (b) => b.type !== "life" && new Date(b.end) >= visiblePlanStart,
      )
      if (filtered.length) map.set(day.date, filtered)
    }
    return map
  }, [displayPlan, visiblePlanStart])

  const plannedTaskSourceIds = useMemo(() => {
    const ids = new Set<number>()
    if (!displayPlan) return ids
    for (const day of displayPlan.days) {
      for (const block of day.blocks) {
        if (
          block.type === "task" &&
          typeof block.source_id === "number" &&
          new Date(block.end) >= visiblePlanStart
        ) {
          ids.add(block.source_id)
        }
      }
    }
    return ids
  }, [displayPlan, visiblePlanStart])

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done"),
    [tasks],
  )
  const untimedTasks = useMemo(
    () => openTasks.filter((task) => !task.due_date),
    [openTasks],
  )

  const totalTasks = tasks.length
  const doneTasks = tasks.filter((t) => t.status === "done").length
  const totalHabitTarget = habits.reduce((sum, h) => sum + h.target_count_per_week, 0)
  const weekLabel = `${formatMonthDay(weekStart)} – ${formatMonthDay(weekDays[6])}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Weekly Plan</h1>
          <p className="text-sm text-muted-foreground">
            {weekLabel} · {doneTasks}/{totalTasks} tasks done · {completions.length}/{totalHabitTarget} habit completions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart((s) => shiftWeek(s, -1))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={isCurrentWeek ? "default" : "outline"}
            size="sm"
            onClick={() => setWeekStart(getWeekStart())}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart((s) => shiftWeek(s, 1))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant={displayPlan ? "outline" : "default"}
            size="sm"
            disabled={planLoading}
            onClick={handleGeneratePlan}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {planLoading ? "Generating AI schedule..." : "Generate AI schedule"}
          </Button>
          {displayPlan && <PlanGeneratorBadge generator={displayPlan.generator} />}
          {displayPlan && (
            <Button variant="ghost" size="icon" onClick={() => setPlan(null)} aria-label="Hide plan">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {stalePlanReason ? (
        <div className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning shadow-sm">
          <p className="font-medium">Plan needs regeneration</p>
          <p className="mt-0.5 text-xs">
            {stalePlanReason}. Generate a new AI schedule so the weekly plan includes the latest tasks and habits.
          </p>
        </div>
      ) : null}

      {displayPlan && displayPlan.notes.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning shadow-sm">
          <p className="mb-1 font-medium">Heads up while planning</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {displayPlan.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {successMessage ? (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success shadow-sm">
          {successMessage}
        </div>
      ) : null}

      <WeekOverviewStrip
        tasks={openTasks}
        untimedTasks={untimedTasks}
        habits={habits}
        completions={completions}
        plannedTaskSourceIds={plannedTaskSourceIds}
      />

      <div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {weekDays.map((day) => {
            const dayKey = toLocalDateKey(day)
            const dayTasks = tasksByDay.get(dayKey) ?? []
            const dayCompletions = completionsByDay.get(dayKey) ?? []
            const dayLifeBlocks = lifeBlocksByDay.get(dayKey) ?? []
            const dayCalendarEvents = calendarEventsByDay.get(dayKey) ?? []
            const dayPlanBlocks = planBlocksByDay.get(dayKey) ?? []
            const isToday = isSameLocalDay(day, today)

            return (
              <DayColumn
                key={dayKey}
                day={day}
                isToday={isToday}
                tasks={dayTasks}
                habits={habits}
                completions={dayCompletions}
                lifeBlocks={dayLifeBlocks}
                calendarEvents={dayCalendarEvents}
                planBlocks={dayPlanBlocks}
                weekDays={weekDays}
                onQuickAdd={(title, priority) => handleQuickAdd(day, title, priority)}
                onToggleDone={handleToggleDone}
                onMove={handleMove}
                onDelete={handleDelete}
                onMealSelect={setSelectedMeal}
                onPlanItemStatus={handlePlanItemStatus}
              />
            )
          })}
        </div>
      </div>

      {selectedMeal ? (
        <MealDetailDialog meal={selectedMeal} onClose={() => setSelectedMeal(null)} />
      ) : null}

      {!isLoading && tasks.length === 0 && completions.length === 0 && !displayPlan && (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          Nothing scheduled this week yet. Use the + on any day to add a task.
        </div>
      )}
    </div>
  )
}

function WeekOverviewStrip({
  tasks,
  untimedTasks,
  habits,
  completions,
  plannedTaskSourceIds,
}: {
  tasks: Task[]
  untimedTasks: Task[]
  habits: Habit[]
  completions: HabitCompletion[]
  plannedTaskSourceIds: Set<number>
}) {
  if (tasks.length === 0 && habits.length === 0) return null

  const completionsByHabit = new Map<number, number>()
  for (const completion of completions) {
    completionsByHabit.set(
      completion.habit_id,
      (completionsByHabit.get(completion.habit_id) ?? 0) + 1,
    )
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card/70 px-3 py-2.5 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <section className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Open tasks</span>
            <span>{tasks.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <TaskOverviewPill
                  key={task.id}
                  task={task}
                  isPlanned={plannedTaskSourceIds.has(task.id)}
                  isUntimed={!task.due_date}
                />
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No open tasks</span>
            )}
          </div>
          {untimedTasks.length > 0 ? (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              {untimedTasks.length} without time
            </div>
          ) : null}
        </section>

        <section className="min-w-0 border-t border-border/60 pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Habits</span>
            <span>{completions.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {habits.length > 0 ? (
              habits.map((habit) => (
                <HabitOverviewPill
                  key={habit.id}
                  habit={habit}
                  completed={completionsByHabit.get(habit.id) ?? 0}
                />
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No habits</span>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function TaskOverviewPill({
  task,
  isPlanned,
  isUntimed,
}: {
  task: Task
  isPlanned: boolean
  isUntimed: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-5",
        isPlanned
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-danger/20 bg-danger/5 text-danger",
      )}
      title={`${task.title} · ${formatTaskMeta(task, isPlanned, isUntimed)}`}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priorityDot[task.priority])} />
      <span className="truncate">{task.title}</span>
      <span className="shrink-0 text-[10px] opacity-70">
        {formatTaskMeta(task, isPlanned, isUntimed)}
      </span>
    </span>
  )
}

function HabitOverviewPill({ habit, completed }: { habit: Habit; completed: number }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-sky-300/50 bg-sky-50 px-2 py-0.5 text-[11px] leading-5 text-sky-800 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-100"
      title={`${habit.title} · ${completed}/${habit.target_count_per_week}`}
    >
      <Flame className="h-3 w-3 shrink-0" />
      <span className="truncate">{habit.title}</span>
      <span className="shrink-0 text-[10px] opacity-70">
        {completed}/{habit.target_count_per_week}
      </span>
    </span>
  )
}

function formatTaskMeta(task: Task, isPlanned: boolean, isUntimed: boolean) {
  if (isPlanned) return "planned"
  if (isUntimed) return "no time"
  if (!task.due_date) return task.priority
  const due = new Date(task.due_date)
  return due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

function getVisiblePlanStart(weekStart: Date, weekEnd: Date, today: Date) {
  if (weekStart <= today && today <= weekEnd) {
    const startOfToday = new Date(today)
    startOfToday.setHours(0, 0, 0, 0)
    return startOfToday
  }
  return weekStart
}

function planStaleReason(plan: ActivePlanRead | null, tasks: Task[], habits: Habit[]) {
  if (!plan) return null
  const generatedAt = new Date(plan.generated_at).getTime()
  if (!Number.isFinite(generatedAt)) return null
  const toleranceMs = 1000

  const hasNewTask = tasks.some((task) => {
    const createdAt = new Date(task.created_at).getTime()
    return Number.isFinite(createdAt) && createdAt > generatedAt + toleranceMs
  })
  const hasChangedHabit = habits.some((habit) => {
    const createdAt = new Date(habit.created_at).getTime()
    const updatedAt = new Date(habit.updated_at).getTime()
    return (
      (Number.isFinite(createdAt) && createdAt > generatedAt + toleranceMs) ||
      (Number.isFinite(updatedAt) && updatedAt > generatedAt + toleranceMs)
    )
  })

  if (hasNewTask && hasChangedHabit) return "Tasks and habits changed after this plan was generated"
  if (hasNewTask) return "Tasks were added after this plan was generated"
  if (hasChangedHabit) return "Habits changed after this plan was generated"
  return null
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

interface DayColumnProps {
  day: Date
  isToday: boolean
  tasks: Task[]
  habits: Habit[]
  completions: HabitCompletion[]
  lifeBlocks: LifeBlockOccurrence[]
  calendarEvents: CalendarEvent[]
  planBlocks: ActivePlanBlock[]
  weekDays: Date[]
  onQuickAdd: (title: string, priority: TaskPriority) => void
  onToggleDone: (task: Task) => void
  onMove: (task: Task, day: Date) => void
  onDelete: (task: Task) => void
  onMealSelect: (meal: MealDetail) => void
  onPlanItemStatus: (
    block: ActivePlanBlock,
    status: ActivePlanItemStatus,
    feedbackReason?: string | null,
  ) => void
}

function DayColumn({
  day,
  isToday,
  tasks,
  habits,
  completions,
  lifeBlocks,
  calendarEvents,
  planBlocks,
  weekDays,
  onQuickAdd,
  onToggleDone,
  onMove,
  onDelete,
  onMealSelect,
  onPlanItemStatus,
}: DayColumnProps) {
  const [adding, setAdding] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftPriority, setDraftPriority] = useState<TaskPriority>("medium")

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draftTitle.trim()) return
    onQuickAdd(draftTitle.trim(), draftPriority)
    setDraftTitle("")
    setDraftPriority("medium")
    setAdding(false)
  }

  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const completedHabitIds = new Set(completions.map((completion) => completion.habit_id))
  const plannedHabitIds = new Set(
    planBlocks
      .filter((block) => block.type === "habit" && typeof block.source_id === "number")
      .map((block) => block.source_id as number),
  )
  const habitTargets =
    dayStart < todayStart
      ? []
      : habits.filter(
          (habit) => !completedHabitIds.has(habit.id) && !plannedHabitIds.has(habit.id),
        )

  return (
    <div
      className={cn(
        "fluid-card flex min-h-[360px] flex-col overflow-hidden transition-shadow hover:shadow-card-hover",
        isToday ? "ring-2 ring-primary/35" : "",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3",
          isToday
            ? "bg-primary/10 text-primary"
            : "bg-gradient-to-r from-card to-muted/40 text-foreground",
        )}
      >
        <Link
          to={`/today?date=${toLocalDateKey(day)}`}
          className="min-w-0 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-card/70"
          title="Open detailed daily view"
        >
          <p className="text-xs uppercase tracking-wide opacity-70">
            {formatShortDay(day)}
          </p>
          <p className="text-xl font-semibold">
            {day.getDate()}
          </p>
        </Link>
        <button
          type="button"
          aria-label="Add task to this day"
          className="rounded-full bg-card/80 p-2 text-muted-foreground shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-2.5">

      {lifeBlocks.length > 0 && (
        <div className="mb-3 space-y-1">
          {lifeBlocks.map((occ) => {
            const cfg = lifeBlockCategoryConfig[occ.block.category]
            return (
              <div
                key={`${occ.block.id}-${occ.start.toISOString()}`}
                className={cn(
                  "rounded-lg px-2 py-1 text-[11px] font-medium",
                  cfg.className,
                  occ.block.block_type === "blocked"
                    ? "border-l-2 border-current"
                    : occ.block.block_type === "recovery"
                      ? "border-l-2 border-dashed border-current"
                      : "border-l-2 border-current/40",
                )}
                title={`${cfg.label} · ${occ.block.block_type}`}
              >
                <div className="truncate">{occ.block.title}</div>
                <div className="text-[10px] opacity-70">{formatTimeRange(occ.start, occ.end)}</div>
              </div>
            )
          })}
        </div>
      )}

      {calendarEvents.length > 0 && (
        <div className="mb-3 space-y-1">
          {calendarEvents.map((event) => (
            <CalendarEventChip key={event.id} event={event} />
          ))}
        </div>
      )}

      {adding && (
        <form onSubmit={handleSubmit} className="mb-3 space-y-2 rounded-xl border border-border bg-card p-2 shadow-sm">
          <Input
            placeholder="Task title"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
          <div className="flex gap-1.5">
            <select
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value as TaskPriority)}
              className="h-8 flex-1 rounded-lg border border-border bg-card px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <Button type="submit" size="sm" className="h-8 px-2 text-xs">
              Add
            </Button>
          </div>
        </form>
      )}

      {planBlocks.length > 0 && (
        <div className="mt-2 border-t border-dashed border-accent/40 pt-2">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-accent">
            <Sparkles className="h-3 w-3" />
            AI schedule
          </p>
          <div className="space-y-1">
            {planBlocks.map((block) => (
              <PlanBlockChip
                key={block.id}
                block={block}
                onMealSelect={onMealSelect}
                onStatusChange={onPlanItemStatus}
              />
            ))}
          </div>
        </div>
      )}

      {habitTargets.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-primary/15 pt-2">
          <p className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-primary">
            <span>Habits</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px]">{habitTargets.length}</span>
          </p>
          {habitTargets.map((habit) => (
            <HabitTargetRow key={habit.id} habit={habit} />
          ))}
        </div>
      )}

      <div className="mt-2 space-y-1.5 border-t border-danger/15 pt-2">
        <p className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-danger">
          <span>Tasks</span>
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px]">{tasks.length}</span>
        </p>
        {tasks.length === 0 && !adding ? (
          <div className="rounded-lg border border-dashed border-border/60 p-2 text-center text-xs text-muted-foreground">
            No tasks
          </div>
        ) : null}
        {tasks.map((task) => (
          <CompactTaskRow
            key={task.id}
            task={task}
            currentDay={day}
            weekDays={weekDays}
            onToggleDone={() => onToggleDone(task)}
            onMove={(newDay) => onMove(task, newDay)}
            onDelete={() => onDelete(task)}
          />
        ))}
      </div>

      {completions.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Habits done
          </p>
          <div className="flex flex-wrap gap-1">
            {completions.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-200"
              >
                <Flame className="h-3 w-3" />
                {c.habit_title}
              </span>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function PlanGeneratorBadge({ generator }: { generator: ActivePlanRead["generator"] }) {
  const isAi = generator === "ai"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        isAi ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground",
      )}
      title={isAi ? "Generated by Gemini" : "Generated by built-in rules"}
    >
      {isAi ? "AI" : "Rules"}
    </span>
  )
}

function PlanBlockChip({
  block,
  onMealSelect,
  onStatusChange,
}: {
  block: ActivePlanBlock
  onMealSelect: (meal: MealDetail) => void
  onStatusChange: (
    block: ActivePlanBlock,
    status: ActivePlanItemStatus,
    feedbackReason?: string | null,
  ) => void
}) {
  const start = new Date(block.start)
  const end = new Date(block.end)
  const tone = planBlockTone(block.type)
  const isMeal = block.type === "meal"
  const isHabit = block.type === "habit"
  const isDone = block.status === "done"
  const isSkipped = block.status === "skipped"
  const nextStatus: ActivePlanItemStatus = isDone ? "planned" : "done"
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] shadow-sm", tone)}>
      <span className="shrink-0 text-[10px] font-medium opacity-75">
        {formatCompactTime(start)}
      </span>
      {isMeal ? (
        <Utensils className="h-3.5 w-3.5 shrink-0" />
      ) : isHabit ? (
        <Flame className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full bg-current opacity-70" />
      )}
      <div className={cn("min-w-0 flex-1", (isDone || isSkipped) && "opacity-65")}>
        <div className={cn("truncate font-medium leading-tight", isDone && "line-through")} title={block.title}>
          {block.title}
        </div>
        <div className="truncate text-[10px] opacity-70">
          {isMeal ? stringMetadata(block.metadata, "meal_type") || "meal" : block.type} · {formatCompactTime(start)}-{formatCompactTime(end)} · {block.status}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {isMeal ? (
          <button
            type="button"
            className="rounded-full bg-card/75 p-1 hover:bg-card"
            onClick={() => onMealSelect(mealDetailFromBlock(block))}
            aria-label="Meal details"
            title="Meal details"
          >
            <Utensils className="h-3 w-3" />
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-full bg-card/75 p-1 hover:bg-card"
          onClick={() => onStatusChange(block, nextStatus)}
          aria-label={isDone ? "Undo done" : "Mark done"}
          title={isDone ? "Undo done" : "Mark done"}
        >
          <CheckCircle2 className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="rounded-full bg-card/75 p-1 hover:bg-card"
          onClick={() => {
            const reason = window.prompt("Why skip this? Future plans can use this feedback.")
            if (reason === null) return
            onStatusChange(block, "skipped", reason.trim() || null)
          }}
          aria-label={isSkipped ? "Update skip reason" : "Skip"}
          title={isSkipped ? "Update skip reason" : "Skip"}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function planBlockTone(type: ActivePlanBlock["type"] | string) {
  if (type === "meal") return "border-success/30 bg-success/10 text-success"
  if (type === "habit") {
    return "border-sky-300/50 bg-sky-50 text-sky-800 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-100"
  }
  if (type === "task") return "border-danger/30 bg-danger/10 text-danger"
  return "border-border bg-muted text-muted-foreground"
}

function mealDetailFromBlock(block: ActivePlanBlock): MealDetail {
  return {
    title: block.title,
    start: block.start,
    end: block.end,
    mealType: stringMetadata(block.metadata, "meal_type") || "meal",
    notes: stringMetadata(block.metadata, "notes"),
    ingredients: ingredientMetadata(block.metadata),
  }
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

function MealDetailDialog({ meal, onClose }: { meal: MealDetail; onClose: () => void }) {
  const onHand = meal.ingredients.filter((ingredient) => ingredient.on_hand)
  const toBuy = meal.ingredients.filter((ingredient) => !ingredient.on_hand)
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-success">
              {meal.mealType} · {formatTimeRange(new Date(meal.start), new Date(meal.end))}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{meal.title}</h2>
            {meal.notes ? <p className="mt-1 text-sm text-muted-foreground">{meal.notes}</p> : null}
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close meal details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <IngredientList title="In your stock" tone="success" ingredients={onHand} empty="Nothing from pantry matched this meal." />
          <IngredientList title="Need to buy" tone="primary" ingredients={toBuy} empty="You have everything needed for this meal." />
        </div>
      </div>
    </div>
  )
}

function IngredientList({
  title,
  tone,
  ingredients,
  empty,
}: {
  title: string
  tone: "success" | "primary"
  ingredients: MealIngredientDetail[]
  empty: string
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <h3 className={cn("text-sm font-semibold", tone === "success" ? "text-success" : "text-primary")}>
        {title}
      </h3>
      {ingredients.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {ingredients.map((ingredient) => (
            <li key={ingredient.name} className="rounded-lg bg-card px-2 py-1.5 text-sm">
              <span className="font-medium">{ingredient.name}</span>
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

function CalendarEventChip({ event }: { event: CalendarEvent }) {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  return (
    <div
      className="rounded-xl border border-primary/20 bg-primary/10 px-2.5 py-2 text-[11px] text-primary shadow-sm"
      title="Google Calendar event"
    >
      <div className="flex items-center gap-1 font-medium leading-tight">
        <CalendarDays className="h-3 w-3 shrink-0" />
        <span className="truncate">{event.title}</span>
      </div>
      <div className="text-[10px] opacity-75">
        {event.is_all_day ? "All day" : formatTimeRange(start, end)}
      </div>
    </div>
  )
}

interface PlanTaskCardProps {
  task: Task
  currentDay: Date
  weekDays: Date[]
  onToggleDone: () => void
  onMove: (day: Date) => void
  onDelete: () => void
}

function HabitTargetRow({ habit }: { habit: Habit }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] text-primary shadow-sm">
      <Flame className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{habit.title}</span>
      <span className="shrink-0 text-[10px] opacity-70">
        {habit.preferred_time_of_day || "any"}
      </span>
    </div>
  )
}

function CompactTaskRow({ task, currentDay, weekDays, onToggleDone, onMove, onDelete }: PlanTaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isDone = task.status === "done"

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-2 py-1 text-[11px] text-danger shadow-sm",
        isDone && "opacity-65",
      )}
    >
      <button
        type="button"
        onClick={onToggleDone}
        className="shrink-0 rounded-full p-0.5 hover:bg-muted"
        aria-label={isDone ? "Mark as not done" : "Mark as done"}
      >
        {isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        ) : (
          <span className={cn("block h-2.5 w-2.5 rounded-full", priorityDot[task.priority])} />
        )}
      </button>
      <span className={cn("min-w-0 flex-1 truncate", isDone && "line-through")}>
        {task.title}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {task.due_date ? formatCompactTime(new Date(task.due_date)) : "No time"}
      </span>
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          aria-label="Task actions"
          className="rounded p-0.5 text-muted-foreground opacity-70 hover:bg-muted group-hover:opacity-100"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <TaskMoveMenu
            currentDay={currentDay}
            weekDays={weekDays}
            onMove={(newDay) => {
              setMenuOpen(false)
              onMove(newDay)
            }}
            onDelete={() => {
              setMenuOpen(false)
              onDelete()
            }}
          />
        )}
      </div>
    </div>
  )
}

function TaskMoveMenu({
  currentDay,
  weekDays,
  onMove,
  onDelete,
}: {
  currentDay: Date
  weekDays: Date[]
  onMove: (day: Date) => void
  onDelete: () => void
}) {
  return (
    <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      <p className="border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        Move to
      </p>
      {weekDays.map((d) => {
        const isCurrent = isSameLocalDay(d, currentDay)
        return (
          <button
            key={d.toISOString()}
            type="button"
            disabled={isCurrent}
            className={cn(
              "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted",
              isCurrent && "cursor-default text-muted-foreground hover:bg-transparent",
            )}
            onClick={() => {
              if (!isCurrent) onMove(d)
            }}
          >
            <span>{formatShortDay(d)}</span>
            <span className="text-muted-foreground">{d.getDate()}</span>
          </button>
        )
      })}
      <button
        type="button"
        className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-xs text-danger hover:bg-danger/10"
        onClick={onDelete}
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
    </div>
  )
}

function formatCompactTime(value: Date) {
  return value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}
