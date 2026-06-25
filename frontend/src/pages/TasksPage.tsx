import { Calendar, CheckCircle2, Clock, Mic, MicOff, Pencil, Plus, Trash2, X } from "lucide-react"
import { FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { createTask, deleteTask, listExtractedCandidates, listTasks, updateTask } from "../lib/api"
import type {
  Task,
  TaskCategory,
  TaskEnergyLevel,
  TaskPriority,
  TaskScheduleFlexibility,
  TaskStatus,
} from "../lib/api"
import { warnError } from "../lib/browserWarnings"
import { formatDateTime, toApiDateTime } from "../lib/dates"
import { cn } from "../lib/utils"
import { parseVoiceTaskTranscript } from "../lib/voiceTasks"
import type { VoiceTaskDraft } from "../lib/voiceTasks"

const priorityConfig: Record<TaskPriority, { label: string; stripe: string; badge: string; text: string }> = {
  low: { label: "Low", stripe: "bg-primary/40", badge: "bg-primary/10 text-primary", text: "text-primary" },
  medium: { label: "Medium", stripe: "bg-warning", badge: "bg-warning/10 text-warning", text: "text-warning" },
  high: { label: "High", stripe: "bg-danger/70", badge: "bg-danger/10 text-danger", text: "text-danger" },
  urgent: { label: "Urgent", stripe: "bg-danger", badge: "bg-danger/15 text-danger", text: "text-danger" },
}

const categoryLabels: Record<TaskCategory, string> = {
  school: "School", work: "Work", fitness: "Fitness",
  social: "Social", errands: "Errands", personal: "Personal",
}

const energyLabels: Record<TaskEnergyLevel, string> = {
  low: "Low energy", medium: "Med energy", high: "High energy",
}

const statusTabs: { id: TaskStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
]

const selectClass =
  "h-10 rounded-xl border border-border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

interface VoiceSpeechRecognitionAlternative {
  transcript: string
}

interface VoiceSpeechRecognitionResult {
  isFinal: boolean
  [index: number]: VoiceSpeechRecognitionAlternative | undefined
}

interface VoiceSpeechRecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: VoiceSpeechRecognitionResult | undefined
  }
}

interface VoiceSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: { error?: string; message?: string }) => void) | null
  onresult: ((event: VoiceSpeechRecognitionEvent) => void) | null
  abort: () => void
  start: () => void
  stop: () => void
}

type VoiceSpeechRecognitionConstructor = new () => VoiceSpeechRecognition

type VoiceWindow = Window & {
  SpeechRecognition?: VoiceSpeechRecognitionConstructor
  webkitSpeechRecognition?: VoiceSpeechRecognitionConstructor
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return undefined
  const voiceWindow = window as VoiceWindow
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition
}

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
  const [showAddForm, setShowAddForm] = useState(false)
  const [showVoicePanel, setShowVoicePanel] = useState(false)
  const [activeTab, setActiveTab] = useState<TaskStatus | "all">("all")
  const [pendingEmailTaskCount, setPendingEmailTaskCount] = useState(0)
  const [voiceTranscript, setVoiceTranscript] = useState("")
  const [voiceInterimTranscript, setVoiceInterimTranscript] = useState("")
  const [voiceDrafts, setVoiceDrafts] = useState<VoiceTaskDraft[]>([])
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isCreatingVoiceTasks, setIsCreatingVoiceTasks] = useState(false)
  const recognitionRef = useRef<VoiceSpeechRecognition | null>(null)

  const [form, setForm] = useState<TaskFormValues>({
    title: "", description: "", priority: "medium", due_date: "",
    estimated_minutes: "", energy_level: "medium", category: "personal",
    schedule_flexibility: "flexible",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const [taskList, emailCandidates] = await Promise.all([
        listTasks(),
        listExtractedCandidates({ status: "pending" }),
      ])
      setTasks(taskList)
      setPendingEmailTaskCount(emailCandidates.length)
    } catch (err) {
      warnError(err, "Couldn't load tasks")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadTasks() }, [loadTasks])

  useEffect(() => {
    return () => recognitionRef.current?.abort()
  }, [])

  function updateVoiceTranscript(value: string) {
    setVoiceTranscript(value)
    setVoiceDrafts(parseVoiceTaskTranscript(value))
    setVoiceError(null)
  }

  function stopVoiceListening() {
    recognitionRef.current?.stop()
    setIsListening(false)
    setVoiceInterimTranscript("")
  }

  function startVoiceListening() {
    const Recognition = getSpeechRecognitionConstructor()
    if (!Recognition) {
      setVoiceError("Voice capture is not supported in this browser. You can still paste dictated text here.")
      return
    }

    const recognition = new Recognition()
    let finalTranscript = voiceTranscript.trim()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return

      let interim = ""
      let nextFinal = finalTranscript

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result) continue

        const text = result[0]?.transcript.trim()
        if (!text) continue

        if (result.isFinal) {
          nextFinal = `${nextFinal} ${text}`.trim()
        } else {
          interim = `${interim} ${text}`.trim()
        }
      }

      finalTranscript = nextFinal
      setVoiceTranscript(nextFinal)
      setVoiceInterimTranscript(interim)
      setVoiceDrafts(parseVoiceTaskTranscript(`${nextFinal} ${interim}`.trim()))
    }
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return

      setVoiceError(event.error ? `Voice capture stopped: ${event.error}.` : "Voice capture stopped.")
      setIsListening(false)
      setVoiceInterimTranscript("")
    }
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return

      recognitionRef.current = null
      setIsListening(false)
      setVoiceInterimTranscript("")
      setVoiceDrafts(parseVoiceTaskTranscript(finalTranscript))
    }

    recognitionRef.current = recognition
    setVoiceError(null)
    setIsListening(true)

    try {
      recognition.start()
    } catch (err) {
      recognitionRef.current = null
      setIsListening(false)
      setVoiceError(err instanceof Error ? err.message : "Couldn't start voice capture.")
    }
  }

  function clearVoiceCapture() {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognition?.abort()
    setIsListening(false)
    setVoiceTranscript("")
    setVoiceInterimTranscript("")
    setVoiceDrafts([])
    setVoiceError(null)
  }

  function toggleVoicePanel() {
    if (showVoicePanel) {
      stopVoiceListening()
      setShowVoicePanel(false)
    } else {
      setShowAddForm(false)
      setShowVoicePanel(true)
    }
  }

  function toggleAddForm() {
    if (!showAddForm) {
      stopVoiceListening()
      setShowVoicePanel(false)
    }
    setShowAddForm((value) => !value)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setIsSubmitting(true)
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
      setForm({ title: "", description: "", priority: "medium", due_date: "", estimated_minutes: "", energy_level: "medium", category: "personal", schedule_flexibility: "flexible" })
      setShowAddForm(false)
    } catch (err) {
      warnError(err, "Couldn't create task")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function createVoiceTasks() {
    const draftsToCreate = voiceDrafts.filter((draft) => draft.title.trim())
    if (draftsToCreate.length === 0) return

    setIsCreatingVoiceTasks(true)
    try {
      const createdTasks = await Promise.all(
        draftsToCreate.map((draft) => createTask({
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          priority: draft.priority,
          due_date: toApiDateTime(draft.due_date),
          estimated_minutes: parseMinutes(draft.estimated_minutes),
          energy_level: draft.energy_level,
          category: draft.category,
          schedule_flexibility: draft.schedule_flexibility,
        })),
      )
      setTasks((prev) => [...createdTasks, ...prev])
      setActiveTab("all")
      clearVoiceCapture()
      setShowVoicePanel(false)
    } catch (err) {
      warnError(err, "Couldn't create voice tasks")
    } finally {
      setIsCreatingVoiceTasks(false)
    }
  }

  async function moveTask(task: Task, newStatus: TaskStatus) {
    try {
      const updated = await updateTask(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      warnError(err, "Couldn't update task")
    }
  }

  async function saveEdits(taskId: number, values: TaskFormValues) {
    try {
      const updated = await updateTask(taskId, {
        title: values.title.trim(),
        description: values.description.trim() || null,
        priority: values.priority,
        due_date: toApiDateTime(values.due_date),
        estimated_minutes: parseMinutes(values.estimated_minutes),
        energy_level: values.energy_level,
        category: values.category,
        schedule_flexibility: values.schedule_flexibility,
      })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      warnError(err, "Couldn't update task")
      throw err
    }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    try {
      await deleteTask(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch (err) {
      warnError(err, "Couldn't delete task")
    }
  }

  const visibleTasks = activeTab === "all" ? tasks : tasks.filter((t) => t.status === activeTab)
  const counts = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  }
  const isSpeechSupported = Boolean(getSpeechRecognitionConstructor())
  const voiceDraftCount = voiceDrafts.filter((draft) => draft.title.trim()).length

  return (
    <div className="space-y-8 animate-fade-up">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {counts.todo} to do · {counts.in_progress} in progress · {counts.done} done
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleVoicePanel}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm transition-all",
              showVoicePanel
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-accent text-accent-foreground hover:bg-accent/90"
            )}
          >
            {showVoicePanel ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {showVoicePanel ? "Close voice" : "Voice add"}
          </button>
          <button
            type="button"
            onClick={toggleAddForm}
            className={cn(
              "btn-glow inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm transition-all",
              showAddForm
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? "Cancel" : "New task"}
          </button>
        </div>
      </div>

      {/* Inbox nudge */}
      {pendingEmailTaskCount > 0 ? (
        <Link
          to="/inbox"
          className="flex items-center justify-between rounded-2xl bg-primary/8 px-5 py-3.5 text-sm text-primary transition-colors hover:bg-primary/12"
        >
          <span className="font-medium">
            {pendingEmailTaskCount} email task{pendingEmailTaskCount === 1 ? "" : "s"} waiting in inbox
          </span>
          <span className="font-semibold">Review →</span>
        </Link>
      ) : null}

      {/* Voice intake */}
      {showVoicePanel && (
        <div className="fluid-card overflow-hidden animate-fade-up">
          <div className="flex flex-col gap-3 border-b border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Voice task capture</h3>
              <p className="text-sm text-muted-foreground">
                Capture todos here. Planning stays separate on the plan pages.
              </p>
            </div>
            <span className={cn(
              "w-fit rounded-full px-3 py-1 text-xs font-medium",
              isListening ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground",
            )}>
              {isListening ? "Listening" : isSpeechSupported ? "Ready" : "Typing fallback"}
            </span>
          </div>

          <div className="space-y-4 p-6">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={isListening ? stopVoiceListening : startVoiceListening}
                disabled={!isSpeechSupported}
                className="rounded-2xl px-4"
              >
                {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                {isListening ? "Stop listening" : "Start listening"}
              </Button>
              <button
                type="button"
                onClick={clearVoiceCapture}
                className="rounded-2xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Clear
              </button>
            </div>

            {!isSpeechSupported && (
              <p className="rounded-2xl bg-warning/10 px-4 py-3 text-sm text-warning">
                This browser does not expose speech recognition. Dictate with your keyboard or paste text below.
              </p>
            )}
            {voiceError && (
              <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
                {voiceError}
              </p>
            )}

            <textarea
              value={voiceTranscript}
              onChange={(e) => updateVoiceTranscript(e.target.value)}
              rows={4}
              placeholder='Say or paste: "Finish the history essay tomorrow at 5 for 45 minutes. Buy groceries Saturday morning."'
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            {voiceInterimTranscript && (
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">
                {voiceInterimTranscript}
              </p>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">
                  Detected tasks
                  {voiceDraftCount > 0 && <span className="ml-2 text-muted-foreground">({voiceDraftCount})</span>}
                </h4>
                <Button
                  type="button"
                  size="sm"
                  disabled={voiceDraftCount === 0 || isCreatingVoiceTasks}
                  onClick={createVoiceTasks}
                  className="rounded-xl"
                >
                  {isCreatingVoiceTasks
                    ? "Adding…"
                    : voiceDraftCount > 0
                      ? `Add ${voiceDraftCount} task${voiceDraftCount === 1 ? "" : "s"}`
                      : "Add tasks"}
                </Button>
              </div>

              {voiceDrafts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Tasks you speak or type will appear here before they are saved.
                </div>
              ) : (
                <div className="space-y-2">
                  {voiceDrafts.map((draft, index) => (
                    <VoiceTaskDraftRow
                      key={`${draft.description}-${index}`}
                      draft={draft}
                      index={index}
                      disabled={isCreatingVoiceTasks}
                      onChange={(nextDraft) => {
                        setVoiceDrafts((prev) => prev.map((item, itemIndex) => (
                          itemIndex === index ? nextDraft : item
                        )))
                      }}
                      onRemove={() => {
                        setVoiceDrafts((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="fluid-card overflow-hidden animate-fade-up">
          <div className="border-b border-border/60 px-6 py-4">
            <h3 className="font-semibold">New task</h3>
          </div>
          <form onSubmit={handleCreate} className="space-y-4 p-6">
            <Input
              placeholder="What needs to get done?"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-11 rounded-xl text-base"
              autoFocus
            />
            <textarea
              placeholder="Notes (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { key: "priority", options: [["low","Low priority"],["medium","Medium"],["high","High"],["urgent","Urgent"]] },
                { key: "energy_level", options: [["low","Low energy"],["medium","Med energy"],["high","High energy"]] },
                { key: "category", options: Object.entries(categoryLabels) },
                { key: "schedule_flexibility", options: [["flexible","Flexible"],["fixed","Deadline/day"]] },
              ] as Array<{ key: keyof TaskFormValues; options: string[][] }>).map(({ key, options }) => (
                <select
                  key={key}
                  value={form[key] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className={selectClass}
                >
                  {options.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="number" min={1}
                placeholder="Estimated minutes (optional)"
                value={form.estimated_minutes}
                onChange={(e) => setForm((f) => ({ ...f, estimated_minutes: e.target.value }))}
                className="h-10 rounded-xl"
              />
              <Input
                type="datetime-local"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting} className="rounded-2xl px-5">
                {isSubmitting ? "Adding…" : "Add task"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 rounded-2xl bg-muted/60 p-1">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                activeTab === tab.id ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"
              )}
            >
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="fluid-card flex items-center gap-4 p-4 animate-pulse">
              <div className="h-9 w-9 rounded-xl bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-48 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            </div>
          ))
        ) : visibleTasks.length === 0 ? (
          <div className="fluid-card flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 font-medium">No tasks here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTab === "done" ? "Complete some tasks first." : "Add a task to get started."}
            </p>
          </div>
        ) : (
          visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onMove={(status) => moveTask(task, status)}
              onSave={(values) => saveEdits(task.id, values)}
              onDelete={() => removeTask(task)}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface TaskRowProps {
  task: Task
  onMove: (status: TaskStatus) => void
  onSave: (values: TaskFormValues) => Promise<void>
  onDelete: () => void
}

interface VoiceTaskDraftRowProps {
  draft: VoiceTaskDraft
  index: number
  disabled: boolean
  onChange: (draft: VoiceTaskDraft) => void
  onRemove: () => void
}

function VoiceTaskDraftRow({ draft, index, disabled, onChange, onRemove }: VoiceTaskDraftRowProps) {
  function patchDraft(patch: Partial<VoiceTaskDraft>) {
    onChange({ ...draft, ...patch })
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <Input
            value={draft.title}
            disabled={disabled}
            onChange={(e) => patchDraft({ title: e.target.value })}
            className="h-9 rounded-xl"
            placeholder="Task title"
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select
              value={draft.priority}
              disabled={disabled}
              onChange={(e) => patchDraft({ priority: e.target.value as TaskPriority })}
              className={selectClass}
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <select
              value={draft.category}
              disabled={disabled}
              onChange={(e) => patchDraft({ category: e.target.value as TaskCategory })}
              className={selectClass}
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={draft.energy_level}
              disabled={disabled}
              onChange={(e) => patchDraft({ energy_level: e.target.value as TaskEnergyLevel })}
              className={selectClass}
            >
              <option value="low">Low energy</option>
              <option value="medium">Med energy</option>
              <option value="high">High energy</option>
            </select>
            <Input
              type="number"
              min={1}
              value={draft.estimated_minutes}
              disabled={disabled}
              onChange={(e) => patchDraft({ estimated_minutes: e.target.value })}
              placeholder="Minutes"
              className="h-10 rounded-xl"
            />
            <Input
              type="datetime-local"
              value={draft.due_date}
              disabled={disabled}
              onChange={(e) => patchDraft({ due_date: e.target.value })}
              className="h-10 rounded-xl"
            />
          </div>
          <textarea
            value={draft.description}
            disabled={disabled}
            onChange={(e) => patchDraft({ description: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-xs placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Original spoken text or notes"
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="rounded-xl p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Remove detected task"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function TaskRow({ task, onMove, onSave, onDelete }: TaskRowProps) {
  const priority = priorityConfig[task.priority]
  const isDone = task.status === "done"
  const [isEditing, setIsEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  if (isEditing) {
    return (
      <TaskEditForm
        task={task}
        onCancel={() => setIsEditing(false)}
        onSubmit={async (values) => { await onSave(values); setIsEditing(false) }}
      />
    )
  }

  return (
    <div
      className={cn(
        "fluid-card group relative overflow-hidden transition-all hover:shadow-card-hover",
        isDone && "opacity-60"
      )}
    >
      {/* Priority stripe */}
      <div className={cn("priority-stripe", priority.stripe)} />

      <div className="flex items-start gap-4 p-4 pl-5">
        {/* Status toggle */}
        <button
          type="button"
          onClick={() => onMove(isDone ? "todo" : "done")}
          className={cn(
            "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
            isDone
              ? "border-success bg-success text-white"
              : "border-border hover:border-primary"
          )}
          aria-label={isDone ? "Reopen" : "Mark done"}
        >
          {isDone && <CheckCircle2 className="h-3 w-3 fill-current stroke-0" />}
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium leading-snug", isDone && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-lg px-2 py-0.5 text-[11px] font-medium", priority.badge)}>
              {priority.label}
            </span>
            <span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {categoryLabels[task.category]}
            </span>
            <span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {energyLabels[task.energy_level]}
            </span>
            {task.due_date && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatDateTime(task.due_date)}
              </span>
            )}
            {task.estimated_minutes != null && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {task.estimated_minutes}m
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {task.status === "todo" && (
            <button
              type="button"
              onClick={() => onMove("in_progress")}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Start
            </button>
          )}
          {task.status === "in_progress" && (
            <button
              type="button"
              onClick={() => onMove("done")}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-success hover:bg-success/10"
            >
              Complete
            </button>
          )}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-2xl border border-border bg-card shadow-card-hover">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
                  onClick={() => { setMenuOpen(false); setIsEditing(true) }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/8"
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
    try { await onSubmit(values) } catch { setSaving(false) }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fluid-card space-y-3 overflow-hidden p-5 ring-2 ring-primary/20 animate-fade-up"
    >
      <Input
        value={values.title}
        onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
        className="h-10 rounded-xl"
        autoFocus
      />
      <textarea
        value={values.description}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        rows={2}
        className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(["priority","energy_level","category","schedule_flexibility"] as Array<keyof TaskFormValues>).map((key) => {
          const optMap: Record<string, string[][]> = {
            priority: [["low","Low"],["medium","Medium"],["high","High"],["urgent","Urgent"]],
            energy_level: [["low","Low energy"],["medium","Med energy"],["high","High energy"]],
            category: Object.entries(categoryLabels),
            schedule_flexibility: [["flexible","Flexible"],["fixed","Deadline/day"]],
          }
          return (
            <select
              key={key}
              value={values[key] as string}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              className="h-9 rounded-xl border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {(optMap[key] || []).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="number" min={1} placeholder="Minutes"
          value={values.estimated_minutes}
          onChange={(e) => setValues((v) => ({ ...v, estimated_minutes: e.target.value }))}
          className="h-9 w-28 rounded-xl"
        />
        <Input
          type="datetime-local"
          value={values.due_date}
          onChange={(e) => setValues((v) => ({ ...v, due_date: e.target.value }))}
          className="h-9 min-w-[200px] flex-1 rounded-xl"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
          Cancel
        </button>
        <Button type="submit" size="sm" disabled={saving} className="rounded-xl">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}
