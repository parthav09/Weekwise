import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConnectionStatusCard } from "../ConnectionStatusCard"
import type { WhoopBleStatus } from "../../../lib/whoopBleApi"

const baseStatus: WhoopBleStatus = {
  connection_state: "connected",
  device_generation: "gen4",
  sync_status: "success",
  last_sync_at: "2026-06-25T12:00:00.000Z",
  last_error: null,
  device_name: "WHOOP 4.0",
  device_address: "AA:BB:CC:DD:EE:FF",
}

describe("ConnectionStatusCard", () => {
  it("shows connected and synced badges", () => {
    render(<ConnectionStatusCard status={baseStatus} />)

    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(screen.getByText("Synced")).toBeInTheDocument()
    expect(screen.getByText("GEN4")).toBeInTheDocument()
    expect(screen.getByText(/WHOOP 4.0/)).toBeInTheDocument()
  })

  it("shows sync failure with recovery suggestions", () => {
    const status: WhoopBleStatus = {
      ...baseStatus,
      sync_status: "failed",
      connection_state: "error",
      last_error: {
        code: "SYNC_TIMEOUT",
        message: "Historical sync timed out",
        recovery_suggestions: [
          "Keep the strap within 1 meter of the adapter",
          "Retry sync from the BLE service",
        ],
      },
    }

    render(<ConnectionStatusCard status={status} />)

    expect(screen.getByText("Connection error")).toBeInTheDocument()
    expect(screen.getByText("Sync failed")).toBeInTheDocument()
    expect(screen.getByText("Historical sync timed out")).toBeInTheDocument()
    expect(screen.getByText("Keep the strap within 1 meter of the adapter")).toBeInTheDocument()
  })
})
