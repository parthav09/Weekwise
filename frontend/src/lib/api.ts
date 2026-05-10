import { toLocalDateKey } from "./dates"

// WeekWise REST API: types match the backend JSON (snake_case).

export type TaskPriority = "low" | "medium" | "high" | "urgent"
export type TaskStatus = "todo" | "in_progress" | "done"
export type TaskEnergyLevel = "low" | "medium" | "high"
export type TaskCategory = "school" | "work" | "fitness" | "social" | "errands" | "personal"
export type TaskScheduleFlexibility = "flexible" | "fixed"

export interface Task {
  id: number
  user_id: number
  title: string
  description: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  estimated_minutes: number | null
  energy_level: TaskEnergyLevel
  category: TaskCategory
  schedule_flexibility: TaskScheduleFlexibility
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Habit {
  id: number
  user_id: number
  title: string
  target_count_per_week: number
  estimated_minutes: number | null
  preferred_time_of_day: string | null
  created_at: string
  updated_at: string
}

export interface HabitCompletion {
  id: number
  habit_id: number
  user_id: number
  note: string | null
  completed_on: string
  completed_at: string
  created_at: string
  habit_title: string
}

export interface TaskCreateInput {
  title: string
  description?: string | null
  priority: TaskPriority
  due_date?: string | null
  estimated_minutes?: number | null
  energy_level?: TaskEnergyLevel
  category?: TaskCategory
  schedule_flexibility?: TaskScheduleFlexibility
}

export interface HabitCreateInput {
  title: string
  target_count_per_week: number
  estimated_minutes?: number | null
  preferred_time_of_day?: string | null
}

export type HabitUpdateInput = Partial<HabitCreateInput>

export type LifeBlockType = "available" | "blocked" | "recovery"
export type LifeBlockCategory =
  | "sleep"
  | "workout"
  | "commute"
  | "meal"
  | "class_"
  | "work"
  | "social"
  | "focus"
  | "free"
  | "other"

export interface LifeBlock {
  id: number
  user_id: number
  title: string
  block_type: LifeBlockType
  category: LifeBlockCategory
  start_time: string
  end_time: string
  recurrence_rule: string | null
  created_at: string
  updated_at: string
}

export interface LifeBlockCreateInput {
  title: string
  block_type: LifeBlockType
  category: LifeBlockCategory
  start_time: string
  end_time: string
  recurrence_rule?: string | null
}

export type LifeBlockUpdateInput = Partial<LifeBlockCreateInput>

export type PlanGenerator = "rules" | "ai"
export type PlanBlockType = "task" | "habit" | "life"
export type SavedPlanScope = "day" | "week"
export type SavedPlanItemStatus =
  | "planned"
  | "done"
  | "skipped"
  | "moved"
  | "failed"
  | "cancelled"

export interface PlanBlock {
  start: string
  end: string
  type: PlanBlockType
  title: string
  source_id: number | null
  metadata: Record<string, unknown>
}

export interface PlanDay {
  date: string
  blocks: PlanBlock[]
}

export interface PlanRead {
  generated_at: string
  generator: PlanGenerator
  start_at: string
  end_at: string
  days: PlanDay[]
  notes: string[]
}

export interface SavedPlanItem {
  id: number
  generated_plan_id: number
  generated_plan_day_id: number
  title: string
  item_type: PlanBlockType | string
  source_id: number | null
  start_at: string
  end_at: string
  status: SavedPlanItemStatus
  feedback_reason: string | null
  moved_to_start: string | null
  moved_to_end: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SavedPlanDay {
  id: number
  generated_plan_id: number
  date: string
  items: SavedPlanItem[]
  created_at: string
}

export interface SavedPlan {
  id: number
  user_id: number
  scope: SavedPlanScope
  generator: PlanGenerator
  start_at: string
  end_at: string
  notes: string[]
  plan: PlanRead
  days: SavedPlanDay[]
  created_at: string
  updated_at: string
}

export interface ListSavedPlansOptions {
  scope?: SavedPlanScope
  startFrom?: Date
  endTo?: Date
}

export interface SavedPlanItemUpdateInput {
  status?: SavedPlanItemStatus
  feedback_reason?: string | null
  moved_to_start?: string | null
  moved_to_end?: string | null
}

export interface CalendarStatus {
  connected: boolean
  provider_account_email: string | null
  token_expires_at: string | null
}

export interface CalendarEvent {
  id: number
  user_id: number
  provider_event_id: string
  calendar_id: string
  title: string
  start_at: string
  end_at: string
  is_all_day: boolean
  raw_payload: Record<string, unknown>
  synced_at: string
}

export interface CalendarSyncResult {
  synced_count: number
  calendar_id: string
  synced_at: string
}

export interface CalendarExportResult {
  exported_count: number
  skipped_count: number
  event_ids: string[]
}

export interface GmailStatus {
  connected: boolean
  provider_account_email: string | null
  token_expires_at: string | null
  last_synced_at: string | null
}

export interface GmailSyncResult {
  fetched_count: number
  new_email_count: number
  candidate_count: number
}

export type ExtractedTaskCandidateStatus = "pending" | "accepted" | "rejected"

export interface EmailMessageSummary {
  id: number
  sender: string | null
  subject: string | null
  snippet: string | null
  received_at: string
  is_extracted: boolean
}

export interface ExtractedTaskCandidate {
  id: number
  user_id: number
  email_message_id: number
  status: ExtractedTaskCandidateStatus
  source: string
  suggested_title: string
  suggested_description: string | null
  suggested_priority: TaskPriority
  suggested_due_date: string | null
  suggested_estimated_minutes: number | null
  suggested_energy_level: TaskEnergyLevel
  suggested_category: TaskCategory
  suggested_schedule_flexibility: TaskScheduleFlexibility
  confidence: number | null
  rationale: string | null
  created_task_id: number | null
  created_at: string
  updated_at: string
  email_message: EmailMessageSummary
}

export interface ExtractedTaskCandidateOverrides {
  title?: string
  description?: string | null
  priority?: TaskPriority
  due_date?: string | null
  estimated_minutes?: number | null
  energy_level?: TaskEnergyLevel
  category?: TaskCategory
  schedule_flexibility?: TaskScheduleFlexibility
}

export interface ExtractedTaskCandidateAcceptInput {
  overrides?: ExtractedTaskCandidateOverrides
}

export type NotificationChannel = "web_push" | "email" | "inapp"
export type NotificationStatus = "pending" | "sent" | "failed" | "skipped" | "cancelled"

export interface NotificationPreference {
  id: number
  user_id: number
  channel: NotificationChannel
  enabled: boolean
  default_lead_minutes: number
  created_at: string
  updated_at: string
}

export interface NotificationPreferenceUpdateInput {
  enabled?: boolean
  default_lead_minutes?: number
}

export interface WebPushSubscriptionRead {
  id: number
  user_id: number
  endpoint: string
  created_at: string
  last_used_at: string | null
}

export interface ScheduledNotification {
  id: number
  user_id: number
  generated_plan_item_id: number | null
  channel: NotificationChannel
  status: NotificationStatus
  send_at: string
  sent_at: string | null
  title: string
  body: string
  payload: Record<string, unknown>
  failure_reason: string | null
  created_at: string
  updated_at: string
}

export interface NotificationDispatchResult {
  pending_count: number
  sent_count: number
  failed_count: number
  skipped_count: number
  failures: { notification_id: number; channel: NotificationChannel; reason: string }[]
}

export interface ListScheduledNotificationsOptions {
  startFrom?: Date
  endTo?: Date
  status?: NotificationStatus
}

export interface ListExtractedCandidatesOptions {
  status?: ExtractedTaskCandidateStatus
}

export interface PlanRequestInput {
  user_id?: number
  start_at: Date
  end_at: Date
  day_start?: string
  day_end?: string
}

export interface ListTasksOptions {
  dueFrom?: Date
  dueTo?: Date
}

export interface ListLifeBlocksOptions {
  startFrom?: Date
  endTo?: Date
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "")

type ApiErrorBody = { detail?: string }

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as ApiErrorBody
    throw new Error(err.detail ?? `HTTP ${response.status}`)
  }

  return response
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init)
  return (await response.json()) as T
}

async function fetchVoid(path: string, init?: RequestInit): Promise<void> {
  await request(path, init)
}

export function listTasks({ dueFrom, dueTo }: ListTasksOptions = {}) {
  const params = new URLSearchParams()
  if (dueFrom) params.set("due_from", toLocalDateKey(dueFrom))
  if (dueTo) params.set("due_to", toLocalDateKey(dueTo))
  const query = params.toString()
  return fetchJson<Task[]>(query ? `/tasks?${query}` : "/tasks")
}

export function createTask(input: TaskCreateInput) {
  return fetchJson<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateTask(taskId: number, input: Partial<TaskCreateInput> & { status?: TaskStatus }) {
  return fetchJson<Task>(`/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteTask(taskId: number) {
  return fetchVoid(`/tasks/${taskId}`, { method: "DELETE" })
}

export function listHabits() {
  return fetchJson<Habit[]>("/habits")
}

export function createHabit(input: HabitCreateInput) {
  return fetchJson<Habit>("/habits", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateHabit(habitId: number, input: HabitUpdateInput) {
  return fetchJson<Habit>(`/habits/${habitId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteHabit(habitId: number) {
  return fetchVoid(`/habits/${habitId}`, { method: "DELETE" })
}

export function completeHabit(habitId: number, completedOn?: Date) {
  return fetchJson<HabitCompletion>(`/habits/${habitId}/completions`, {
    method: "POST",
    body: JSON.stringify({ completed_on: toLocalDateKey(completedOn) }),
  })
}

export function listHabitCompletions(startAt?: Date, endAt?: Date) {
  const params = new URLSearchParams()
  if (startAt) params.set("start_at", startAt.toISOString())
  if (endAt) params.set("end_at", endAt.toISOString())

  const query = params.toString()
  return fetchJson<HabitCompletion[]>(
    query ? `/habits/completions?${query}` : "/habits/completions",
  )
}

export function listLifeBlocks({ startFrom, endTo }: ListLifeBlocksOptions = {}) {
  const params = new URLSearchParams()
  if (startFrom) params.set("start_from", startFrom.toISOString())
  if (endTo) params.set("end_to", endTo.toISOString())
  const query = params.toString()
  return fetchJson<LifeBlock[]>(query ? `/availability-blocks?${query}` : "/availability-blocks")
}

export function createLifeBlock(input: LifeBlockCreateInput) {
  return fetchJson<LifeBlock>("/availability-blocks", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateLifeBlock(id: number, input: LifeBlockUpdateInput) {
  return fetchJson<LifeBlock>(`/availability-blocks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteLifeBlock(id: number) {
  return fetchVoid(`/availability-blocks/${id}`, { method: "DELETE" })
}

function toLocalIsoWithOffset(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  const offsetMinutes = -date.getTimezoneOffset()
  const offsetSign = offsetMinutes >= 0 ? "+" : "-"
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = Math.floor(absoluteOffset / 60)
  const offsetMins = absoluteOffset % 60

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `${offsetSign}${pad(offsetHours)}:${pad(offsetMins)}`,
  ].join("")
}

function planRequestBody(input: PlanRequestInput) {
  return JSON.stringify({
    user_id: input.user_id ?? 1,
    start_at: toLocalIsoWithOffset(input.start_at),
    end_at: toLocalIsoWithOffset(input.end_at),
    day_start: input.day_start ?? "08:00",
    day_end: input.day_end ?? "22:00",
  })
}

export function generateWeekPlan(input: PlanRequestInput) {
  return fetchJson<PlanRead>("/plans/week", {
    method: "POST",
    body: planRequestBody(input),
  })
}

export function generateDayPlan(input: PlanRequestInput) {
  return fetchJson<PlanRead>("/plans/day", {
    method: "POST",
    body: planRequestBody(input),
  })
}

export function savePlan(plan: PlanRead) {
  return fetchJson<SavedPlan>("/plans/save", {
    method: "POST",
    body: JSON.stringify({ user_id: 1, plan }),
  })
}

export function saveWeekPlan(plan: PlanRead) {
  return savePlan(plan)
}

export function saveDayPlan(plan: PlanRead) {
  return savePlan(plan)
}

export function listSavedPlans({ scope, startFrom, endTo }: ListSavedPlansOptions = {}) {
  const params = new URLSearchParams()
  if (scope) params.set("scope", scope)
  if (startFrom) params.set("start_from", startFrom.toISOString())
  if (endTo) params.set("end_to", endTo.toISOString())
  const query = params.toString()
  return fetchJson<SavedPlan[]>(query ? `/plans/saved?${query}` : "/plans/saved")
}

export function getSavedPlan(planId: number) {
  return fetchJson<SavedPlan>(`/plans/saved/${planId}`)
}

export function updateSavedPlanItem(itemId: number, input: SavedPlanItemUpdateInput) {
  return fetchJson<SavedPlanItem>(`/plans/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

function apiPath(path: string) {
  return `${API_BASE_URL}${path}`
}

export function googleCalendarConnectUrl() {
  return apiPath("/integrations/google-calendar/connect")
}

export function getGoogleCalendarStatus() {
  return fetchJson<CalendarStatus>("/integrations/google-calendar/status")
}

export function syncGoogleCalendar(startAt?: Date, endAt?: Date) {
  return fetchJson<CalendarSyncResult>("/integrations/google-calendar/sync", {
    method: "POST",
    body: JSON.stringify({
      user_id: 1,
      start_at: startAt?.toISOString(),
      end_at: endAt?.toISOString(),
    }),
  })
}

export function listGoogleCalendarEvents(startFrom?: Date, endTo?: Date) {
  const params = new URLSearchParams()
  if (startFrom) params.set("start_from", startFrom.toISOString())
  if (endTo) params.set("end_to", endTo.toISOString())
  const query = params.toString()
  return fetchJson<CalendarEvent[]>(
    query ? `/integrations/google-calendar/events?${query}` : "/integrations/google-calendar/events",
  )
}

export function exportSavedPlanToGoogleCalendar(savedPlanId: number) {
  return fetchJson<CalendarExportResult>(
    `/integrations/google-calendar/export-plan/${savedPlanId}`,
    { method: "POST" },
  )
}

export function gmailConnectUrl() {
  return apiPath("/integrations/gmail/connect")
}

export function getGmailStatus() {
  return fetchJson<GmailStatus>("/integrations/gmail/status")
}

export function syncGmail() {
  return fetchJson<GmailSyncResult>("/integrations/gmail/sync", {
    method: "POST",
    body: JSON.stringify({ user_id: 1 }),
  })
}

export function disconnectGmail() {
  return fetchVoid("/integrations/gmail/disconnect", { method: "DELETE" })
}

export function listExtractedCandidates({ status }: ListExtractedCandidatesOptions = {}) {
  const params = new URLSearchParams()
  if (status) params.set("status", status)
  const query = params.toString()
  return fetchJson<ExtractedTaskCandidate[]>(
    query ? `/integrations/gmail/candidates?${query}` : "/integrations/gmail/candidates",
  )
}

export function acceptExtractedCandidate(
  candidateId: number,
  input: ExtractedTaskCandidateAcceptInput = {},
) {
  return fetchJson<Task>(`/integrations/gmail/candidates/${candidateId}/accept`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function rejectExtractedCandidate(candidateId: number, reason?: string) {
  return fetchJson<ExtractedTaskCandidate>(`/integrations/gmail/candidates/${candidateId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
}

export function getNotificationPreferences() {
  return fetchJson<NotificationPreference[]>("/notifications/preferences")
}

export function updateNotificationPreference(
  channel: NotificationChannel,
  input: NotificationPreferenceUpdateInput,
) {
  return fetchJson<NotificationPreference>(`/notifications/preferences/${channel}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function listScheduledNotifications({
  startFrom,
  endTo,
  status,
}: ListScheduledNotificationsOptions = {}) {
  const params = new URLSearchParams()
  if (startFrom) params.set("start_from", startFrom.toISOString())
  if (endTo) params.set("end_to", endTo.toISOString())
  if (status) params.set("status", status)
  const query = params.toString()
  return fetchJson<ScheduledNotification[]>(
    query ? `/notifications/scheduled?${query}` : "/notifications/scheduled",
  )
}

export function runDispatchNotifications(now?: Date) {
  const params = new URLSearchParams()
  if (now) params.set("now", now.toISOString())
  const query = params.toString()
  return fetchJson<NotificationDispatchResult>(
    query ? `/notifications/run-dispatch?${query}` : "/notifications/run-dispatch",
    { method: "POST" },
  )
}

export function listWebPushSubscriptions() {
  return fetchJson<WebPushSubscriptionRead[]>("/notifications/web-push/subscriptions")
}

export async function getWebPushPublicKey() {
  const result = await fetchJson<{ public_key: string | null }>("/notifications/web-push/public-key")
  return result.public_key
}

export function subscribeToWebPush(subscription: PushSubscription | PushSubscriptionJSON) {
  const json = "toJSON" in subscription ? subscription.toJSON() : subscription
  return fetchJson<WebPushSubscriptionRead>("/notifications/web-push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      user_id: 1,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    }),
  })
}

export function unsubscribeFromWebPush(subscriptionId: number) {
  return fetchVoid(`/notifications/web-push/${subscriptionId}`, { method: "DELETE" })
}
