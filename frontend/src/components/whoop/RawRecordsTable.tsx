import { formatWhoopTimestamp, type WhoopRawRecord } from "../../lib/whoopBleApi"
import { cn } from "../../lib/utils"

const decodeTone: Record<WhoopRawRecord["decode_status"], string> = {
  verified: "bg-success/15 text-success",
  partial: "bg-warning/15 text-warning",
  undecoded: "bg-muted text-muted-foreground",
}

export function RawRecordsTable({ records }: { records: WhoopRawRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Dir</th>
            <th className="px-4 py-3 font-medium">Characteristic</th>
            <th className="px-4 py-3 font-medium">Length</th>
            <th className="px-4 py-3 font-medium">Decode</th>
            <th className="px-4 py-3 font-medium">Payload (hex)</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-b border-border/60 align-top last:border-0">
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {formatWhoopTimestamp(record.captured_at)}
              </td>
              <td className="px-4 py-3">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] uppercase">
                  {record.direction}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                {record.characteristic_uuid ?? "—"}
              </td>
              <td className="px-4 py-3 tabular-nums">{record.payload_length}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    decodeTone[record.decode_status],
                  )}
                >
                  {record.decode_status}
                </span>
              </td>
              <td className="max-w-xs px-4 py-3">
                <code className="block break-all font-mono text-[11px] text-foreground/90">
                  {record.payload_hex}
                </code>
                {record.notes ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{record.notes}</p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
