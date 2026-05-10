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
  X,
} from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { SavedPlanItems } from "../components/SavedPlanItems"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  createTask,
  deleteTask,
  exportSavedPlanToGoogleCalendar,
  generateWeekPlan,
  listGoogleCalendarEvents,
  listScheduledNotifications,
  listHabitCompletions,
  listHabits,
  listLifeBlocks,
  listSavedPlans,
  listTasks,
  savePlan,
  updateTask,
  updateSavedPlanItem,
} from "../lib/api"
import type {
  CalendarEvent,
  Habit,
  HabitCompletion,
  LifeBlock,
  PlanBlock,
  PlanRead,
  SavedPlan,
  SavedPlanItem,
  SavedPlanItemUpdateInput,
  ScheduledNotification,
  Task,
  TaskPriority,
} from "../lib/api"
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
  low: "bg-primary",
  medium: "bg-warning",
  high: "bg-danger/80",
  urgent: "bg-danger",
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
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanRead | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([])
  const [updatingSavedItemId, setUpdatingSavedItemId] = useState<number | null>(null)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotification[]>([])
  const [exportingPlanId, setExportingPlanId] = useState<number | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadWeek = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [t, h, c, lb, events, notifications] = await Promise.all([
        listTasks({ dueFrom: weekStart, dueTo: weekEnd }),
        listHabits(),
        listHabitCompletions(weekStart, weekEnd),
        listLifeBlocks({ startFrom: weekStart, endTo: weekEnd }),
        listGoogleCalendarEvents(weekStart, weekEnd),
        listScheduledNotifications({ status: "pending" }),
      ])
      setTasks(t)
      setHabits(h)
      setCompletions(c)
      setLifeBlocks(lb)
      setCalendarEvents(events)
      setScheduledNotifications(notifications)
      setSavedPlans(await listSavedPlans({ startFrom: weekStart, endTo: weekEnd }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this week")
    } finally {
      setIsLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    void loadWeek()
  }, [loadWeek])

  // Plan resets when the visible week changes — it's relative to that window.
  useEffect(() => {
    setPlan(null)
  }, [weekStart])

  async function handleGeneratePlan() {
    setPlanLoading(true)
    setError(null)
    try {
      const result = await generateWeekPlan({
        start_at: weekStart,
        end_at: new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59),
      })
      setPlan(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate plan")
    } finally {
      setPlanLoading(false)
    }
  }

  async function handleSavePlan() {
    if (!plan) return
    setSavingPlan(true)
    setError(null)
    try {
      const saved = await savePlan(plan)
      setSavedPlans((prev) => [saved, ...prev])
      setScheduledNotifications(await listScheduledNotifications({ status: "pending" }))
      setPlan(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save plan")
    } finally {
      setSavingPlan(false)
    }
  }

  async function handleExportSavedPlan(savedPlan: SavedPlan) {
    setExportingPlanId(savedPlan.id)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await exportSavedPlanToGoogleCalendar(savedPlan.id)
      setSuccessMessage(
        `Exported ${result.exported_count} item${result.exported_count === 1 ? "" : "s"} to Google Calendar${result.skipped_count ? `; ${result.skipped_count} already exported` : ""}.`,
      )
      setSavedPlans(await listSavedPlans({ startFrom: weekStart, endTo: weekEnd }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't export saved plan")
    } finally {
      setExportingPlanId(null)
    }
  }

  function replaceSavedItem(updated: SavedPlanItem) {
    setSavedPlans((prev) =>
      prev.map((savedPlan) => ({
        ...savedPlan,
        days: savedPlan.days.map((day) => ({
          ...day,
          items: day.items.map((item) => (item.id === updated.id ? updated : item)),
        })),
      })),
    )
  }

  async function handleUpdateSavedItem(
    item: SavedPlanItem,
    input: SavedPlanItemUpdateInput,
  ) {
    setUpdatingSavedItemId(item.id)
    setError(null)
    try {
      const updated = await updateSavedPlanItem(item.id, input)
      replaceSavedItem(updated)
      setScheduledNotifications(await listScheduledNotifications({ status: "pending" }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update saved plan item")
    } finally {
      setUpdatingSavedItemId(null)
    }
  }

  async function handleQuickAdd(day: Date, title: string, priority: TaskPriority) {
    setError(null)
    try {
      const task = await createTask({
        title,
        priority,
        due_date: dayAtNoon(day),
      })
      setTasks((prev) => [...prev, task])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add task")
    }
  }

  async function handleToggleDone(task: Task) {
    setError(null)
    const newStatus = task.status === "done" ? "todo" : "done"
    try {
      const updated = await updateTask(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update task")
    }
  }

  async function handleMove(task: Task, day: Date) {
    setError(null)
    try {
      const updated = await updateTask(task.id, { due_date: dayAtNoon(day) })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't move task")
    }
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    setError(null)
    try {
      await deleteTask(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete task")
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

  const planBlocksByDay = useMemo(() => {
    const map = new Map<string, PlanBlock[]>()
    if (!plan) return map
    for (const day of plan.days) {
      const filtered = day.blocks.filter((b) => b.type !== "life")
      if (filtered.length) map.set(day.date, filtered)
    }
    return map
  }, [plan])

  const savedItemsByDay = useMemo(() => {
    const map = new Map<string, SavedPlanItem[]>()
    for (const day of weekDays) map.set(toLocalDateKey(day), [])
    for (const savedPlan of savedPlans) {
      for (const day of savedPlan.days) {
        const list = map.get(day.date)
        if (!list) continue
        list.push(...day.items.filter((item) => item.item_type !== "life"))
      }
    }
    for (const items of map.values()) {
      items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    }
    return map
  }, [savedPlans, weekDays])

  const pendingNotificationItemIds = useMemo(() => {
    return new Set(
      scheduledNotifications
        .map((notification) => notification.generated_plan_item_id)
        .filter((id): id is number => id !== null),
    )
  }, [scheduledNotifications])

  const totalTasks = tasks.length
  const doneTasks = tasks.filter((t) => t.status === "done").length
  const totalHabitTarget = habits.reduce((sum, h) => sum + h.target_count_per_week, 0)
  const today = new Date()
  const isCurrentWeek = isSameLocalDay(weekStart, getWeekStart(today))
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
            variant={plan ? "outline" : "default"}
            size="sm"
            disabled={planLoading}
            onClick={handleGeneratePlan}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {planLoading ? "Generating..." : plan ? "Regenerate" : "Generate plan"}
          </Button>
          {plan && <PlanGeneratorBadge generator={plan.generator} />}
          {plan && (
            <Button size="sm" disabled={savingPlan} onClick={handleSavePlan}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              {savingPlan ? "Saving..." : "Accept plan"}
            </Button>
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

      {error ? (
        <div
          className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger shadow-sm backdrop-blur-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success shadow-sm">
          {successMessage}
        </div>
      ) : null}

      {savedPlans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-4 py-3 text-sm shadow-sm">
          <span className="font-medium">Saved plans</span>
          {savedPlans.map((savedPlan) => (
            <Button
              key={savedPlan.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={exportingPlanId === savedPlan.id}
              onClick={() => handleExportSavedPlan(savedPlan)}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {exportingPlanId === savedPlan.id ? "Exporting..." : `Export #${savedPlan.id}`}
            </Button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[900px] grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dayKey = toLocalDateKey(day)
            const dayTasks = tasksByDay.get(dayKey) ?? []
            const dayCompletions = completionsByDay.get(dayKey) ?? []
            const dayLifeBlocks = lifeBlocksByDay.get(dayKey) ?? []
            const dayCalendarEvents = calendarEventsByDay.get(dayKey) ?? []
            const dayPlanBlocks = planBlocksByDay.get(dayKey) ?? []
            const daySavedItems = savedItemsByDay.get(dayKey) ?? []
            const isToday = isSameLocalDay(day, today)

            return (
              <DayColumn
                key={dayKey}
                day={day}
                isToday={isToday}
                tasks={dayTasks}
                completions={dayCompletions}
                lifeBlocks={dayLifeBlocks}
                calendarEvents={dayCalendarEvents}
                planBlocks={dayPlanBlocks}
                savedItems={daySavedItems}
                pendingNotificationItemIds={pendingNotificationItemIds}
                updatingSavedItemId={updatingSavedItemId}
                weekDays={weekDays}
                onQuickAdd={(title, priority) => handleQuickAdd(day, title, priority)}
                onToggleDone={handleToggleDone}
                onMove={handleMove}
                onDelete={handleDelete}
                onUpdateSavedItem={handleUpdateSavedItem}
              />
            )
          })}
        </div>
      </div>

      {!isLoading && tasks.length === 0 && completions.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          Nothing scheduled this week yet. Use the + on any day to add a task.
        </div>
      )}
    </div>
  )
}

interface DayColumnProps {
  day: Date
  isToday: boolean
  tasks: Task[]
  completions: HabitCompletion[]
  lifeBlocks: LifeBlockOccurrence[]
  calendarEvents: CalendarEvent[]
  planBlocks: PlanBlock[]
  savedItems: SavedPlanItem[]
  pendingNotificationItemIds: Set<number>
  updatingSavedItemId: number | null
  weekDays: Date[]
  onQuickAdd: (title: string, priority: TaskPriority) => void
  onToggleDone: (task: Task) => void
  onMove: (task: Task, day: Date) => void
  onDelete: (task: Task) => void
  onUpdateSavedItem: (
    item: SavedPlanItem,
    input: SavedPlanItemUpdateInput,
  ) => void
}

function DayColumn({
  day,
  isToday,
  tasks,
  completions,
  lifeBlocks,
  calendarEvents,
  planBlocks,
  savedItems,
  pendingNotificationItemIds,
  updatingSavedItemId,
  weekDays,
  onQuickAdd,
  onToggleDone,
  onMove,
  onDelete,
  onUpdateSavedItem,
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

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-muted/20 p-3",
        isToday ? "border-primary/40" : "border-border/60",
      )}
    >
      <div className="mb-3 flex items-center justify-between px-0.5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {formatShortDay(day)}
          </p>
          <p className={cn("text-lg font-semibold", isToday && "text-primary")}>
            {day.getDate()}
          </p>
        </div>
        <button
          type="button"
          aria-label="Add task to this day"
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

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

      <div className="flex-1 space-y-2">
        {tasks.length === 0 && !adding && (
          <div className="rounded-xl border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
            No tasks
          </div>
        )}
        {tasks.map((task) => (
          <PlanTaskCard
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

      {planBlocks.length > 0 && (
        <div className="mt-3 border-t border-dashed border-accent/40 pt-3">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-accent">
            <Sparkles className="h-3 w-3" />
            Suggested plan
          </p>
          <div className="space-y-1.5">
            {planBlocks.map((block) => (
              <PlanBlockChip key={`${block.type}-${block.start}-${block.source_id ?? block.title}`} block={block} />
            ))}
          </div>
        </div>
      )}

      {savedItems.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" />
            Saved plan
          </p>
          <SavedPlanItems
            compact
            items={savedItems}
            pendingNotificationItemIds={pendingNotificationItemIds}
            updatingItemId={updatingSavedItemId}
            onUpdate={onUpdateSavedItem}
          />
        </div>
      )}

      {completions.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Habits done
          </p>
          <div className="flex flex-wrap gap-1">
            {completions.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success"
              >
                <Flame className="h-3 w-3" />
                {c.habit_title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PlanGeneratorBadge({ generator }: { generator: PlanRead["generator"] }) {
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

function PlanBlockChip({ block }: { block: PlanBlock }) {
  const start = new Date(block.start)
  const end = new Date(block.end)
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const tone =
    block.type === "habit"
      ? "border-success/30 bg-success/10 text-success"
      : "border-accent/30 bg-accent/10 text-accent"
  return (
    <div className={cn("rounded-lg border border-dashed px-2 py-1 text-[11px]", tone)}>
      <div className="font-medium leading-tight">{block.title}</div>
      <div className="text-[10px] opacity-70">
        {fmt(start)} – {fmt(end)}
      </div>
    </div>
  )
}

function CalendarEventChip({ event }: { event: CalendarEvent }) {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  return (
    <div
      className="rounded-lg border border-sky-300/40 bg-sky-50 px-2 py-1 text-[11px] text-sky-800 shadow-sm dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200"
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

function PlanTaskCard({ task, currentDay, weekDays, onToggleDone, onMove, onDelete }: PlanTaskCardProps) {
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
        "group rounded-xl border border-border/80 bg-card p-2 text-sm shadow-sm transition-colors hover:border-primary/30",
        isDone && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          onClick={onToggleDone}
          className="mt-0.5 flex shrink-0 items-center justify-center"
          aria-label={isDone ? "Mark as not done" : "Mark as done"}
        >
          {isDone ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", priorityDot[task.priority])} />
          )}
        </button>
        <p className={cn("flex-1 leading-snug", isDone && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Task actions"
            className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {menuOpen && (
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
                      setMenuOpen(false)
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
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
