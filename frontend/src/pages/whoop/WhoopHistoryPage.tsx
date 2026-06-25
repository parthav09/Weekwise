import { useEffect, useMemo, useState } from "react"

import { ConnectionStatusCard } from "../../components/whoop/ConnectionStatusCard"
import { HistoricalRecordsTable } from "../../components/whoop/HistoricalRecordsTable"
import { WhoopPageStates, WhoopSectionTitle } from "../../components/whoop/WhoopPageStates"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { getWhoopBleHistory, getWhoopBleStatus, type WhoopBleStatus, type WhoopHistoricalRecord } from "../../lib/whoopBleApi"
import { toLocalDateKey } from "../../lib/dates"

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  return { start: toLocalDateKey(start), end: toLocalDateKey(end) }
}

export function WhoopHistoryPage() {
  const defaults = useMemo(() => defaultRange(), [])
  const [status, setStatus] = useState<WhoopBleStatus | null>(null)
  const [records, setRecords] = useState<WhoopHistoricalRecord[]>([])
  const [startDate, setStartDate] = useState(defaults.start)
  const [endDate, setEndDate] = useState(defaults.end)
  const [loading, setLoading] = useState(true)
  const [querying, setQuerying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadHistory(start: string, end: string) {
    setQuerying(true)
    setError(null)
    try {
      const response = await getWhoopBleHistory({
        start: new Date(`${start}T00:00:00`),
        end: new Date(`${end}T23:59:59`),
      })
      setRecords(response.records)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history")
      setRecords([])
    } finally {
      setQuerying(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setStatus(await getWhoopBleStatus())
      } catch {
        // Status is optional on this page; history error surfaces separately.
      }
      await loadHistory(defaults.start, defaults.end)
    }
    void bootstrap()
  }, [defaults.end, defaults.start])

  return (
    <div className="space-y-6">
      {status ? <ConnectionStatusCard status={status} /> : null}

      <div className="fluid-card p-5">
        <WhoopSectionTitle
          title="Query historical records"
          description="Decoded records returned by the BLE service — ready for inspection or export."
        />
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void loadHistory(startDate, endDate)
          }}
        >
          <div>
            <label htmlFor="whoop-start" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Start date
            </label>
            <Input
              id="whoop-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label htmlFor="whoop-end" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              End date
            </label>
            <Input
              id="whoop-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-9"
            />
          </div>
          <Button type="submit" size="sm" disabled={querying}>
            {querying ? "Loading…" : "Run query"}
          </Button>
        </form>
      </div>

      <WhoopPageStates
        loading={loading}
        error={error}
        empty={!loading && !error && records.length === 0}
        emptyTitle="No records in range"
        emptyDescription="Try widening the date range or sync historical data from your strap via the BLE service."
      >
        <HistoricalRecordsTable records={records} />
      </WhoopPageStates>
    </div>
  )
}
