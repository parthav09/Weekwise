import { ArrowRight, CheckCircle2, Flame, Plus, Target, TrendingUp } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { listExtractedCandidates, listHabitCompletions, listHabits, listTasks, createTask } from "../lib/api"
import type { Habit, HabitCompletion, Task } from "../lib/api"
import { warnError } from "../lib/browserWarnings"
import { formatMonthDay, formatShortDay, getWeekDays, getWeekEnd, getWeekStart, isSameLocalDay } from "../lib/dates"
import { cn } from "../lib/utils"

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

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
  const [quickTask, setQuickTask] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
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
        warnError(err, "Something went wrong")
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
  const momentum = Math.round(((doneTasks.length + habitDone) / Math.max(1, tasks.length + habitTarget)) * 100)

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!quickTask.trim()) return
    setIsAdding(true)
    try {
      const task = await createTask({ title: quickTask.trim(), priority: "medium" })
      setTasks((prev) => [task, ...prev])
      setQuickTask("")
    } catch (err) {
      warnError(err, "Couldn't create task")
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

  const todayCount = getDayItems(new Date()).length

  const stats = [
    { icon: Target, label: "Open tasks", value: String(openTasks.length), sub: `${doneTasks.length} done`, color: "text-primary", bg: "bg-primary/12" },
    { icon: Flame, label: "Habits this week", value: `${habitDone}/${habitTarget}`, sub: `${habitProgress}% complete`, color: "text-accent", bg: "bg-accent/12" },
    { icon: CheckCircle2, label: "Done today", value: String(todayCount), sub: "tasks & habits", color: "text-success", bg: "bg-success/12" },
    { icon: TrendingUp, label: "Momentum", value: `${momentum}%`, sub: "weekly score", color: "text-warning", bg: "bg-warning/12" },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-12 animate-fade-up">
      {/* Email inbox nudge */}
      {pendingEmailTaskCount > 0 ? (
        <Link
          to="/inbox"
          className="flex items-center justify-between gap-4 rounded-2xl bg-accent/10 px-5 py-3.5 text-sm text-accent-foreground transition-colors hover:bg-accent/15"
        >
          <span className="font-medium text-foreground">
            {pendingEmailTaskCount} email task{pendingEmailTaskCount === 1 ? "" : "s"} waiting in your inbox
          </span>
          <ArrowRight className="h-4 w-4 text-accent" />
        </Link>
      ) : null}

      {/* ── Hero greeting ── */}
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          {getGreeting()}.
        </h1>
        <p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground">
          {isLoading
            ? "Gathering your week…"
            : openTasks.length === 0 && habitTarget === 0
            ? "A clean slate. Add a task or start a habit to set the tone for your week."
            : `You have ${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} and you've completed ${habitDone} of ${habitTarget} habit${habitTarget === 1 ? "" : "s"} this week.`}
        </p>

        {/* Quick add — quiet underline field, not a boxed control */}
        <form onSubmit={handleQuickAdd} className="mt-6 flex items-center gap-3 border-b border-border/70 pb-2 focus-within:border-primary/60">
          <Plus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            placeholder="What needs doing?"
            value={quickTask}
            onChange={(e) => setQuickTask(e.target.value)}
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
          />
          {quickTask.trim() ? (
            <button
              type="submit"
              disabled={isAdding}
              className="flex-shrink-0 text-sm font-medium text-primary transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              Add
            </button>
          ) : null}
        </form>
      </header>

      {/* ── Stats ticker — numbers, no boxes ── */}
      <section className="flex flex-wrap items-start gap-x-12 gap-y-8 border-y border-border/70 py-7">
        {isLoading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
            ))
          : stats.map((s) => (
              <div key={s.label} className="flex items-start gap-3">
                <span className={cn("mt-1 flex h-8 w-8 items-center justify-center rounded-full", s.bg)}>
                  <s.icon className={cn("h-4 w-4", s.color)} />
                </span>
                <div>
                  <p className="stat-value font-display text-3xl font-semibold leading-none">{s.value}</p>
                  <p className="mt-1.5 text-sm text-foreground">{s.label}</p>
                  {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
                </div>
              </div>
            ))}
      </section>

      {/* ── This week ── */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold">This week</h2>
          <span className="text-sm text-muted-foreground">
            {formatMonthDay(weekStart)} – {formatMonthDay(weekEnd)}
          </span>
        </div>

        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="flex min-w-[560px] gap-2.5">
            {weekDays.map((day) => {
              const items = getDayItems(day)
              const isToday = day.toDateString() === new Date().toDateString()
              const isFuture = day > new Date()

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative flex-1 rounded-2xl px-2.5 py-3 transition-colors",
                    isToday ? "bg-primary/10 ring-1 ring-primary/25" : "panel",
                    isFuture && "opacity-60",
                  )}
                >
                  <div className="mb-2 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {formatShortDay(day)}
                    </p>
                    <p className={cn("mt-0.5 font-display text-2xl font-semibold", isToday && "text-primary")}>
                      {day.getDate()}
                    </p>
                  </div>

                  <div className="space-y-1">
                    {items.length > 0 ? (
                      items.slice(0, 3).map((item, i) => (
                        <div
                          key={i}
                          className={cn(
                            "truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            item.type === "habit"
                              ? "bg-success/15 text-success"
                              : "bg-accent/15 text-accent",
                          )}
                        >
                          {item.title}
                        </div>
                      ))
                    ) : (
                      <div className="py-3 text-center text-lg text-muted-foreground/25">·</div>
                    )}
                    {items.length > 3 && (
                      <p className="text-center text-[10px] text-muted-foreground">+{items.length - 3}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Task
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Habit
          </span>
        </div>
      </section>

      {/* ── Open tasks ── */}
      <section>
        <div className="mb-3 flex items-baseline justify-between border-b border-border/70 pb-3">
          <h2 className="font-display text-2xl font-semibold">Open tasks</h2>
          <Link to="/tasks" className="flex items-center gap-1 text-sm text-primary hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-border/60">
          {isLoading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
                  <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
                </div>
              ))
            : openTasks.slice(0, 6).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:text-primary"
                  onClick={() => navigate("/tasks")}
                >
                  <span
                    className={cn(
                      "h-2 w-2 flex-shrink-0 rounded-full",
                      task.priority === "urgent" || task.priority === "high"
                        ? "bg-danger"
                        : task.priority === "medium"
                        ? "bg-warning"
                        : "bg-primary/50",
                    )}
                  />
                  <span className="flex-1 truncate text-[15px]">{task.title}</span>
                </button>
              ))}
          {!isLoading && openTasks.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-muted-foreground">All clear — no open tasks.</p>
              <button onClick={() => navigate("/tasks")} className="mt-2 text-sm text-primary hover:underline">
                Add one
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Active habits ── */}
      <section>
        <div className="mb-4 flex items-baseline justify-between border-b border-border/70 pb-3">
          <h2 className="font-display text-2xl font-semibold">Active habits</h2>
          <Link to="/habits" className="flex items-center gap-1 text-sm text-primary hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="space-y-5">
          {isLoading
            ? [1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
                </div>
              ))
            : habits.slice(0, 4).map((habit) => {
                const count = completions.filter((c) => c.habit_id === habit.id).length
                const pct = Math.min(100, Math.round((count / habit.target_count_per_week) * 100))
                return (
                  <div key={habit.id}>
                    <div className="mb-2 flex items-baseline justify-between">
                      <p className="text-[15px] font-medium">{habit.title}</p>
                      <span className="text-sm text-muted-foreground">
                        {count}/{habit.target_count_per_week}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-success/80 to-success transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
          {!isLoading && habits.length === 0 && (
            <div className="py-4 text-center">
              <p className="text-muted-foreground">No habits yet.</p>
              <button onClick={() => navigate("/habits")} className="mt-1 text-sm text-primary hover:underline">
                Start one
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
