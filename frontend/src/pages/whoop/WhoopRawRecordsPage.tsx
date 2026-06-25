import { useEffect, useState } from "react"

import { ConnectionStatusCard } from "../../components/whoop/ConnectionStatusCard"
import { RawRecordsTable } from "../../components/whoop/RawRecordsTable"
import { WhoopPageStates, WhoopSectionTitle } from "../../components/whoop/WhoopPageStates"
import { Button } from "../../components/ui/button"
import {
  getWhoopBleRawRecords,
  getWhoopBleStatus,
  type WhoopBleStatus,
  type WhoopRawRecord,
} from "../../lib/whoopBleApi"

const PAGE_SIZE = 50

export function WhoopRawRecordsPage() {
  const [status, setStatus] = useState<WhoopBleStatus | null>(null)
  const [records, setRecords] = useState<WhoopRawRecord[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadPage(nextOffset: number) {
    setLoading(true)
    setError(null)
    try {
      const [nextStatus, response] = await Promise.all([
        getWhoopBleStatus(),
        getWhoopBleRawRecords({ limit: PAGE_SIZE, offset: nextOffset }),
      ])
      setStatus(nextStatus)
      setRecords(response.records)
      setTotal(response.total)
      setOffset(response.offset)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load raw records")
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPage(0)
  }, [])

  const hasPrev = offset > 0
  const hasNext = offset + records.length < total

  return (
    <div className="space-y-6">
      {status ? <ConnectionStatusCard status={status} /> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <WhoopSectionTitle
          title="Raw BLE records"
          description="Unmodified payloads captured by the BLE service for debugging. The frontend does not decode these."
        />
        <p className="text-xs text-muted-foreground">
          Showing {records.length === 0 ? 0 : offset + 1}–{offset + records.length} of {total}
        </p>
      </div>

      <WhoopPageStates
        loading={loading}
        error={error}
        empty={!loading && !error && records.length === 0}
        emptyTitle="No raw records"
        emptyDescription="Raw frames appear when the BLE service captures characteristic reads and notifications."
      >
        <>
          <RawRecordsTable records={records} />
          <div className="mt-4 flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasPrev || loading}
              onClick={() => void loadPage(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasNext || loading}
              onClick={() => void loadPage(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </>
      </WhoopPageStates>
    </div>
  )
}
