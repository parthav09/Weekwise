import { AlertTriangle } from "lucide-react"

import type { WhoopBleError } from "../../lib/whoopBleApi"

export function SyncErrorPanel({ error }: { error: WhoopBleError }) {
  return (
    <div
      className="rounded-lg border border-danger/30 bg-danger/5 p-4"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-danger">{error.message}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Error code: {error.code}</p>
          {error.recovery_suggestions.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-foreground">Try these steps:</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                {error.recovery_suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
