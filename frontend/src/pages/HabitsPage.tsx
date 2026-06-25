import { Check, Clock, Flame, Pencil, Plus, Target, Trash2, X } from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  completeHabit, createHabit, deleteHabit, listHabitCompletions, listHabits, updateHabit,
} from "../lib/api"
import type { Habit, HabitCompletion } from "../lib/api"
import { warnError } from "../lib/browserWarnings"
import { formatShortDay, getWeekEnd, getWeekStart, isSameLocalDay, toLocalDateKey } from "../lib/dates"
import { cn } from "../lib/utils"

/** Circular SVG arc progress ring */
function ProgressRing({ pct, size = 56, stroke = 4, color = "hsl(var(--primary))" }: {
  pct: number; size?: number; stroke?: number; color?: string
}) {
  const r = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} className="progress-ring -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HabitsPage() {
  const weekStart = useMemo(() => getWeekStart(), [])
  const weekEnd = useMemo(() => getWeekEnd(), [])

  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [completingId, setCompletingId] = useState<number | null>(null)

  const [newTitle, setNewTitle] = useState("")
  const [newTarget, setNewTarget] = useState("5")
  const [newMinutes, setNewMinutes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [h, c] = await Promise.all([listHabits(), listHabitCompletions(weekStart, weekEnd)])
      setHabits(h)
      setCompletions(c)
    } catch (err) {
      warnError(err, "Couldn't load habits")
    } finally {
      setIsLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => { void loadData() }, [loadData])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setIsSubmitting(true)
    try {
      const habit = await createHabit({
        title: newTitle.trim(),
        target_count_per_week: Math.max(1, Number(newTarget) || 5),
        estimated_minutes: newMinutes ? Number(newMinutes) : null,
      })
      setHabits((prev) => [habit, ...prev])
      setNewTitle(""); setNewTarget("5"); setNewMinutes(""); setShowAddForm(false)
    } catch (err) {
      warnError(err, "Couldn't create habit")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleComplete(habitId: number) {
    setCompletingId(habitId)
    try {
      const completion = await completeHabit(habitId)
      setCompletions((prev) => [completion, ...prev])
    } catch (err) {
      warnError(err, "Couldn't log habit")
    } finally {
      setCompletingId(null)
    }
  }

  async function saveHabit(habitId: number, edits: { title: string; target: number; minutes: string }) {
    try {
      const updated = await updateHabit(habitId, {
        title: edits.title.trim(),
        target_count_per_week: Math.max(1, edits.target),
        estimated_minutes: edits.minutes ? Number(edits.minutes) : null,
      })
      setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
    } catch (err) {
      warnError(err, "Couldn't update habit")
      throw err
    }
  }

  async function removeHabit(habit: Habit) {
    if (!window.confirm(`Delete "${habit.title}"?`)) return
    try {
      await deleteHabit(habit.id)
      setHabits((prev) => prev.filter((h) => h.id !== habit.id))
      setCompletions((prev) => prev.filter((c) => c.habit_id !== habit.id))
    } catch (err) {
      warnError(err, "Couldn't delete habit")
    }
  }

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000))
  }, [weekStart])

  const totalTarget = habits.reduce((sum, h) => sum + h.target_count_per_week, 0)
  const totalCompleted = completions.length
  const overallProgress = totalTarget ? Math.round((totalCompleted / totalTarget) * 100) : 0

  return (
    <div className="space-y-8 animate-fade-up">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Habits</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalCompleted} of {totalTarget} weekly completions · {overallProgress}%
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={cn(
            "btn-glow inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm transition-all",
            showAddForm
              ? "bg-muted text-muted-foreground hover:bg-muted/80"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAddForm ? "Cancel" : "New habit"}
        </button>
      </div>

      {/* Overall progress bar */}
      <div className="fluid-card overflow-hidden p-5">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-semibold">Weekly progress</span>
          <span className={cn("font-bold", overallProgress >= 100 ? "text-success" : "text-muted-foreground")}>
            {overallProgress}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-success/80 to-success transition-all duration-700"
            style={{ width: `${Math.min(100, overallProgress)}%` }}
          />
        </div>
        {overallProgress >= 100 && (
          <p className="mt-2 text-xs font-medium text-success">🎉 Weekly goal crushed!</p>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="fluid-card overflow-hidden animate-fade-up">
          <div className="border-b border-border/60 px-6 py-4">
            <h3 className="font-semibold">Build a new habit</h3>
          </div>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-3 p-6">
            <Input
              placeholder="What habit do you want to build?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-11 min-w-[220px] flex-1 rounded-xl text-base"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number" min="1" max="7"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="h-11 w-20 rounded-xl"
                placeholder="×/wk"
              />
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number" min="1"
                value={newMinutes}
                onChange={(e) => setNewMinutes(e.target.value)}
                className="h-11 w-24 rounded-xl"
                placeholder="min"
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="h-11 rounded-2xl px-5">
              {isSubmitting ? "Creating…" : "Create"}
            </Button>
          </form>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="fluid-card animate-pulse p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
                <div className="h-14 w-14 rounded-full bg-muted" />
              </div>
              <div className="mt-6 h-2 w-full rounded-full bg-muted" />
              <div className="mt-4 h-10 w-full rounded-xl bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Habits grid */}
      {!isLoading && habits.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              completions={completions.filter((c) => c.habit_id === habit.id)}
              weekDays={weekDays}
              isCompleting={completingId === habit.id}
              loggedToday={completions.some(
                (c) => c.habit_id === habit.id &&
                  (c.completed_on === toLocalDateKey() || isSameLocalDay(c.completed_at, new Date()))
              )}
              onComplete={() => handleComplete(habit.id)}
              onSave={(edits) => saveHabit(habit.id, edits)}
              onDelete={() => removeHabit(habit)}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && habits.length === 0 && (
        <div className="fluid-card flex flex-col items-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
            <Flame className="h-7 w-7 text-primary" />
          </div>
          <h3 className="mt-5 text-lg font-semibold">No habits yet</h3>
          <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
            Habits compound. Start small and let consistency do the work.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-6 rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Create your first habit
          </button>
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

function HabitCard({ habit, completions, weekDays, isCompleting, loggedToday, onComplete, onSave, onDelete }: HabitCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  const count = completions.length
  const pct = Math.min(100, Math.round((count / habit.target_count_per_week) * 100))
  const isComplete = count >= habit.target_count_per_week

  if (isEditing) {
    return (
      <HabitEditForm
        habit={habit}
        onCancel={() => setIsEditing(false)}
        onSubmit={async (edits) => { await onSave(edits); setIsEditing(false) }}
      />
    )
  }

  return (
    <div className={cn(
      "fluid-card group relative overflow-hidden p-6 transition-all hover:shadow-card-hover",
      isComplete && "ring-1 ring-success/30"
    )}>
      {/* Top glow when complete */}
      {isComplete && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-success/40 via-success to-success/40" />
      )}

      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-2">
          <h3 className="font-semibold leading-snug">{habit.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {habit.estimated_minutes ? `${habit.estimated_minutes} min · ` : ""}
            {habit.preferred_time_of_day || "Any time"}
          </p>
        </div>

        {/* Progress ring + menu */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <ProgressRing
              pct={pct}
              size={52}
              stroke={4}
              color={isComplete ? "hsl(var(--success))" : "hsl(var(--primary))"}
            />
            <span className="absolute text-[11px] font-bold">
              {count}<span className="font-normal text-muted-foreground">/{habit.target_count_per_week}</span>
            </span>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-2xl border border-border bg-card shadow-card-hover">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted"
                  onClick={() => { setMenuOpen(false); setIsEditing(true) }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-danger/8"
                  onClick={() => { setMenuOpen(false); onDelete() }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Week dots */}
      <div className="mt-5 flex items-center justify-between">
        {weekDays.map((day, idx) => {
          const done = completions.some(
            (c) => c.completed_on === toLocalDateKey(day) || isSameLocalDay(c.completed_at, day)
          )
          const isToday = day.toDateString() === new Date().toDateString()
          return (
            <div key={idx} className="flex flex-col items-center gap-1">
              <div className={cn("habit-dot", done && "done", isToday && !done && "today")}>
                {done && <Check className="h-3 w-3 stroke-[3] text-white" />}
              </div>
              <span className="text-[9px] font-medium uppercase text-muted-foreground/60">
                {formatShortDay(day).charAt(0)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Log button */}
      <button
        type="button"
        onClick={onComplete}
        disabled={isCompleting || loggedToday}
        aria-busy={isCompleting}
        className={cn(
          "btn-glow mt-5 w-full rounded-2xl py-2.5 text-sm font-semibold transition-all",
          loggedToday
            ? "bg-success/10 text-success cursor-default"
            : isComplete
            ? "bg-success text-white hover:bg-success/90 shadow-sm"
            : "bg-primary text-white hover:bg-primary/90 shadow-sm",
          (isCompleting || loggedToday) && "opacity-70"
        )}
      >
        {isCompleting ? (
          "Logging…"
        ) : loggedToday ? (
          <span className="flex items-center justify-center gap-2">
            <Check className="h-4 w-4 stroke-[2.5]" />
            Done for today
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Flame className="h-4 w-4" />
            I did this today
          </span>
        )}
      </button>
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
    try { await onSubmit({ title, target: Number(target) || 1, minutes }) }
    catch { setSaving(false) }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fluid-card space-y-3 p-5 ring-2 ring-primary/20 animate-fade-up"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-10 rounded-xl"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <Input type="number" min="1" max="7" value={target}
            onChange={(e) => setTarget(e.target.value)} className="h-10 w-20 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input type="number" min="1" value={minutes}
            onChange={(e) => setMinutes(e.target.value)} className="h-10 w-24 rounded-xl" placeholder="min" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="rounded-xl px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
          Cancel
        </button>
        <Button type="submit" size="sm" disabled={saving} className="rounded-xl">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}
