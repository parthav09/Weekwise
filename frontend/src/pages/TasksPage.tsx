import { Plus, Calendar, Clock, MoreHorizontal, CheckCircle2, Pencil, Trash2 } from "lucide-react"
import { FormEvent, useCallback, useEffect, useRef, useState } from "react"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { createTask, deleteTask, listTasks, updateTask } from "../lib/api"
import type {
  Task,
  TaskCategory,
  TaskEnergyLevel,
  TaskPriority,
  TaskScheduleFlexibility,
  TaskStatus,
} from "../lib/api"
import { formatDateTime, toApiDateTime } from "../lib/dates"
import { cn } from "../lib/utils"

const selectClass =
  "h-11 rounded-xl border border-border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const priorityConfig: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "text-primary", bg: "bg-primary/10" },
  medium: { label: "Medium", color: "text-warning", bg: "bg-warning/10" },
  high: { label: "High", color: "text-danger", bg: "bg-danger/10" },
  urgent: { label: "Urgent", color: "text-danger", bg: "bg-danger/20" },
}

const categoryLabels: Record<TaskCategory, string> = {
  school: "School",
  work: "Work",
  fitness: "Fitness",
  social: "Social",
  errands: "Errands",
  personal: "Personal",
}

const energyLabels: Record<TaskEnergyLevel, string> = {
  low: "Low energy",
  medium: "Medium energy",
  high: "High energy",
}

const columns: { id: TaskStatus; title: string; description: string }[] = [
  { id: "todo", title: "To do", description: "Not started yet" },
  { id: "in_progress", title: "In progress", description: "Currently working on it" },
  { id: "done", title: "Done", description: "Completed this week" },
]

function toLocalInputValue(iso: string | null) {
  if (!iso) return ""
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export interface TaskFormValues {
  title: string
  description: string
  priority: TaskPriority
  due_date: string
  estimated_minutes: string
  energy_level: TaskEnergyLevel
  category: TaskCategory
  schedule_flexibility: TaskScheduleFlexibility
}

function taskToFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    due_date: toLocalInputValue(task.due_date),
    estimated_minutes: task.estimated_minutes != null ? String(task.estimated_minutes) : "",
    energy_level: task.energy_level,
    category: task.category,
    schedule_flexibility: task.schedule_flexibility,
  }
}

function parseMinutes(raw: string): number | null {
  if (!raw.trim()) return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? n : null
}

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const [form, setForm] = useState<TaskFormValues>({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
    estimated_minutes: "",
    energy_level: "medium",
    category: "personal",
    schedule_flexibility: "flexible",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setTasks(await listTasks())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load tasks")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return

    setIsSubmitting(true)
    setError(null)
    try {
      const task = await createTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        due_date: toApiDateTime(form.due_date),
        estimated_minutes: parseMinutes(form.estimated_minutes),
        energy_level: form.energy_level,
        category: form.category,
        schedule_flexibility: form.schedule_flexibility,
      })
      setTasks((prev) => [task, ...prev])
      setForm({
        title: "",
        description: "",
        priority: "medium",
        due_date: "",
        estimated_minutes: "",
        energy_level: "medium",
        category: "personal",
        schedule_flexibility: "flexible",
      })
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create task")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function moveTask(task: Task, newStatus: TaskStatus) {
    setError(null)
    try {
      const updated = await updateTask(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update task")
    }
  }

  async function saveEdits(taskId: number, values: TaskFormValues) {
    setError(null)
    const minutes = parseMinutes(values.estimated_minutes)
    try {
      const updated = await updateTask(taskId, {
        title: values.title.trim(),
        description: values.description.trim() || null,
        priority: values.priority,
        due_date: toApiDateTime(values.due_date),
        estimated_minutes: minutes,
        energy_level: values.energy_level,
        category: values.category,
        schedule_flexibility: values.schedule_flexibility,
      })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update task")
      throw err
    }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return
    setError(null)
    try {
      await deleteTask(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete task")
    }
  }

  const tasksByStatus = {
    todo: tasks.filter((t) => t.status === "todo"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done: tasks.filter((t) => t.status === "done"),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {tasks.filter((t) => t.status !== "done").length} open ·{" "}
            {tasks.filter((t) => t.status === "done").length} done this week
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {showAddForm ? "Cancel" : "New task"}
        </Button>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger shadow-sm backdrop-blur-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {showAddForm && (
        <div className="rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              placeholder="What needs to get done?"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-11"
              autoFocus
            />
            <textarea
              placeholder="Notes (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className={cn(
                "w-full rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                className={selectClass}
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
                <option value="urgent">Urgent</option>
              </select>
              <select
                value={form.energy_level}
                onChange={(e) =>
                  setForm((f) => ({ ...f, energy_level: e.target.value as TaskEnergyLevel }))
                }
                className={selectClass}
              >
                <option value="low">Low energy</option>
                <option value="medium">Medium energy</option>
                <option value="high">High energy</option>
              </select>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as TaskCategory }))}
                className={selectClass}
              >
                {(Object.keys(categoryLabels) as TaskCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {categoryLabels[key]}
                  </option>
                ))}
              </select>
              <select
                value={form.schedule_flexibility}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    schedule_flexibility: e.target.value as TaskScheduleFlexibility,
                  }))
                }
                className={selectClass}
              >
                <option value="flexible">Flexible time</option>
                <option value="fixed">Fixed time</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="number"
                min={1}
                placeholder="Estimated minutes (optional)"
                value={form.estimated_minutes}
                onChange={(e) => setForm((f) => ({ ...f, estimated_minutes: e.target.value }))}
                className="h-11"
              />
              <Input
                type="datetime-local"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting} className="h-11">
                {isSubmitting ? "Adding..." : "Add task"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {columns.map((column) => {
          const columnTasks = tasksByStatus[column.id]
          return (
            <div
              key={column.id}
              className="flex flex-col rounded-xl border border-border/60 bg-muted/30 p-3 sm:p-4"
            >
              <div className="mb-3 flex items-center justify-between px-0.5">
                <div>
                  <h3 className="font-semibold">{column.title}</h3>
                  <p className="text-xs text-muted-foreground">{column.description}</p>
                </div>
                <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-medium shadow-sm ring-1 ring-border/60">
                  {columnTasks.length}
                </span>
              </div>

              <div className="min-h-[120px] flex-1 space-y-3">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onMove={(status) => moveTask(task, status)}
                    onSave={(values) => saveEdits(task.id, values)}
                    onDelete={() => removeTask(task)}
                  />
                ))}
                {columnTasks.length === 0 && !isLoading && (
                  <div className="rounded-xl border border-dashed border-border/80 bg-card/50 p-6 text-center">
                    <p className="text-sm text-muted-foreground">No tasks here</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface TaskCardProps {
  task: Task
  onMove: (status: TaskStatus) => void
  onSave: (values: TaskFormValues) => Promise<void>
  onDelete: () => void
}

function TaskCard({ task, onMove, onSave, onDelete }: TaskCardProps) {
  const priority = priorityConfig[task.priority]
  const isDone = task.status === "done"
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

  if (isEditing) {
    return (
      <TaskEditForm
        task={task}
        onCancel={() => setIsEditing(false)}
        onSubmit={async (values) => {
          await onSave(values)
          setIsEditing(false)
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border/80 bg-card/95 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-primary/25 hover:shadow-md",
        isDone && "opacity-80",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", priority.bg, priority.color)}>
          {priority.label}
        </span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {categoryLabels[task.category]}
        </span>
        <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent">
          {energyLabels[task.energy_level]}
        </span>
        {task.schedule_flexibility === "fixed" ? (
          <span className="rounded-md bg-warning/10 px-2 py-0.5 text-xs text-warning">Fixed</span>
        ) : (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">Flexible</span>
        )}
        <div className="relative ml-auto" ref={menuRef}>
          <button
            type="button"
            aria-label="Task actions"
            className="rounded p-1 opacity-60 transition-opacity hover:bg-muted group-hover:opacity-100"
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
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

      <p className={cn("font-medium", isDone && "line-through text-muted-foreground")}>{task.title}</p>
      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {task.due_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {formatDateTime(task.due_date)}
          </span>
        )}
        {task.estimated_minutes != null && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {task.estimated_minutes}m
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {task.status === "todo" && (
          <>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onMove("in_progress")}>
              Start
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onMove("done")}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Done
            </Button>
          </>
        )}
        {task.status === "in_progress" && (
          <>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onMove("todo")}>
              Back to todo
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => onMove("done")}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Complete
            </Button>
          </>
        )}
        {task.status === "done" && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onMove("todo")}>
            Reopen
          </Button>
        )}
      </div>
    </div>
  )
}

interface TaskEditFormProps {
  task: Task
  onCancel: () => void
  onSubmit: (values: TaskFormValues) => Promise<void>
}

function TaskEditForm({ task, onCancel, onSubmit }: TaskEditFormProps) {
  const [values, setValues] = useState<TaskFormValues>(() => taskToFormValues(task))
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!values.title.trim()) return
    setSaving(true)
    try {
      await onSubmit(values)
    } catch {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-primary/30 bg-card p-4 shadow-sm"
    >
      <Input
        value={values.title}
        onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
        className="h-9"
        autoFocus
      />
      <textarea
        placeholder="Notes (optional)"
        value={values.description}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        rows={2}
        className={cn(
          "w-full rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={values.priority}
          onChange={(e) => setValues((v) => ({ ...v, priority: e.target.value as TaskPriority }))}
          className="h-9 rounded-lg border border-border bg-card px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select
          value={values.energy_level}
          onChange={(e) =>
            setValues((v) => ({ ...v, energy_level: e.target.value as TaskEnergyLevel }))
          }
          className="h-9 rounded-lg border border-border bg-card px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="low">Low energy</option>
          <option value="medium">Medium energy</option>
          <option value="high">High energy</option>
        </select>
        <select
          value={values.category}
          onChange={(e) => setValues((v) => ({ ...v, category: e.target.value as TaskCategory }))}
          className="h-9 rounded-lg border border-border bg-card px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {(Object.keys(categoryLabels) as TaskCategory[]).map((key) => (
            <option key={key} value={key}>
              {categoryLabels[key]}
            </option>
          ))}
        </select>
        <select
          value={values.schedule_flexibility}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              schedule_flexibility: e.target.value as TaskScheduleFlexibility,
            }))
          }
          className="h-9 rounded-lg border border-border bg-card px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="flexible">Flexible</option>
          <option value="fixed">Fixed</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="number"
          min={1}
          placeholder="Minutes"
          value={values.estimated_minutes}
          onChange={(e) => setValues((v) => ({ ...v, estimated_minutes: e.target.value }))}
          className="h-9 w-28"
        />
        <Input
          type="datetime-local"
          value={values.due_date}
          onChange={(e) => setValues((v) => ({ ...v, due_date: e.target.value }))}
          className="h-9 min-w-[200px] flex-1"
        />
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
