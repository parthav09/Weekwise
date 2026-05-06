import {
  Calendar,
  CalendarCheck,
  LayoutDashboard,
  ListTodo,
  Plus,
  Repeat,
  Settings,
  Shield,
} from "lucide-react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"

import { cn } from "../lib/utils"
import { buttonVariants } from "./ui/button-variants"

const navItems = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Today", href: "/today", icon: CalendarCheck },
  { name: "Tasks", href: "/tasks", icon: ListTodo },
  { name: "Habits", href: "/habits", icon: Repeat },
  { name: "Life", href: "/life-blocks", icon: Shield },
  { name: "Plan", href: "/weekly-plan", icon: Calendar },
]

export function AppLayout() {
  const location = useLocation()
  const isHome = location.pathname === "/"

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-[3.25rem] max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
              W
            </div>
            <span className="hidden font-semibold tracking-tight sm:inline">WeekWise</span>
          </Link>

          <nav className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1" aria-label="Main">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                aria-current={location.pathname === item.href ? "page" : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm transition-colors sm:px-3",
                    "outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-muted font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden sm:inline">{item.name}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              to="/settings"
              aria-label="Settings"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "text-muted-foreground",
              )}
            >
              <Settings className="h-4 w-4" />
            </Link>
            <Link
              to={isHome ? "/tasks" : "/habits"}
              className={cn(buttonVariants({ size: "sm" }), "shadow-sm")}
            >
              <Plus className="h-4 w-4 sm:mr-0" />
              <span className="hidden sm:inline">New</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
