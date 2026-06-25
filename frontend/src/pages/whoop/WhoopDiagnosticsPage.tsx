import { useEffect, useState } from "react"

import { ConnectionStatusCard } from "../../components/whoop/ConnectionStatusCard"
import { WhoopPageStates, WhoopSectionTitle } from "../../components/whoop/WhoopPageStates"
import {
  formatWhoopTimestamp,
  getWhoopBleDiagnostics,
  getWhoopBleStatus,
  type WhoopBleStatus,
  type WhoopDiagnosticEvent,
} from "../../lib/whoopBleApi"
import { cn } from "../../lib/utils"

const levelTone: Record<WhoopDiagnosticEvent["level"], string> = {
  info: "border-border bg-muted/30",
  warning: "border-warning/30 bg-warning/5",
  error: "border-danger/30 bg-danger/5",
}

const levelBadge: Record<WhoopDiagnosticEvent["level"], string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning",
  error: "bg-danger/15 text-danger",
}

export function WhoopDiagnosticsPage() {
  const [status, setStatus] = useState<WhoopBleStatus | null>(null)
  const [events, setEvents] = useState<WhoopDiagnosticEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [nextStatus, diagnostics] = await Promise.all([
          getWhoopBleStatus(),
          getWhoopBleDiagnostics(),
        ])
        setStatus(nextStatus)
        setEvents(diagnostics.events)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load diagnostics")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div className="space-y-6">
      {status ? <ConnectionStatusCard status={status} /> : null}

      <WhoopSectionTitle
        title="Diagnostics"
        description="Connection, sync, and decode events from the BLE integration service."
      />

      <WhoopPageStates
        loading={loading}
        error={error}
        empty={!loading && !error && events.length === 0}
        emptyTitle="No diagnostic events"
        emptyDescription="Events appear when the BLE service connects, syncs, or encounters decode issues."
      >
        <div className="space-y-3">
          {events.map((event) => (
            <article
              key={event.id}
              className={cn("rounded-xl border p-4", levelTone[event.level])}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                      levelBadge[event.level],
                    )}
                  >
                    {event.level}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{event.category}</span>
                </div>
                <time className="text-xs text-muted-foreground">
                  {formatWhoopTimestamp(event.occurred_at)}
                </time>
              </div>
              <p className="mt-2 text-sm">{event.message}</p>
              {event.details ? (
                <pre className="mt-3 overflow-x-auto rounded-lg bg-background/60 p-3 font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify(event.details, null, 2)}
                </pre>
              ) : null}
            </article>
          ))}
        </div>
      </WhoopPageStates>
    </div>
  )
}
