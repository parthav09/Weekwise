import { AlertCircle, Inbox, Loader2 } from "lucide-react"

import { cn } from "../../lib/utils"

interface WhoopPageStatesProps {
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  children: React.ReactNode
}

export function WhoopPageStates({
  loading,
  error,
  empty,
  emptyTitle = "No data yet",
  emptyDescription = "Connect your WHOOP strap via the BLE service to see data here.",
  children,
}: WhoopPageStatesProps) {
  if (loading) {
    return (
      <div className="fluid-card flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading WHOOP BLE data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fluid-card border-danger/30 bg-danger/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
          <div>
            <h3 className="font-semibold text-danger">Could not load data</h3>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Ensure the backend BLE service is running and the{" "}
              <code className="rounded bg-muted px-1 py-0.5">/integrations/whoop-ble</code> routes
              are registered.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (empty) {
    return (
      <div className="fluid-card flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/60" aria-hidden />
        <div>
          <h3 className="font-semibold">{emptyTitle}</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{emptyDescription}</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function WhoopSectionTitle({
  title,
  description,
  className,
}: {
  title: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}
