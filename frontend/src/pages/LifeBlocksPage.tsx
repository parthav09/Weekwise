import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  createLifeBlock,
  deleteLifeBlock,
  listLifeBlocks,
  updateLifeBlock,
} from "../lib/api"
import type { LifeBlock, LifeBlockCategory, LifeBlockType } from "../lib/api"
import { formatDateTime } from "../lib/dates"
import { lifeBlockCategoryConfig } from "../lib/lifeBlockCategories"
import { cn } from "../lib/utils"

const selectClass =
  "h-10 rounded-xl border border-border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const blockTypeLabels: Record<LifeBlockType, string> = {
  blocked: "Blocked (no tasks)",
  recovery: "Recovery (soft buffer)",
  available: "Available",
}

const recurrencePresets = [
  { id: "one-time", label: "One time" },
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Weekdays (Mon–Fri)", rule: "weekly:mon,tue,wed,thu,fri" },
  { id: "weekly", label: "Specific weekdays" },
] as const

type RecurrencePresetId = (typeof recurrencePresets)[number]["id"]

const weekdayOptions: { id: string; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
]

interface FormValues {
  title: string
  category: LifeBlockCategory
  block_type: LifeBlockType
  start_time: string
  end_time: string
  recurrence_preset: RecurrencePresetId
  recurrence_days: string[]
}

function emptyForm(): FormValues {
  return {
    title: "",
    category: "focus",
    block_type: "blocked",
    start_time: "",
    end_time: "",
    recurrence_preset: "one-time",
    recurrence_days: [],
  }
}

function toLocalInputValue(iso: string) {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toApiIso(local: string) {
  if (!local) return ""
  return new Date(local).toISOString()
}

function ruleFromForm(values: FormValues): string | null {
  switch (values.recurrence_preset) {
    case "daily":
      return "daily"
    case "weekdays":
      return "weekly:mon,tue,wed,thu,fri"
    case "weekly":
      return values.recurrence_days.length
        ? `weekly:${values.recurrence_days.join(",")}`
        : null
    default:
      return null
  }
}

function formFromBlock(block: LifeBlock): FormValues {
  let preset: RecurrencePresetId = "one-time"
  let days: string[] = []
  if (block.recurrence_rule === "daily") {
    preset = "daily"
  } else if (block.recurrence_rule === "weekly:mon,tue,wed,thu,fri") {
    preset = "weekdays"
  } else if (block.recurrence_rule?.startsWith("weekly:")) {
    preset = "weekly"
    days = block.recurrence_rule.slice("weekly:".length).split(",").filter(Boolean)
  }
  return {
    title: block.title,
    category: block.category,
    block_type: block.block_type,
    start_time: toLocalInputValue(block.start_time),
    end_time: toLocalInputValue(block.end_time),
    recurrence_preset: preset,
    recurrence_days: days,
  }
}

function describeRecurrence(rule: string | null) {
  if (!rule) return "One time"
  if (rule === "daily") return "Every day"
  if (rule === "weekly:mon,tue,wed,thu,fri") return "Weekdays"
  if (rule.startsWith("weekly:")) {
    const days = rule.slice("weekly:".length).split(",")
    return `Weekly: ${days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}`
  }
  return rule
}

export function LifeBlocksPage() {
  const [blocks, setBlocks] = useState<LifeBlock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [createForm, setCreateForm] = useState<FormValues>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const loadBlocks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setBlocks(await listLifeBlocks())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load life blocks")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBlocks()
  }, [loadBlocks])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!createForm.title.trim() || !createForm.start_time || !createForm.end_time) return
    setSubmitting(true)
    setError(null)
    try {
      const block = await createLifeBlock({
        title: createForm.title.trim(),
        category: createForm.category,
        block_type: createForm.block_type,
        start_time: toApiIso(createForm.start_time),
        end_time: toApiIso(createForm.end_time),
        recurrence_rule: ruleFromForm(createForm),
      })
      setBlocks((prev) => [...prev, block].sort((a, b) => a.start_time.localeCompare(b.start_time)))
      setCreateForm(emptyForm())
      setShowAdd(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create block")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSave(id: number, values: FormValues) {
    setError(null)
    try {
      const updated = await updateLifeBlock(id, {
        title: values.title.trim(),
        category: values.category,
        block_type: values.block_type,
        start_time: toApiIso(values.start_time),
        end_time: toApiIso(values.end_time),
        recurrence_rule: ruleFromForm(values),
      })
      setBlocks((prev) =>
        prev
          .map((b) => (b.id === updated.id ? updated : b))
          .sort((a, b) => a.start_time.localeCompare(b.start_time)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update block")
      throw err
    }
  }

  async function handleDelete(block: LifeBlock) {
    if (!window.confirm(`Delete "${block.title}"?`)) return
    setError(null)
    try {
      await deleteLifeBlock(block.id)
      setBlocks((prev) => prev.filter((b) => b.id !== block.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete block")
    }
  }

  const groupedByCategory = useMemo(() => {
    const groups: Record<LifeBlockCategory, LifeBlock[]> = {
      sleep: [],
      workout: [],
      commute: [],
      meal: [],
      class_: [],
      work: [],
      social: [],
      focus: [],
      free: [],
      other: [],
    }
    for (const b of blocks) groups[b.category].push(b)
    return groups
  }, [blocks])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Life Blocks</h1>
          <p className="text-sm text-muted-foreground">
            Protect time for sleep, workouts, classes, and anything else the planner shouldn't touch.
          </p>
        </div>
        <Button onClick={() => setShowAdd((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {showAdd ? "Cancel" : "New block"}
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

      {showAdd && (
        <div className="rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
          <BlockForm
            values={createForm}
            onChange={setCreateForm}
            submitLabel={submitting ? "Adding..." : "Add block"}
            disabled={submitting}
            onSubmit={handleCreate}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          No life blocks yet. Add one to start protecting your week.
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.keys(groupedByCategory) as LifeBlockCategory[]).map((cat) => {
            const items = groupedByCategory[cat]
            if (items.length === 0) return null
            const cfg = lifeBlockCategoryConfig[cat]
            const Icon = cfg.icon
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", cfg.className)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-semibold">{cfg.label}</h2>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((b) => (
                    <BlockCard
                      key={b.id}
                      block={b}
                      onSave={(values) => handleSave(b.id, values)}
                      onDelete={() => handleDelete(b)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface BlockCardProps {
  block: LifeBlock
  onSave: (values: FormValues) => Promise<void>
  onDelete: () => void
}

function BlockCard({ block, onSave, onDelete }: BlockCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<FormValues>(() => formFromBlock(block))
  const [saving, setSaving] = useState(false)
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

  useEffect(() => {
    if (!editing) setValues(formFromBlock(block))
  }, [block, editing])

  if (editing) {
    return (
      <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
        <BlockForm
          values={values}
          onChange={setValues}
          submitLabel={saving ? "Saving..." : "Save"}
          disabled={saving}
          onSubmit={async (e) => {
            e.preventDefault()
            setSaving(true)
            try {
              await onSave(values)
              setEditing(false)
            } catch {
              // error surfaced by caller
            } finally {
              setSaving(false)
            }
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  const cfg = lifeBlockCategoryConfig[block.category]
  return (
    <div className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{block.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{blockTypeLabels[block.block_type]}</p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Block actions"
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
                  setEditing(true)
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
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p>{formatDateTime(block.start_time)} → {formatDateTime(block.end_time)}</p>
        <p>{describeRecurrence(block.recurrence_rule)}</p>
      </div>
      <div className="mt-3">
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs", cfg.className)}>
          {cfg.label}
        </span>
      </div>
    </div>
  )
}

interface BlockFormProps {
  values: FormValues
  onChange: (next: FormValues) => void
  submitLabel: string
  disabled: boolean
  onSubmit: (e: FormEvent) => void
  onCancel?: () => void
}

function BlockForm({ values, onChange, submitLabel, disabled, onSubmit, onCancel }: BlockFormProps) {
  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    onChange({ ...values, [key]: value })
  }

  function toggleDay(day: string) {
    const set = new Set(values.recurrence_days)
    if (set.has(day)) set.delete(day)
    else set.add(day)
    onChange({ ...values, recurrence_days: Array.from(set) })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        placeholder="Title (e.g. Sleep, Gym, Stat 110 lecture)"
        value={values.title}
        onChange={(e) => update("title", e.target.value)}
        className="h-10"
        autoFocus
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={values.category}
          onChange={(e) => update("category", e.target.value as LifeBlockCategory)}
          className={selectClass}
        >
          {(Object.keys(lifeBlockCategoryConfig) as LifeBlockCategory[]).map((key) => (
            <option key={key} value={key}>
              {lifeBlockCategoryConfig[key].label}
            </option>
          ))}
        </select>
        <select
          value={values.block_type}
          onChange={(e) => update("block_type", e.target.value as LifeBlockType)}
          className={selectClass}
        >
          {(Object.keys(blockTypeLabels) as LifeBlockType[]).map((key) => (
            <option key={key} value={key}>
              {blockTypeLabels[key]}
            </option>
          ))}
        </select>
        <Input
          type="datetime-local"
          value={values.start_time}
          onChange={(e) => update("start_time", e.target.value)}
          className="h-10"
        />
        <Input
          type="datetime-local"
          value={values.end_time}
          onChange={(e) => update("end_time", e.target.value)}
          className="h-10"
        />
      </div>
      <div className="space-y-2">
        <select
          value={values.recurrence_preset}
          onChange={(e) => update("recurrence_preset", e.target.value as RecurrencePresetId)}
          className={selectClass}
        >
          {recurrencePresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        {values.recurrence_preset === "weekly" && (
          <div className="flex flex-wrap gap-1.5">
            {weekdayOptions.map((day) => {
              const active = values.recurrence_days.includes(day.id)
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => toggleDay(day.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {day.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
