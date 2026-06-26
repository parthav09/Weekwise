import { CheckCircle2, Clock, Flame, Target, TrendingUp, Plus, ArrowRight } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { listExtractedCandidates, listHabitCompletions, listHabits, listTasks, createTask } from "../lib/api"
import type { Habit, HabitCompletion, Task, TaskPriority } from "../lib/api"
import { formatMonthDay, formatShortDay, getWeekDays, getWeekEnd, getWeekStart, isSameLocalDay } from "../lib/dates"
import { cn } from "../lib/utils"

export function DashboardPage() {
  const navigate = useNavigate()
  const weekStart = useMemo(() => getWeekStart(), [])
  const weekEnd = useMemo(() => getWeekEnd(), [])
  const weekDays = useMemo(() => getWeekDays(), [])

  const [tasks, setTasks] = useState<Task[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [pendingEmailTaskCount, setPendingEmailTaskCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quickTask, setQuickTask] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const [t, h, c, emailCandidates] = await Promise.all([
          listTasks(),
          listHabits(),
          listHabitCompletions(weekStart, weekEnd),
          listExtractedCandidates({ status: "pending" }),
        ])
        setTasks(t)
        setHabits(h)
        setCompletions(c)
        setPendingEmailTaskCount(emailCandidates.length)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Something went wrong")
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [weekStart, weekEnd])

  const openTasks = tasks.filter((t) => t.status !== "done")
  const doneTasks = tasks.filter((t) => t.status === "done")
  const habitTarget = habits.reduce((sum, h) => sum + h.target_count_per_week, 0)
  const habitDone = completions.length
  const habitProgress = habitTarget ? Math.round((habitDone / habitTarget) * 100) : 0

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!quickTask.trim()) return
    setIsAdding(true)
    try {
      const task = await createTask({ title: quickTask.trim(), priority: "medium" })
      setTasks((prev) => [task, ...prev])
      setQuickTask("")
    } finally {
      setIsAdding(false)
    }
  }

  function getDayItems(day: Date) {
    const taskItems = doneTasks
      .filter((t) => t.completed_at && isSameLocalDay(t.completed_at, day))
      .map((t) => ({ title: t.title, type: "task" as const }))
    const habitItems = completions
      .filter((c) => isSameLocalDay(c.completed_at, day))
      .map((c) => ({ title: c.habit_title, type: "habit" as const }))
    return [...taskItems, ...habitItems]
  }

  const panel = "rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm"

  function priorityDotClass(priority: TaskPriority) {
    switch (priority) {
      case "urgent":
        return "bg-danger"
      case "high":
        return "bg-danger/80"
      case "medium":
        return "bg-warning"
      default:
        return "bg-primary"
    }
  }

  return (
    <div className="space-y-8">
      {loadError ? (
        <div
          className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger shadow-sm backdrop-blur-sm"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      {pendingEmailTaskCount > 0 ? (
        <Link
          to="/inbox"
          className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary shadow-sm"
        >
          <span>
            {pendingEmailTaskCount} email task{pendingEmailTaskCount === 1 ? "" : "s"} waiting
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`${panel} animate-pulse`}>
                <div className="h-9 w-9 rounded-xl bg-muted" />
                <div className="mt-3 h-8 w-16 rounded-lg bg-muted" />
                <div className="mt-2 h-3 w-24 rounded bg-muted" />
              </div>
            ))}
          </>
        ) : (
          <>
            <StatCard
              icon={Target}
              label="Tasks open"
              value={openTasks.length}
              trend={tasks.length > 0 ? `${doneTasks.length} done` : undefined}
              color="primary"
            />
            <StatCard
              icon={Flame}
              label="Habits this week"
              value={`${habitDone}/${habitTarget}`}
              trend={`${habitProgress}% complete`}
              color="success"
            />
            <StatCard
              icon={CheckCircle2}
              label="Done today"
              value={getDayItems(new Date()).length}
              color="blue"
            />
            <StatCard
              icon={TrendingUp}
              label="Weekly momentum"
              value={`${Math.round(
                ((doneTasks.length + habitDone) / Math.max(1, tasks.length + habitTarget)) * 100,
              )}%`}
              color="purple"
            />
          </>
        )}
      </div>

      {/* Main two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left: Quick actions & open items */}
        <div className="space-y-4">
          {/* Quick add */}
          <div className={panel}>
            <h3 className="font-medium">Quick add</h3>
            <form onSubmit={handleQuickAdd} className="mt-3 flex gap-2">
              <Input
                placeholder="What needs doing?"
                value={quickTask}
                onChange={(e) => setQuickTask(e.target.value)}
                className="h-10"
              />
              <Button type="submit" size="sm" disabled={isAdding} className="h-10 px-3">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => navigate("/tasks")}
              >
                Full task view
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => navigate("/habits")}
              >
                Log habit
              </Button>
            </div>
          </div>

          {/* Open tasks preview */}
          <div className={panel}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Open tasks</h3>
              <Link to="/tasks" className="text-xs text-muted-foreground hover:text-foreground">
                See all
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {openTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className={cn("h-2 w-2 rounded-full", priorityDotClass(task.priority))} />
                  <span className="flex-1 truncate text-sm">{task.title}</span>
                  {task.due_date && (
                    <span className="text-xs text-muted-foreground">
                      <Clock className="inline h-3 w-3" />
                    </span>
                  )}
                </div>
              ))}
              {openTasks.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No open tasks. Nice work!
                </p>
              )}
            </div>
          </div>

          {/* Habits quick view */}
          <div className={panel}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Active habits</h3>
              <Link to="/habits" className="text-xs text-muted-foreground hover:text-foreground">
                See all
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {habits.slice(0, 4).map((habit) => {
                const count = completions.filter((c) => c.habit_id === habit.id).length
                const progress = Math.round((count / habit.target_count_per_week) * 100)
                return (
                  <div key={habit.id} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
                      <Flame className="h-4 w-4 text-success" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{habit.title}</p>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-success transition-all"
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {count}/{habit.target_count_per_week}
                    </span>
                  </div>
                )
              })}
              {habits.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No habits yet. Start one!
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Week timeline */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">This week</h2>
            <p className="text-sm text-muted-foreground">
              {formatMonthDay(weekStart)} — {formatMonthDay(weekEnd)}
            </p>
          </div>

          <div className="-mx-4 overflow-x-auto pb-1 sm:mx-0">
            <div className="flex min-w-0 gap-2 px-4 sm:grid sm:grid-cols-7 sm:px-0">
            {weekDays.map((day) => {
              const items = getDayItems(day)
              const isToday = day.toDateString() === new Date().toDateString()
              const isFuture = day > new Date()

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative w-[5.5rem] shrink-0 rounded-xl border border-border/80 bg-card/90 p-3 shadow-sm backdrop-blur-sm sm:w-auto",
                    isToday
                      ? "border-primary shadow-sm ring-1 ring-primary/20"
                      : "hover:border-primary/40",
                    isFuture && "opacity-70"
                  )}
                >
                  {/* Day header */}
                  <div className="mb-3 text-center">
                    <p className="text-xs font-medium text-muted-foreground">
                      {formatShortDay(day)}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-lg font-semibold",
                        isToday && "text-primary"
                      )}
                    >
                      {day.getDate()}
                    </p>
                  </div>

                  {/* Items */}
                  <div className="space-y-1.5">
                    {items.length > 0 ? (
                      items.slice(0, 3).map((item, i) => (
                        <div
                          key={i}
                          className={cn(
                            "truncate rounded-md px-2 py-1 text-xs",
                            item.type === "habit"
                              ? "bg-success/10 text-success"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {item.title}
                        </div>
                      ))
                    ) : (
                      <div className="py-4 text-center">
                        <span className="text-2xl text-muted-foreground/30">—</span>
                      </div>
                    )}
                    {items.length > 3 && (
                      <p className="text-center text-xs text-muted-foreground">
                        +{items.length - 3} more
                      </p>
                    )}
                  </div>

                  {/* Today indicator */}
                  {isToday && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-white">
                      TODAY
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Task
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" />
              Habit
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  trend?: string
  color: "primary" | "success" | "blue" | "purple"
}) {
  const colorClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    blue: "bg-accent/10 text-accent",
    purple: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div className={cn("rounded-xl p-2", colorClasses[color])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {trend && <p className="mt-1 text-xs font-medium text-foreground/70">{trend}</p>}
    </div>
  )
}
