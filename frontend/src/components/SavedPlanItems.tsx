import { Bell, CheckCircle2, Clock3, RotateCcw, SkipForward, XCircle } from "lucide-react"
import { useState } from "react"

import { Button } from "./ui/button"
import { Input } from "./ui/input"
import type { SavedPlanItem, SavedPlanItemStatus, SavedPlanItemUpdateInput } from "../lib/api"
import { cn } from "../lib/utils"

interface SavedPlanItemsProps {
  items: SavedPlanItem[]
  updatingItemId: number | null
  compact?: boolean
  pendingNotificationItemIds?: Set<number>
  onUpdate: (item: SavedPlanItem, input: SavedPlanItemUpdateInput) => void
}

const statusTone: Record<SavedPlanItemStatus, string> = {
  planned: "border-border bg-muted text-muted-foreground",
  done: "border-success/25 bg-success/10 text-success",
  skipped: "border-warning/25 bg-warning/10 text-warning",
  moved: "border-primary/25 bg-primary/10 text-primary",
  failed: "border-danger/25 bg-danger/10 text-danger",
  cancelled: "border-border bg-muted text-muted-foreground",
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value: string) {
  return new Date(value).toISOString()
}

function askForReason(status: SavedPlanItemStatus) {
  if (status !== "skipped" && status !== "failed") {
    return null
  }
  return window.prompt(`Short reason this was ${status}?`)?.trim() ?? ""
}

export function SavedPlanItems({
  items,
  updatingItemId,
  compact = false,
  pendingNotificationItemIds,
  onUpdate,
}: SavedPlanItemsProps) {
  const [movingItemId, setMovingItemId] = useState<number | null>(null)
  const [moveStart, setMoveStart] = useState("")
  const [moveEnd, setMoveEnd] = useState("")

  if (!items.length) {
    return null
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isUpdating = updatingItemId === item.id
        const isTerminal = item.status === "done"
        const isMoving = movingItemId === item.id
        const hasPendingNotification = pendingNotificationItemIds?.has(item.id) ?? false

        function openMoveEditor() {
          setMovingItemId(item.id)
          setMoveStart(toDateTimeLocalValue(item.moved_to_start ?? item.start_at))
          setMoveEnd(toDateTimeLocalValue(item.moved_to_end ?? item.end_at))
        }

        function submitMove() {
          if (!moveStart || !moveEnd) return
          onUpdate(item, {
            status: "moved",
            feedback_reason: null,
            moved_to_start: fromDateTimeLocalValue(moveStart),
            moved_to_end: fromDateTimeLocalValue(moveEnd),
          })
          setMovingItemId(null)
        }

        return (
          <div
            key={item.id}
            className={cn(
              "rounded-xl border bg-card p-3 shadow-sm",
              compact && "p-2 text-xs",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={cn("font-medium leading-snug", isTerminal && "line-through")}>
                    {item.title}
                  </p>
                  {hasPendingNotification ? (
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                      title="Pending reminder"
                    >
                      <Bell className="h-3 w-3" />
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.item_type} · {formatTime(item.start_at)} - {formatTime(item.end_at)}
                </p>
                {item.status === "moved" && item.moved_to_start && item.moved_to_end ? (
                  <p className="mt-1 text-xs text-primary">
                    Moved to {formatTime(item.moved_to_start)} - {formatTime(item.moved_to_end)}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  statusTone[item.status],
                )}
              >
                {item.status}
              </span>
            </div>

            {item.feedback_reason ? (
              <p className="mt-2 rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground">
                {item.feedback_reason}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatusButton
                label="Done"
                disabled={isUpdating}
                icon={CheckCircle2}
                onClick={() =>
                  onUpdate(item, {
                    status: "done",
                    feedback_reason: null,
                    moved_to_start: null,
                    moved_to_end: null,
                  })
                }
              />
              <StatusButton
                label="Skip"
                disabled={isUpdating}
                icon={SkipForward}
                onClick={() =>
                  onUpdate(item, {
                    status: "skipped",
                    feedback_reason: askForReason("skipped"),
                    moved_to_start: null,
                    moved_to_end: null,
                  })
                }
              />
              <StatusButton
                label="Moved"
                disabled={isUpdating}
                icon={Clock3}
                onClick={openMoveEditor}
              />
              <StatusButton
                label="Failed"
                disabled={isUpdating}
                icon={XCircle}
                onClick={() =>
                  onUpdate(item, {
                    status: "failed",
                    feedback_reason: askForReason("failed"),
                    moved_to_start: null,
                    moved_to_end: null,
                  })
                }
              />
              {item.status !== "planned" ? (
                <StatusButton
                  label="Reset"
                  disabled={isUpdating}
                  icon={RotateCcw}
                  onClick={() =>
                    onUpdate(item, {
                      status: "planned",
                      feedback_reason: null,
                      moved_to_start: null,
                      moved_to_end: null,
                    })
                  }
                />
              ) : null}
            </div>

            {isMoving ? (
              <div className="mt-3 rounded-lg border bg-muted/40 p-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    type="datetime-local"
                    value={moveStart}
                    onChange={(event) => setMoveStart(event.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="datetime-local"
                    value={moveEnd}
                    onChange={(event) => setMoveEnd(event.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setMovingItemId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={isUpdating || !moveStart || !moveEnd}
                    onClick={submitMove}
                  >
                    Save move
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function StatusButton({
  label,
  disabled,
  icon: Icon,
  onClick,
}: {
  label: string
  disabled: boolean
  icon: typeof CheckCircle2
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 rounded-lg px-2 text-[11px]"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Button>
  )
}
