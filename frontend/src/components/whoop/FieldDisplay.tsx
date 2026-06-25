import {
  formatWhoopTimestamp,
  isUnknownField,
  isVerifiedField,
  type WhoopDerivedMetric,
  type WhoopField,
} from "../../lib/whoopBleApi"
import { cn } from "../../lib/utils"

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ")
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value)
  }
  return String(value)
}

export function VerifiedFieldDisplay({
  label,
  field,
}: {
  label: string
  field: WhoopField<unknown>
}) {
  if (isVerifiedField(field)) {
    return (
      <div className="rounded-lg border border-success/25 bg-success/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{label}</p>
          <span
            className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success"
            data-testid="field-badge-verified"
          >
            Verified
          </span>
        </div>
        <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{formatValue(field.value)}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Source: {field.source} · {formatWhoopTimestamp(field.observed_at)}
        </p>
      </div>
    )
  }

  if (isUnknownField(field)) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              field.confidence === "undecoded"
                ? "bg-warning/15 text-warning"
                : "bg-muted text-muted-foreground",
            )}
            data-testid={`field-badge-${field.confidence}`}
          >
            {field.confidence === "undecoded" ? "Undecoded" : "Unknown"}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {field.reason ?? "No decoded value available from the BLE service."}
        </p>
        {field.raw_hint ? (
          <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground/80">
            Hint: {field.raw_hint}
          </p>
        ) : null}
      </div>
    )
  }

  return null
}

export function DerivedMetricDisplay({ metric }: { metric: WhoopDerivedMetric }) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{metric.label}</p>
        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
          Local approximation
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{formatValue(metric.value)}</p>
      <p className="mt-2 text-[11px] text-muted-foreground">{metric.disclaimer}</p>
      <p className="mt-1 text-[11px] text-muted-foreground/80">
        Computed {formatWhoopTimestamp(metric.computed_at)}
      </p>
    </div>
  )
}
