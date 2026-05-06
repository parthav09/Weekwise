import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flame,
  Plus,
  Sparkles,
  X,
} from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { SavedPlanItems } from "../components/SavedPlanItems"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  completeHabit,
  createTask,
  generateDayPlan,
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
  Habit,
  HabitCompletion,
  LifeBlock,
  PlanBlock,
  PlanRead,
  SavedPlan,
  SavedPlanItem,
  SavedPlanItemUpdateInput,
  Task,
  TaskPriority,
} from "../lib/api"
import {
  formatMonthDay,
  formatShortDay,
  isSameLocalDay,
  parseLocalDateKey,
  toLocalDateKey,
} from "../lib/dates"
import { lifeBlockCategoryConfig } from "../lib/lifeBlockCategories"
import { expandLifeBlocks, formatTimeRange } from "../lib/lifeBlocks"
import { cn } from "../lib/utils"

const priorityDot: Record<TaskPriority, string> = {
  low: "bg-primary",
  medium: "bg-warning",
  high: "bg-danger/80",
  urgent: "bg-danger",
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
  const dayKey = toLocalDateKey(dayStart)
  const isToday = isSameLocalDay(dayStart, new Date())

  const [tasks, setTasks] = useState<Task[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [lifeBlocks, setLifeBlocks] = useState<LifeBlock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<number | null>(null)
  const [plan, setPlan] = useState<PlanRead | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([])
  const [updatingSavedItemId, setUpdatingSavedItemId] = useState<number | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftPriority, setDraftPriority] = useState<TaskPriority>("medium")

  const loadDay = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [t, h, c, lb] = await Promise.all([
        listTasks({ dueFrom: dayStart, dueTo: dayEnd }),
        listHabits(),
        listHabitCompletions(dayStart, dayEnd),
        listLifeBlocks({ startFrom: dayStart, endTo: dayEnd }),
      ])
      setTasks(t)
      setHabits(h)
      setCompletions(c)
      setLifeBlocks(lb)
      setSavedPlans(await listSavedPlans({ startFrom: dayStart, endTo: dayEnd }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this day")
    } finally {
      setIsLoading(false)
    }
  }, [dayStart, dayEnd])

  const dayLifeBlocks = useMemo(
    () => expandLifeBlocks(lifeBlocks, dayStart, dayEnd),
    [lifeBlocks, dayStart, dayEnd],
  )

  const planBlocks = useMemo<PlanBlock[]>(() => {
    if (!plan) return []
    return plan.days
      .find((d) => d.date === dayKey)
      ?.blocks.filter((b) => b.type !== "life") ?? []
  }, [plan, dayKey])

  const savedPlanItems = useMemo<SavedPlanItem[]>(() => {
    const items = savedPlans.flatMap((savedPlan) =>
      savedPlan.days
        .filter((day) => day.date === dayKey)
        .flatMap((day) => day.items.filter((item) => item.item_type !== "life")),
    )
    return items.sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    )
  }, [savedPlans, dayKey])

  useEffect(() => {
    void loadDay()
  }, [loadDay])

  useEffect(() => {
    setPlan(null)
  }, [dayKey])

  async function handleGeneratePlan() {
    setPlanLoading(true)
    setError(null)
    try {
      const result = await generateDayPlan({ start_at: dayStart, end_at: dayEnd })
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
      setPlan(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save plan")
    } finally {
      setSavingPlan(false)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update saved plan item")
    } finally {
      setUpdatingSavedItemId(null)
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
    setError(null)
    const newStatus = task.status === "done" ? "todo" : "done"
    try {
      const updated = await updateTask(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update task")
    }
  }

  async function logHabit(habit: Habit) {
    setCompletingId(habit.id)
    setError(null)
    try {
      const completion = await completeHabit(habit.id, dayStart)
      setCompletions((prev) => [completion, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log habit")
    } finally {
      setCompletingId(null)
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!draftTitle.trim()) return
    setError(null)
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
      setError(err instanceof Error ? err.message : "Couldn't add task")
    }
  }

  function isHabitLogged(habitId: number) {
    return completions.some((c) => c.habit_id === habitId && c.completed_on === dayKey)
  }

  const doneTasks = tasks.filter((t) => t.status === "done").length
  const totalThings = tasks.length + habits.length
  const doneThings = doneTasks + habits.filter((h) => isHabitLogged(h.id)).length
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
            {planLoading ? "Generating..." : plan ? "Regenerate" : "Generate plan"}
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

      {planBlocks.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Suggested plan
          </h2>
          <ul className="space-y-2">
            {planBlocks.map((block) => {
              const start = new Date(block.start)
              const end = new Date(block.end)
              const fmt = (d: Date) =>
                d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
              const tone =
                block.type === "habit"
                  ? "border-success/30 bg-success/10"
                  : "border-accent/30 bg-accent/10"
              return (
                <li
                  key={`${block.type}-${block.start}-${block.source_id ?? block.title}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm shadow-sm",
                    tone,
                  )}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-card/80 text-accent">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{block.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {block.type === "habit" ? "Habit" : "Task"} · {fmt(start)} – {fmt(end)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {savedPlanItems.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved plan feedback
          </h2>
          <SavedPlanItems
            items={savedPlanItems}
            updatingItemId={updatingSavedItemId}
            onUpdate={handleUpdateSavedItem}
          />
        </section>
      )}

      {error ? (
        <div
          className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger shadow-sm backdrop-blur-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-sm">
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

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Tasks <span className="text-sm font-normal text-muted-foreground">({tasks.length})</span>
          </h2>
          <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {showAdd ? "Cancel" : "Add task"}
          </Button>
        </div>

        {showAdd && (
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

        {tasks.length === 0 && !isLoading && !showAdd && (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-6 text-center text-sm text-muted-foreground">
            Nothing scheduled for {isToday ? "today" : formatMonthDay(dayStart)}.
          </div>
        )}

        <ul className="space-y-2">
          {tasks.map((task) => {
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
                  logged ? "border-success/30 bg-success/10" : "border-border/80",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    logged ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
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
