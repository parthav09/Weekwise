import { CheckCircle2, Inbox, Mail, RefreshCw, Trash2 } from "lucide-react"
import { FormEvent, useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "../components/ui/button"
import { buttonVariants } from "../components/ui/button-variants"
import { Input } from "../components/ui/input"
import {
  acceptExtractedCandidate,
  listExtractedCandidates,
  rejectExtractedCandidate,
  syncGmail,
  type ExtractedTaskCandidate,
  type ExtractedTaskCandidateStatus,
  type TaskCategory,
  type TaskEnergyLevel,
  type TaskPriority,
  type TaskScheduleFlexibility,
} from "../lib/api"
import { warnError } from "../lib/browserWarnings"
import { parseLocalDateKey } from "../lib/dates"
import { cn } from "../lib/utils"

const tabs: { id: ExtractedTaskCandidateStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
]

const selectClass =
  "h-10 rounded-xl border border-border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

function dateOnlyToLocalNoonIso(value: string) {
  if (!value) return null
  const date = parseLocalDateKey(value)
  date.setHours(12, 0, 0, 0)
  return date.toISOString()
}

export function InboxPage() {
  const [activeTab, setActiveTab] = useState<ExtractedTaskCandidateStatus>("pending")
  const [candidates, setCandidates] = useState<ExtractedTaskCandidate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadCandidates(status = activeTab) {
    setIsLoading(true)
    try {
      setCandidates(await listExtractedCandidates({ status }))
    } catch (err) {
      warnError(err, "Couldn't load email tasks")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCandidates(activeTab)
  }, [activeTab])

  async function handleSync() {
    setIsSyncing(true)
    setMessage(null)
    try {
      const result = await syncGmail()
      setMessage(
        `Fetched ${result.fetched_count} emails, ${result.new_email_count} new, ${result.candidate_count} task candidates.`,
      )
      await loadCandidates(activeTab)
    } catch (err) {
      warnError(err, "Couldn't sync Gmail")
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleAccepted() {
    setMessage("Added to Tasks.")
    await loadCandidates(activeTab)
  }

  async function handleRejected() {
    setMessage("Candidate rejected.")
    await loadCandidates(activeTab)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Review Gmail task candidates before they become real tasks.
          </p>
        </div>
        <Button type="button" disabled={isSyncing} onClick={handleSync}>
          <RefreshCw className={cn("mr-1.5 h-4 w-4", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing..." : "Sync Gmail"}
        </Button>
      </div>

      {message ? (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>
      ) : null}
      <div className="flex gap-2 rounded-xl border border-border/80 bg-card/90 p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl border border-border/80 bg-card/90" />
          ))}
        </div>
      ) : candidates.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              readonly={activeTab !== "pending"}
              onAccepted={handleAccepted}
              onRejected={handleRejected}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/80 p-8 text-center">
          <Inbox className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No email tasks yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Gmail in Settings, then sync to extract task candidates.
          </p>
          <Link to="/settings" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
            Open Settings
          </Link>
        </div>
      )}
    </div>
  )
}

interface CandidateCardProps {
  candidate: ExtractedTaskCandidate
  readonly: boolean
  onAccepted: () => Promise<void>
  onRejected: () => Promise<void>
}

function CandidateCard({ candidate, readonly, onAccepted, onRejected }: CandidateCardProps) {
  const [title, setTitle] = useState(candidate.suggested_title)
  const [description, setDescription] = useState(candidate.suggested_description ?? "")
  const [priority, setPriority] = useState<TaskPriority>(candidate.suggested_priority)
  const [category, setCategory] = useState<TaskCategory>(candidate.suggested_category)
  const [energyLevel, setEnergyLevel] = useState<TaskEnergyLevel>(candidate.suggested_energy_level)
  const [scheduleFlexibility, setScheduleFlexibility] = useState<TaskScheduleFlexibility>(
    candidate.suggested_schedule_flexibility,
  )
  const [dueDate, setDueDate] = useState(candidate.suggested_due_date ?? "")
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    candidate.suggested_estimated_minutes != null ? String(candidate.suggested_estimated_minutes) : "",
  )
  const [isBusy, setIsBusy] = useState(false)

  async function handleAccept(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setIsBusy(true)
    try {
      await acceptExtractedCandidate(candidate.id, {
        overrides: {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          due_date: dateOnlyToLocalNoonIso(dueDate),
          estimated_minutes: parseMinutes(estimatedMinutes),
          energy_level: energyLevel,
          category,
          schedule_flexibility: scheduleFlexibility,
        },
      })
      await onAccepted()
    } catch (err) {
      warnError(err, "Couldn't accept candidate")
    } finally {
      setIsBusy(false)
    }
  }

  async function handleReject() {
    setIsBusy(true)
    try {
      await rejectExtractedCandidate(candidate.id)
      await onRejected()
    } catch (err) {
      warnError(err, "Couldn't reject candidate")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <form onSubmit={handleAccept} className="rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <p className="truncate text-sm font-medium">
              {candidate.email_message.sender || "Unknown sender"}
            </p>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {candidate.email_message.subject || "No subject"}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {formatConfidence(candidate.confidence)}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={readonly || isBusy} />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={readonly || isBusy}
          placeholder="Notes"
          className="min-h-20 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <select className={selectClass} value={priority} disabled={readonly || isBusy} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
            <option value="urgent">Urgent</option>
          </select>
          <select className={selectClass} value={category} disabled={readonly || isBusy} onChange={(event) => setCategory(event.target.value as TaskCategory)}>
            <option value="school">School</option>
            <option value="work">Work</option>
            <option value="fitness">Fitness</option>
            <option value="social">Social</option>
            <option value="errands">Errands</option>
            <option value="personal">Personal</option>
          </select>
          <Input type="date" value={dueDate} disabled={readonly || isBusy} onChange={(event) => setDueDate(event.target.value)} />
          <Input type="number" min={1} value={estimatedMinutes} placeholder="Minutes" disabled={readonly || isBusy} onChange={(event) => setEstimatedMinutes(event.target.value)} />
          <select className={selectClass} value={energyLevel} disabled={readonly || isBusy} onChange={(event) => setEnergyLevel(event.target.value as TaskEnergyLevel)}>
            <option value="low">Low energy</option>
            <option value="medium">Medium energy</option>
            <option value="high">High energy</option>
          </select>
          <select className={selectClass} value={scheduleFlexibility} disabled={readonly || isBusy} onChange={(event) => setScheduleFlexibility(event.target.value as TaskScheduleFlexibility)}>
            <option value="flexible">Flexible</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>
      </div>

      {candidate.rationale ? (
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          {candidate.rationale}
        </p>
      ) : null}
      {candidate.email_message.snippet ? (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Email snippet</summary>
          <p className="mt-2 leading-relaxed">{candidate.email_message.snippet}</p>
        </details>
      ) : null}
      {!readonly ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isBusy} onClick={handleReject}>
            <Trash2 className="h-3.5 w-3.5" />
            Reject
          </Button>
          <Button type="submit" disabled={isBusy}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Accept
          </Button>
        </div>
      ) : null}
    </form>
  )
}

function parseMinutes(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null
}

function formatConfidence(value: number | null) {
  if (value == null) return "AI"
  return `${Math.round(value * 100)}%`
}
