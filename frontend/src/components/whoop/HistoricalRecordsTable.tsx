import { formatWhoopTimestamp, type WhoopHistoricalRecord } from "../../lib/whoopBleApi"
import { DerivedMetricDisplay, VerifiedFieldDisplay } from "./FieldDisplay"

export function HistoricalRecordsTable({ records }: { records: WhoopHistoricalRecord[] }) {
  return (
    <div className="space-y-4">
      {records.map((record) => (
        <article key={record.id} className="fluid-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{record.record_type}</h3>
              <p className="text-xs text-muted-foreground">{formatWhoopTimestamp(record.recorded_at)}</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {record.id}
            </span>
          </div>

          {Object.keys(record.verified_fields).length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Verified fields
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(record.verified_fields).map(([key, field]) => (
                  <VerifiedFieldDisplay key={key} label={key} field={field} />
                ))}
              </div>
            </div>
          ) : null}

          {Object.keys(record.unknown_fields).length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unknown / undecoded
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(record.unknown_fields).map(([key, field]) => (
                  <VerifiedFieldDisplay key={key} label={key} field={field} />
                ))}
              </div>
            </div>
          ) : null}

          {Object.keys(record.derived_metrics).length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Derived approximations
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(record.derived_metrics).map(([key, metric]) => (
                  <DerivedMetricDisplay key={key} metric={metric} />
                ))}
              </div>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}
