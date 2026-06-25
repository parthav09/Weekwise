import { Activity, Database, FileCode2, Stethoscope } from "lucide-react"
import { NavLink, Outlet } from "react-router-dom"

import { cn } from "../../lib/utils"

const whoopNavItems = [
  { name: "Live", href: "/whoop/live", icon: Activity, description: "Realtime verified streams" },
  { name: "History", href: "/whoop/history", icon: Database, description: "Decoded historical records" },
  { name: "Diagnostics", href: "/whoop/diagnostics", icon: Stethoscope, description: "Connection & sync events" },
  { name: "Raw records", href: "/whoop/raw", icon: FileCode2, description: "Debug frames from BLE service" },
]

export function WhoopBleLayout() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          NOOP WHOOP BLE
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">WHOOP strap data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Display-only UI for BLE-extracted data. No cloud access or packet decoding in the browser.
        </p>
      </div>

      <nav
        className="flex flex-wrap gap-2 rounded-xl border border-border bg-muted/30 p-1"
        aria-label="WHOOP BLE sections"
      >
        {whoopNavItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex min-w-[140px] flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-background font-medium text-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
