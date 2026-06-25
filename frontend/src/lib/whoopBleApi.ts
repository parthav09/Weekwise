// WHOOP BLE REST client — consumes backend-decoded data only. No packet decoding here.

export type WhoopConnectionState = "disconnected" | "connecting" | "connected" | "error"
export type WhoopDeviceGeneration = "gen3" | "gen4" | "gen5" | "unknown"
export type WhoopSyncStatus = "idle" | "syncing" | "success" | "failed"
export type WhoopFieldConfidence = "verified" | "unknown" | "undecoded"

export interface WhoopBleError {
  code: string
  message: string
  recovery_suggestions: string[]
}

export interface WhoopBleStatus {
  connection_state: WhoopConnectionState
  device_generation: WhoopDeviceGeneration | null
  sync_status: WhoopSyncStatus
  last_sync_at: string | null
  last_error: WhoopBleError | null
  device_name: string | null
  device_address: string | null
}

export interface WhoopVerifiedField<T> {
  confidence: "verified"
  value: T
  source: string
  observed_at: string
}

export interface WhoopUnknownField {
  confidence: "unknown" | "undecoded"
  reason: string | null
  raw_hint: string | null
}

export type WhoopField<T> = WhoopVerifiedField<T> | WhoopUnknownField

export interface WhoopDerivedMetric<T = number> {
  value: T
  label: string
  disclaimer: string
  computed_at: string
}

export interface WhoopLiveStreams {
  heart_rate_bpm: WhoopField<number> | null
  rr_intervals_ms: WhoopField<number[]> | null
  [streamKey: string]: WhoopField<unknown> | null | undefined
}

export interface WhoopLiveSnapshot {
  updated_at: string
  streams: WhoopLiveStreams
  derived_metrics: Record<string, WhoopDerivedMetric>
}

export interface WhoopHistoricalRecord {
  id: string
  recorded_at: string
  record_type: string
  verified_fields: Record<string, WhoopVerifiedField<unknown>>
  unknown_fields: Record<string, WhoopUnknownField>
  derived_metrics: Record<string, WhoopDerivedMetric>
}

export interface WhoopHistoricalResponse {
  start: string
  end: string
  records: WhoopHistoricalRecord[]
}

export type WhoopDiagnosticLevel = "info" | "warning" | "error"

export interface WhoopDiagnosticEvent {
  id: string
  occurred_at: string
  level: WhoopDiagnosticLevel
  category: string
  message: string
  details: Record<string, unknown> | null
}

export interface WhoopDiagnosticsResponse {
  events: WhoopDiagnosticEvent[]
}

export interface WhoopRawRecord {
  id: string
  captured_at: string
  direction: "rx" | "tx"
  characteristic_uuid: string | null
  payload_hex: string
  payload_length: number
  decode_status: "verified" | "partial" | "undecoded"
  notes: string | null
}

export interface WhoopRawRecordsResponse {
  total: number
  limit: number
  offset: number
  records: WhoopRawRecord[]
}

export interface WhoopHistoryQuery {
  start: Date
  end: Date
}

export interface WhoopRawRecordsQuery {
  limit?: number
  offset?: number
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "")
const WHOOP_BLE_PREFIX = "/integrations/whoop-ble"

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

export function getWhoopBleStatus() {
  return fetchJson<WhoopBleStatus>(`${WHOOP_BLE_PREFIX}/status`)
}

export function getWhoopBleLive() {
  return fetchJson<WhoopLiveSnapshot>(`${WHOOP_BLE_PREFIX}/live`)
}

export function getWhoopBleHistory({ start, end }: WhoopHistoryQuery) {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  })
  return fetchJson<WhoopHistoricalResponse>(`${WHOOP_BLE_PREFIX}/history?${params}`)
}

export function getWhoopBleDiagnostics() {
  return fetchJson<WhoopDiagnosticsResponse>(`${WHOOP_BLE_PREFIX}/diagnostics`)
}

export function getWhoopBleRawRecords({ limit = 50, offset = 0 }: WhoopRawRecordsQuery = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  return fetchJson<WhoopRawRecordsResponse>(`${WHOOP_BLE_PREFIX}/raw-records?${params}`)
}

export function isVerifiedField<T>(field: WhoopField<T>): field is WhoopVerifiedField<T> {
  return field.confidence === "verified"
}

export function isUnknownField(field: WhoopField<unknown>): field is WhoopUnknownField {
  return field.confidence === "unknown" || field.confidence === "undecoded"
}

export function formatWhoopTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function connectionStateLabel(state: WhoopConnectionState) {
  switch (state) {
    case "connected":
      return "Connected"
    case "connecting":
      return "Connecting"
    case "disconnected":
      return "Disconnected"
    case "error":
      return "Connection error"
  }
}

export function syncStatusLabel(status: WhoopSyncStatus) {
  switch (status) {
    case "idle":
      return "Idle"
    case "syncing":
      return "Syncing"
    case "success":
      return "Synced"
    case "failed":
      return "Sync failed"
  }
}

export function deviceGenerationLabel(generation: WhoopDeviceGeneration | null) {
  if (!generation) return "Unknown"
  if (generation === "unknown") return "Unidentified generation"
  return generation.toUpperCase()
}
