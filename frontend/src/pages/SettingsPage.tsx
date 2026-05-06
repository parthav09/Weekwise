import { User, Bell, Shield, Globe } from "lucide-react"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
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
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize your WeekWise experience
        </p>
      </div>

      {/* Settings grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {settingsGroups.map((group) => {
          const Icon = group.icon

          return (
            <div
              key={group.title}
              className={cn(
                "rounded-2xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm",
                group.comingSoon && "opacity-75",
              )}
            >
              {/* Group header */}
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
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

              {/* Fields */}
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

              {/* Action */}
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

      {/* App info */}
      <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          WeekWise v0.1.0 · Built for focused weeks
        </p>
      </div>
    </div>
  )
}
