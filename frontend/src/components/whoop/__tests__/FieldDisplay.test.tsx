import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DerivedMetricDisplay, VerifiedFieldDisplay } from "../FieldDisplay"
import type { WhoopDerivedMetric, WhoopVerifiedField } from "../../../lib/whoopBleApi"

describe("VerifiedFieldDisplay", () => {
  it("labels verified heart rate with source metadata", () => {
    const field: WhoopVerifiedField<number> = {
      confidence: "verified",
      value: 72,
      source: "ble_characteristic_0x2A37",
      observed_at: "2026-06-25T12:00:00.000Z",
    }

    render(<VerifiedFieldDisplay label="heart_rate_bpm" field={field} />)

    expect(screen.getByText("Verified")).toBeInTheDocument()
    expect(screen.getByText("72")).toBeInTheDocument()
    expect(screen.getByText(/ble_characteristic_0x2A37/)).toBeInTheDocument()
  })

  it("shows undecoded fields without pretending a value", () => {
    render(
      <VerifiedFieldDisplay
        label="rr_intervals_ms"
        field={{
          confidence: "undecoded",
          reason: "Packet layout not yet mapped for this generation",
          raw_hint: "a1b2c3",
        }}
      />,
    )

    expect(screen.getByTestId("field-badge-undecoded")).toBeInTheDocument()
    expect(screen.getByText(/Packet layout not yet mapped/)).toBeInTheDocument()
    expect(screen.queryByTestId("field-badge-verified")).not.toBeInTheDocument()
  })
})

describe("DerivedMetricDisplay", () => {
  it("shows local approximation disclaimer", () => {
    const metric: WhoopDerivedMetric = {
      value: 42.5,
      label: "HRV RMSSD",
      disclaimer: "Locally derived approximation — not a verified WHOOP metric.",
      computed_at: "2026-06-25T12:00:00.000Z",
    }

    render(<DerivedMetricDisplay metric={metric} />)

    expect(screen.getByText("Local approximation")).toBeInTheDocument()
    expect(screen.getByText(/not a verified WHOOP metric/)).toBeInTheDocument()
    expect(screen.getByText("42.5")).toBeInTheDocument()
  })
})
