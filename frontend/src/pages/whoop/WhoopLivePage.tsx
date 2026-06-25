import { useEffect, useState } from "react"

import { ConnectionStatusCard } from "../../components/whoop/ConnectionStatusCard"
import { DerivedMetricDisplay, VerifiedFieldDisplay } from "../../components/whoop/FieldDisplay"
import { WhoopPageStates, WhoopSectionTitle } from "../../components/whoop/WhoopPageStates"
import {
  formatWhoopTimestamp,
  getWhoopBleLive,
  getWhoopBleStatus,
  type WhoopBleStatus,
  type WhoopLiveSnapshot,
} from "../../lib/whoopBleApi"

const LIVE_POLL_MS = 2000

export function WhoopLivePage() {
  const [status, setStatus] = useState<WhoopBleStatus | null>(null)
  const [live, setLive] = useState<WhoopLiveSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [nextStatus, nextLive] = await Promise.all([getWhoopBleStatus(), getWhoopBleLive()])
        if (!cancelled) {
          setStatus(nextStatus)
          setLive(nextLive)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load live data")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    const interval = window.setInterval(() => {
      void load()
    }, LIVE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const streamEntries = live
    ? Object.entries(live.streams).filter(([, field]) => field != null)
    : []
  const derivedEntries = live ? Object.entries(live.derived_metrics) : []
  const hasStreams = streamEntries.length > 0 || derivedEntries.length > 0

  return (
    <div className="space-y-6">
      {status ? <ConnectionStatusCard status={status} /> : null}

      <WhoopPageStates
        loading={loading}
        error={error}
        empty={!loading && !error && !hasStreams}
        emptyTitle="No live streams"
        emptyDescription="Verified realtime streams appear here once the BLE service connects and publishes heart rate or R-R data."
      >
        {live ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <WhoopSectionTitle
                title="Live streams"
                description="Verified values only — unknown packets are shown separately, never guessed."
              />
              <p className="text-xs text-muted-foreground">
                Updated {formatWhoopTimestamp(live.updated_at)}
              </p>
            </div>

            {streamEntries.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {streamEntries.map(([key, field]) =>
                  field ? <VerifiedFieldDisplay key={key} label={key} field={field} /> : null,
                )}
              </div>
            ) : null}

            {derivedEntries.length > 0 ? (
              <div className="space-y-3">
                <WhoopSectionTitle
                  title="Derived approximations"
                  description="Computed locally by the backend — not verified WHOOP metrics."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {derivedEntries.map(([key, metric]) => (
                    <DerivedMetricDisplay key={key} metric={metric} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </WhoopPageStates>
    </div>
  )
}
