import { User, Bell, Shield, Globe, Moon, Sun } from "lucide-react"
import { useState } from "react"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { applyTheme, getStoredTheme, type AppTheme } from "../lib/theme"
import { cn } from "../lib/utils"

const settingsGroups = [
  {
    icon: User,
    title: "Profile",
    description: "Your personal information",
    fields: [
      { id: "name", label: "Display name", placeholder: "How you want to be called" },
      { id: "email", label: "Email", placeholder: "your@email.com", type: "email" },
    ],
  },
  {
    icon: Globe,
    title: "Preferences",
    description: "Regional and language settings",
    fields: [
      { id: "timezone", label: "Timezone", placeholder: "America/Los_Angeles" },
      { id: "weekstart", label: "Week starts on", placeholder: "Monday" },
    ],
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "How we reach out to you",
    comingSoon: true,
  },
  {
    icon: Shield,
    title: "Privacy & Security",
    description: "Manage your data and access",
    comingSoon: true,
  },
]

export function SettingsPage() {
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme())

  function setAppTheme(nextTheme: AppTheme) {
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize your WeekWise experience
        </p>
      </div>

      <div className="rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-semibold">Appearance</h3>
              <p className="text-xs text-muted-foreground">
                Switch between light mode and dark mode.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-1">
            <Button
              type="button"
              size="sm"
              variant={theme === "light" ? "default" : "ghost"}
              className="h-8"
              onClick={() => setAppTheme("light")}
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </Button>
            <Button
              type="button"
              size="sm"
              variant={theme === "dark" ? "default" : "ghost"}
              className="h-8"
              onClick={() => setAppTheme("dark")}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {settingsGroups.map((group) => {
          const Icon = group.icon

          return (
            <div
              key={group.title}
              className={cn(
                "rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm",
                group.comingSoon && "opacity-75",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{group.title}</h3>
                    {group.comingSoon && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                </div>
              </div>

              {!group.comingSoon && group.fields && (
                <div className="mt-4 space-y-3">
                  {group.fields.map((field) => (
                    <div key={field.id}>
                      <label
                        htmlFor={field.id}
                        className="mb-1.5 block text-xs font-medium text-muted-foreground"
                      >
                        {field.label}
                      </label>
                      <Input
                        id={field.id}
                        type={field.type || "text"}
                        placeholder={field.placeholder}
                        className="h-10"
                      />
                    </div>
                  ))}
                </div>
              )}

              {!group.comingSoon && (
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" disabled>
                    Save changes
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          WeekWise v0.1.0 · Built for focused weeks
        </p>
      </div>
    </div>
  )
}
