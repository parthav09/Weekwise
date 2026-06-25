import { Activity, Bluetooth, Clock, RefreshCw } from "lucide-react"

import {
  connectionStateLabel,
  deviceGenerationLabel,
  formatWhoopTimestamp,
  syncStatusLabel,
  type WhoopBleStatus,
} from "../../lib/whoopBleApi"
import { cn } from "../../lib/utils"
import { SyncErrorPanel } from "./SyncErrorPanel"

const connectionTone: Record<WhoopBleStatus["connection_state"], string> = {
  connected: "bg-success/15 text-success border-success/25",
  connecting: "bg-warning/15 text-warning border-warning/25",
  disconnected: "bg-muted text-muted-foreground border-border",
  error: "bg-danger/15 text-danger border-danger/25",
}

const syncTone: Record<WhoopBleStatus["sync_status"], string> = {
  idle: "bg-muted text-muted-foreground",
  syncing: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  failed: "bg-danger/15 text-danger",
}

export function ConnectionStatusCard({ status }: { status: WhoopBleStatus }) {
  return (
    <div className="fluid-card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bluetooth className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="font-semibold">WHOOP BLE connection</h3>
            <p className="text-xs text-muted-foreground">
              {status.device_name ?? "No device paired"}
              {status.device_address ? ` · ${status.device_address}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              connectionTone[status.connection_state],
            )}
          >
            <Activity className="h-3 w-3" aria-hidden />
            {connectionStateLabel(status.connection_state)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              syncTone[status.sync_status],
            )}
          >
            <RefreshCw
              className={cn("h-3 w-3", status.sync_status === "syncing" && "animate-spin")}
              aria-hidden
            />
            {syncStatusLabel(status.sync_status)}
          </span>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Device generation
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {deviceGenerationLabel(status.device_generation)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            Last sync
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {status.last_sync_at ? formatWhoopTimestamp(status.last_sync_at) : "Never synced"}
          </dd>
        </div>
      </dl>

      {status.last_error ? <SyncErrorPanel error={status.last_error} /> : null}
    </div>
  )
}
