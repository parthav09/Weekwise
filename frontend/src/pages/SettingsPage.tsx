import { User, Bell, CalendarDays, Shield, Globe, Mail, Moon, RefreshCw, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  getNotificationPreferences,
  getWebPushPublicKey,
  disconnectGmail,
  getGmailStatus,
  getGoogleCalendarStatus,
  gmailConnectUrl,
  googleCalendarConnectUrl,
  listScheduledNotifications,
  listWebPushSubscriptions,
  runDispatchNotifications,
  subscribeToWebPush,
  syncGmail,
  syncGoogleCalendar,
  unsubscribeFromWebPush,
  updateNotificationPreference,
  type CalendarStatus,
  type GmailStatus,
  type NotificationChannel,
  type NotificationPreference,
  type ScheduledNotification,
  type WebPushSubscriptionRead,
} from "../lib/api"
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
    icon: Shield,
    title: "Privacy & Security",
    description: "Manage your data and access",
    comingSoon: true,
  },
]

const notificationChannelLabels: Record<NotificationChannel, string> = {
  web_push: "Web Push",
  email: "Email",
  inapp: "In-app",
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function SettingsPage() {
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme())
  const [searchParams] = useSearchParams()
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarSyncing, setCalendarSyncing] = useState(false)
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null)
  const [gmailLoading, setGmailLoading] = useState(true)
  const [gmailSyncing, setGmailSyncing] = useState(false)
  const [gmailMessage, setGmailMessage] = useState<string | null>(null)
  const [gmailError, setGmailError] = useState<string | null>(null)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreference[]>([])
  const [webPushSubscriptions, setWebPushSubscriptions] = useState<WebPushSubscriptionRead[]>([])
  const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotification[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [notificationsBusy, setNotificationsBusy] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null)
  const [notificationError, setNotificationError] = useState<string | null>(null)

  function setAppTheme(nextTheme: AppTheme) {
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }

  useEffect(() => {
    const result = searchParams.get("google_calendar")
    if (result === "connected") {
      setCalendarMessage("Google Calendar connected.")
    }
    if (result === "error") {
      setCalendarError("Google Calendar connection failed.")
    }
    const gmailResult = searchParams.get("gmail")
    if (gmailResult === "connected") {
      setGmailMessage("Gmail connected.")
    }
    if (gmailResult === "error") {
      setGmailError("Gmail connection failed.")
    }
  }, [searchParams])

  useEffect(() => {
    async function loadStatus() {
      setCalendarLoading(true)
      setCalendarError(null)
      try {
        setCalendarStatus(await getGoogleCalendarStatus())
      } catch (err) {
        setCalendarError(err instanceof Error ? err.message : "Couldn't load calendar status")
      } finally {
        setCalendarLoading(false)
      }
    }
    void loadStatus()
  }, [])

  const loadGmailStatus = async () => {
    setGmailLoading(true)
    setGmailError(null)
    try {
      setGmailStatus(await getGmailStatus())
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : "Couldn't load Gmail status")
    } finally {
      setGmailLoading(false)
    }
  }

  useEffect(() => {
    void loadGmailStatus()
  }, [])

  const loadNotifications = async () => {
    setNotificationsLoading(true)
    setNotificationError(null)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setHours(tomorrow.getHours() + 24)
    try {
      const [preferences, subscriptions, scheduled] = await Promise.all([
        getNotificationPreferences(),
        listWebPushSubscriptions(),
        listScheduledNotifications({ startFrom: now, endTo: tomorrow, status: "pending" }),
      ])
      setNotificationPreferences(preferences)
      setWebPushSubscriptions(subscriptions)
      setScheduledNotifications(scheduled)
    } catch (err) {
      setNotificationError(err instanceof Error ? err.message : "Couldn't load notifications")
    } finally {
      setNotificationsLoading(false)
    }
  }

  useEffect(() => {
    void loadNotifications()
  }, [])

  async function handleSyncCalendar() {
    setCalendarSyncing(true)
    setCalendarError(null)
    setCalendarMessage(null)
    const start = new Date()
    start.setDate(start.getDate() - 7)
    const end = new Date()
    end.setDate(end.getDate() + 45)
    try {
      const result = await syncGoogleCalendar(start, end)
      setCalendarMessage(`Synced ${result.synced_count} Google Calendar events.`)
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : "Couldn't sync Google Calendar")
    } finally {
      setCalendarSyncing(false)
    }
  }

  async function handleSyncGmail() {
    setGmailSyncing(true)
    setGmailError(null)
    setGmailMessage(null)
    try {
      const result = await syncGmail()
      setGmailMessage(
        `Fetched ${result.fetched_count} emails, ${result.new_email_count} new, ${result.candidate_count} task candidates.`,
      )
      await loadGmailStatus()
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : "Couldn't sync Gmail")
    } finally {
      setGmailSyncing(false)
    }
  }

  async function handleDisconnectGmail() {
    if (!window.confirm("Disconnect Gmail? Existing extracted candidates will stay in your inbox.")) {
      return
    }
    setGmailSyncing(true)
    setGmailError(null)
    setGmailMessage(null)
    try {
      await disconnectGmail()
      setGmailStatus({ connected: false, provider_account_email: null, token_expires_at: null, last_synced_at: null })
      setGmailMessage("Gmail disconnected.")
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : "Couldn't disconnect Gmail")
    } finally {
      setGmailSyncing(false)
    }
  }

  async function handleUpdateNotificationPreference(
    preference: NotificationPreference,
    input: { enabled?: boolean; default_lead_minutes?: number },
  ) {
    setNotificationsBusy(true)
    setNotificationError(null)
    setNotificationMessage(null)
    try {
      const updated = await updateNotificationPreference(preference.channel, input)
      setNotificationPreferences((prev) =>
        prev.map((pref) => (pref.channel === updated.channel ? updated : pref)),
      )
    } catch (err) {
      setNotificationError(err instanceof Error ? err.message : "Couldn't update preference")
    } finally {
      setNotificationsBusy(false)
    }
  }

  async function handleEnableBrowserNotifications() {
    setNotificationsBusy(true)
    setNotificationError(null)
    setNotificationMessage(null)
    try {
      if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
        throw new Error("This browser does not support web push notifications")
      }
      const publicKey = await getWebPushPublicKey()
      if (!publicKey) {
        throw new Error("WEB_PUSH_VAPID_PUBLIC_KEY is not configured on the backend")
      }
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        throw new Error("Browser notification permission was not granted")
      }
      const registration = await navigator.serviceWorker.register("/sw.js")
      const existingSubscription = await registration.pushManager.getSubscription()
      const pushSubscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))
      const subscription = await subscribeToWebPush(pushSubscription)
      setWebPushSubscriptions((prev) => [subscription, ...prev.filter((s) => s.id !== subscription.id)])
      setNotificationMessage("Browser notifications enabled.")
      await loadNotifications()
    } catch (err) {
      setNotificationError(err instanceof Error ? err.message : "Couldn't enable browser notifications")
    } finally {
      setNotificationsBusy(false)
    }
  }

  async function handleRemoveWebPushSubscription(subscriptionId: number) {
    setNotificationsBusy(true)
    setNotificationError(null)
    setNotificationMessage(null)
    try {
      await unsubscribeFromWebPush(subscriptionId)
      setWebPushSubscriptions((prev) => prev.filter((sub) => sub.id !== subscriptionId))
      setNotificationMessage("Browser notification subscription removed.")
    } catch (err) {
      setNotificationError(err instanceof Error ? err.message : "Couldn't remove subscription")
    } finally {
      setNotificationsBusy(false)
    }
  }

  async function handleRunDispatch() {
    setNotificationsBusy(true)
    setNotificationError(null)
    setNotificationMessage(null)
    try {
      const result = await runDispatchNotifications()
      setNotificationMessage(
        `Sent ${result.sent_count}; skipped ${result.skipped_count}; failed ${result.failed_count}.`,
      )
      await loadNotifications()
    } catch (err) {
      setNotificationError(err instanceof Error ? err.message : "Couldn't run dispatch")
    } finally {
      setNotificationsBusy(false)
    }
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

      <div className="rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Google Calendar</h3>
              <p className="text-xs text-muted-foreground">
                {calendarLoading
                  ? "Checking connection..."
                  : calendarStatus?.connected
                    ? `Connected${calendarStatus.provider_account_email ? ` as ${calendarStatus.provider_account_email}` : ""}`
                    : "Not connected"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={calendarStatus?.connected ? "outline" : "default"}
              size="sm"
              onClick={() => window.location.assign(googleCalendarConnectUrl())}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {calendarStatus?.connected ? "Reconnect" : "Connect Google Calendar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!calendarStatus?.connected || calendarSyncing}
              onClick={handleSyncCalendar}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", calendarSyncing && "animate-spin")} />
              {calendarSyncing ? "Syncing..." : "Sync Calendar"}
            </Button>
          </div>
        </div>
        {calendarMessage ? (
          <p className="mt-3 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
            {calendarMessage}
          </p>
        ) : null}
        {calendarError ? (
          <p className="mt-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
            {calendarError}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Gmail</h3>
              <p className="text-xs text-muted-foreground">
                {gmailLoading
                  ? "Checking connection..."
                  : gmailStatus?.connected
                    ? `Connected${gmailStatus.provider_account_email ? ` as ${gmailStatus.provider_account_email}` : ""}`
                    : "Not connected"}
              </p>
              {gmailStatus?.last_synced_at ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Last synced {formatDateTime(gmailStatus.last_synced_at)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={gmailStatus?.connected ? "outline" : "default"}
              size="sm"
              onClick={() => window.location.assign(gmailConnectUrl())}
            >
              <Mail className="h-3.5 w-3.5" />
              {gmailStatus?.connected ? "Reconnect Gmail" : "Connect Gmail"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!gmailStatus?.connected || gmailSyncing}
              onClick={handleSyncGmail}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", gmailSyncing && "animate-spin")} />
              {gmailSyncing ? "Syncing..." : "Sync Gmail"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!gmailStatus?.connected || gmailSyncing}
              onClick={handleDisconnectGmail}
            >
              Disconnect
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          WeekWise stores Gmail metadata and snippets only. Full email bodies and attachments are not fetched.
        </p>
        {gmailMessage ? (
          <p className="mt-3 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
            {gmailMessage}
          </p>
        ) : null}
        {gmailError ? (
          <p className="mt-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
            {gmailError}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Notifications</h3>
              <p className="text-xs text-muted-foreground">
                Reminders are scheduled from saved plan items. Run dispatch manually here until cron is configured.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={notificationsBusy}
              onClick={handleEnableBrowserNotifications}
            >
              <Bell className="h-3.5 w-3.5" />
              Enable browser notifications
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={notificationsBusy}
              onClick={handleRunDispatch}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", notificationsBusy && "animate-spin")} />
              Send due notifications now
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {notificationPreferences.map((preference) => (
            <div key={preference.channel} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{notificationChannelLabels[preference.channel]}</p>
                  <p className="text-xs text-muted-foreground">
                    {preference.enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={preference.enabled}
                    disabled={notificationsBusy}
                    onChange={(event) =>
                      handleUpdateNotificationPreference(preference, {
                        enabled: event.target.checked,
                      })
                    }
                  />
                  On
                </label>
              </div>
              <label className="mt-3 block text-xs font-medium text-muted-foreground">
                Lead time
              </label>
              <Input
                type="number"
                min={0}
                max={1440}
                value={preference.default_lead_minutes}
                disabled={notificationsBusy}
                onChange={(event) =>
                  handleUpdateNotificationPreference(preference, {
                    default_lead_minutes: Number(event.target.value),
                  })
                }
                className="mt-1 h-8"
              />
            </div>
          ))}
          {!notificationsLoading && notificationPreferences.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              No notification preferences found.
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold">Web push subscriptions</h4>
            <div className="mt-2 space-y-2">
              {webPushSubscriptions.map((subscription) => (
                <div
                  key={subscription.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{subscription.endpoint}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Created {formatDateTime(subscription.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={notificationsBusy}
                    onClick={() => handleRemoveWebPushSubscription(subscription.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {!notificationsLoading && webPushSubscriptions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No active browser subscriptions.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Next 24 hours</h4>
            <div className="mt-2 space-y-2">
              {scheduledNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{notification.title}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {notificationChannelLabels[notification.channel]}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{formatDateTime(notification.send_at)}</p>
                </div>
              ))}
              {!notificationsLoading && scheduledNotifications.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No pending reminders in the next 24 hours.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {notificationMessage ? (
          <p className="mt-3 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
            {notificationMessage}
          </p>
        ) : null}
        {notificationError ? (
          <p className="mt-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
            {notificationError}
          </p>
        ) : null}
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
