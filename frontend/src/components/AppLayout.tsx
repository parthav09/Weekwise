import {
  Activity,
  Calendar,
  CalendarCheck,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Menu,
  Repeat,
  Settings,
  ShoppingCart,
  Shield,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"

import { cn } from "../lib/utils"

const navItems = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Today", href: "/today", icon: CalendarCheck },
  { name: "Tasks", href: "/tasks", icon: ListTodo },
  { name: "Inbox", href: "/inbox", icon: Inbox },
  { name: "Habits", href: "/habits", icon: Repeat },
  { name: "Groceries", href: "/groceries", icon: ShoppingCart },
  { name: "Life Blocks", href: "/life-blocks", icon: Shield },
  { name: "Weekly Plan", href: "/weekly-plan", icon: Calendar },
  { name: "WHOOP BLE", href: "/whoop/live", icon: Activity },
]

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const location = useLocation()

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-5 pb-6 pt-7">
        <Link
          to="/"
          onClick={onNavClick}
          className="flex items-center gap-3 outline-none"
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30">
            <span className="font-display text-base font-semibold tracking-tight text-white">W</span>
          </div>
          <div>
            <p className="font-display text-base font-semibold leading-none text-sidebar-foreground">WeekWise</p>
            <p className="mt-1 text-[11px] text-sidebar-muted">Your life, in season.</p>
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-5 mb-4 h-px bg-sidebar-border" />

      {/* Nav section label */}
      <p className="mb-1.5 px-5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted/60">
        Workspace
      </p>

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            onClick={onNavClick}
            aria-current={location.pathname === item.href ? "page" : undefined}
            className={({ isActive }) =>
              cn("nav-pill", isActive && "active")
            }
          >
            <item.icon className="nav-icon" aria-hidden />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-5 pt-4">
        <div className="mx-2 mb-3 h-px bg-sidebar-border" />
        <NavLink
          to="/settings"
          onClick={onNavClick}
          className={({ isActive }) => cn("nav-pill", isActive && "active")}
        >
          <Settings className="nav-icon" aria-hidden />
          <span>Settings</span>
        </NavLink>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Lock body scroll when drawer open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  return (
    <div className="flex min-h-screen">
      {/* ─── Desktop sidebar ─── */}
      <aside className="sidebar-bg fixed inset-y-0 left-0 z-30 hidden w-56 flex-col lg:flex">
        <SidebarContent />
      </aside>

      {/* ─── Mobile drawer overlay ─── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* ─── Mobile drawer ─── */}
      <aside
        className={cn(
          "sidebar-bg fixed inset-y-0 left-0 z-50 w-64 transform flex-col transition-transform duration-250 ease-in-out lg:hidden",
          mobileOpen ? "flex translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          type="button"
          className="absolute right-3 top-4 rounded-lg p-1.5 text-sidebar-muted hover:text-sidebar-foreground"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
        <SidebarContent onNavClick={() => setMobileOpen(false)} />
      </aside>

      {/* ─── Main content ─── */}
      <div className="page-bg flex min-h-screen w-full flex-col lg:ml-56">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <span className="font-display text-xs font-semibold text-white">W</span>
            </div>
            <span className="font-display text-base font-semibold">WeekWise</span>
          </Link>
          <Link to="/settings" className="rounded-xl p-2 text-muted-foreground hover:bg-muted">
            <Settings className="h-4 w-4" />
          </Link>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-8 sm:py-10">
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
