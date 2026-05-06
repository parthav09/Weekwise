import { Plus, Check, Flame, Target, Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  completeHabit,
  createHabit,
  deleteHabit,
  listHabitCompletions,
  listHabits,
  updateHabit,
} from "../lib/api"
import type { Habit, HabitCompletion } from "../lib/api"
import {
  formatShortDay,
  getWeekEnd,
  getWeekStart,
  isSameLocalDay,
  toLocalDateKey,
} from "../lib/dates"
import { cn } from "../lib/utils"

export function HabitsPage() {
  const weekStart = useMemo(() => getWeekStart(), [])
  const weekEnd = useMemo(() => getWeekEnd(), [])

  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [completingId, setCompletingId] = useState<number | null>(null)

  // Add form state
  const [newTitle, setNewTitle] = useState("")
  const [newTarget, setNewTarget] = useState("5")
  const [newMinutes, setNewMinutes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [h, c] = await Promise.all([listHabits(), listHabitCompletions(weekStart, weekEnd)])
      setHabits(h)
      setCompletions(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load habits")
    } finally {
      setIsLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return

    setIsSubmitting(true)
    setError(null)
    try {
      const habit = await createHabit({
        title: newTitle.trim(),
        target_count_per_week: Math.max(4, Number(newTarget) || 5),
        estimated_minutes: newMinutes ? Number(newMinutes) : null,
      })
      setHabits((prev) => [habit, ...prev])
      setNewTitle("")
      setNewTarget("5")
      setNewMinutes("")
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create habit")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleComplete(habitId: number) {
    setCompletingId(habitId)
    setError(null)
    try {
      const completion = await completeHabit(habitId)
      setCompletions((prev) => [completion, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log habit")
    } finally {
      setCompletingId(null)
    }
  }

  async function saveHabit(habitId: number, edits: { title: string; target: number; minutes: string }) {
    setError(null)
    try {
      const updated = await updateHabit(habitId, {
        title: edits.title.trim(),
        target_count_per_week: Math.max(1, edits.target),
        estimated_minutes: edits.minutes ? Number(edits.minutes) : null,
      })
      setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update habit")
      throw err
    }
  }

  async function removeHabit(habit: Habit) {
    if (!window.confirm(`Delete "${habit.title}"? All logged completions will be removed.`)) return
    setError(null)
    try {
      await deleteHabit(habit.id)
      setHabits((prev) => prev.filter((h) => h.id !== habit.id))
      setCompletions((prev) => prev.filter((c) => c.habit_id !== habit.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete habit")
    }
  }

  function getCompletionsForHabit(habitId: number) {
    return completions.filter((c) => c.habit_id === habitId)
  }

  function hasLoggedToday(habitId: number) {
    const todayKey = toLocalDateKey()
    return completions.some(
      (completion) =>
        completion.habit_id === habitId &&
        (completion.completed_on === todayKey ||
          isSameLocalDay(completion.completed_at, new Date())),
    )
  }

  const weekDays = useMemo(() => {
    const days = []
    for (let i = 0; i < 7; i++) {
      days.push(new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000))
    }
    return days
  }, [weekStart])

  const totalTarget = habits.reduce((sum, h) => sum + h.target_count_per_week, 0)
  const totalCompleted = completions.length
  const overallProgress = totalTarget ? Math.round((totalCompleted / totalTarget) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Habits</h1>
          <p className="text-sm text-muted-foreground">
            {totalCompleted} of {totalTarget} weekly targets · {overallProgress}% complete
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {showAddForm ? "Cancel" : "New habit"}
        </Button>
      </div>

      {error ? (
        <div
          className="rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-900 shadow-sm backdrop-blur-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {/* Progress bar */}
      <div className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Weekly progress</span>
          <span className="text-muted-foreground">{overallProgress}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, overallProgress)}%` }}
          />
        </div>
      </div>

      {/* Add habit form */}
      {showAddForm && (
        <div className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
          <h3 className="mb-4 font-medium">Start a new habit</h3>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
            <Input
              placeholder="What habit do you want to build?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-11"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                min="1"
                max="7"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="h-11 w-20"
                placeholder="/week"
              />
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                min="1"
                value={newMinutes}
                onChange={(e) => setNewMinutes(e.target.value)}
                className="h-11 w-24"
                placeholder="minutes"
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Creating..." : "Create habit"}
            </Button>
          </form>
        </div>
      )}

      {/* Habits grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {habits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            completions={getCompletionsForHabit(habit.id)}
            weekDays={weekDays}
            isCompleting={completingId === habit.id}
            loggedToday={hasLoggedToday(habit.id)}
            onComplete={() => handleComplete(habit.id)}
            onSave={(edits) => saveHabit(habit.id, edits)}
            onDelete={() => removeHabit(habit)}
          />
        ))}
      </div>

      {habits.length === 0 && !isLoading && (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Target className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-medium">No habits yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Start building consistency by creating your first habit
          </p>
          <Button className="mt-4" onClick={() => setShowAddForm(true)}>
            Create your first habit
          </Button>
        </div>
      )}
    </div>
  )
}

interface HabitCardProps {
  habit: Habit
  completions: HabitCompletion[]
  weekDays: Date[]
  isCompleting: boolean
  loggedToday: boolean
  onComplete: () => void
  onSave: (edits: { title: string; target: number; minutes: string }) => Promise<void>
  onDelete: () => void
}

function HabitCard({
  habit,
  completions,
  weekDays,
  isCompleting,
  loggedToday,
  onComplete,
  onSave,
  onDelete,
}: HabitCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  const count = completions.length
  const progress = Math.round((count / habit.target_count_per_week) * 100)
  const isComplete = count >= habit.target_count_per_week

  if (isEditing) {
    return (
      <HabitEditForm
        habit={habit}
        onCancel={() => setIsEditing(false)}
        onSubmit={async (edits) => {
          await onSave(edits)
          setIsEditing(false)
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border/80 p-5 shadow-sm backdrop-blur-sm transition-all",
        isComplete ? "border-emerald-200/90 bg-emerald-50/60" : "bg-card/90 hover:border-primary/20 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              isComplete ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700",
            )}
          >
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">{habit.title}</h3>
            <p className="text-xs text-muted-foreground">
              {habit.estimated_minutes ? `${habit.estimated_minutes} min · ` : ""}
              {habit.preferred_time_of_day || "Any time"}
            </p>
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Habit actions"
            className="rounded p-1 hover:bg-muted"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false)
                  setIsEditing(true)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">This week</span>
          <span className={cn("font-medium", isComplete ? "text-emerald-700" : "text-foreground")}>
            {count}/{habit.target_count_per_week}
          </span>
        </div>

        <div className="flex gap-1.5">
          {weekDays.map((day, index) => {
            const hasCompletion = completions.some(
              (c) => c.completed_on === toLocalDateKey(day) || isSameLocalDay(c.completed_at, day),
            )
            const isToday = day.toDateString() === new Date().toDateString()

            return (
              <div key={index} className={cn("flex flex-1 flex-col items-center gap-1")}>
                <div
                  className={cn(
                    "flex h-8 w-full items-center justify-center rounded-lg border-2 transition-colors",
                    hasCompletion
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-muted bg-transparent",
                    isToday && !hasCompletion && "border-primary ring-1 ring-primary/15",
                  )}
                >
                  {hasCompletion && (
                    <Check className="h-3.5 w-3.5 stroke-[3] text-white" aria-hidden />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatShortDay(day).charAt(0)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isComplete ? "bg-emerald-500" : "bg-orange-400",
            )}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>

      <Button
        className={cn(
          "mt-4 w-full",
          isComplete ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-500 hover:bg-orange-600",
        )}
        onClick={onComplete}
        disabled={isCompleting || loggedToday}
        aria-busy={isCompleting}
      >
        {isCompleting ? (
          "Logging..."
        ) : loggedToday ? (
          <>
            <Check className="mr-1.5 h-4 w-4" />
            Logged today
          </>
        ) : isComplete ? (
          <>
            <Check className="mr-1.5 h-4 w-4" />
            Log today
          </>
        ) : (
          <>
            <Flame className="mr-1.5 h-4 w-4" />
            I did this today
          </>
        )}
      </Button>
    </div>
  )
}

interface HabitEditFormProps {
  habit: Habit
  onCancel: () => void
  onSubmit: (edits: { title: string; target: number; minutes: string }) => Promise<void>
}

function HabitEditForm({ habit, onCancel, onSubmit }: HabitEditFormProps) {
  const [title, setTitle] = useState(habit.title)
  const [target, setTarget] = useState(String(habit.target_count_per_week))
  const [minutes, setMinutes] = useState(habit.estimated_minutes ? String(habit.estimated_minutes) : "")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSubmit({ title, target: Number(target) || 1, minutes })
    } catch {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-primary/30 bg-card p-5 shadow-sm"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-10"
        autoFocus
        placeholder="Habit name"
      />
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            min="1"
            max="7"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-10 w-20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            min="1"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="h-10 w-24"
            placeholder="minutes"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  )
}
