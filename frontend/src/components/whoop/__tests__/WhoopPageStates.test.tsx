import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WhoopPageStates } from "../WhoopPageStates"

describe("WhoopPageStates", () => {
  it("renders loading state", () => {
    render(
      <WhoopPageStates loading>
        <p>content</p>
      </WhoopPageStates>,
    )

    expect(screen.getByText("Loading WHOOP BLE data…")).toBeInTheDocument()
    expect(screen.queryByText("content")).not.toBeInTheDocument()
  })

  it("renders error state with backend hint", () => {
    render(
      <WhoopPageStates error="HTTP 404">
        <p>content</p>
      </WhoopPageStates>,
    )

    expect(screen.getByText("Could not load data")).toBeInTheDocument()
    expect(screen.getByText("HTTP 404")).toBeInTheDocument()
    expect(screen.getByText(/integrations\/whoop-ble/)).toBeInTheDocument()
  })

  it("renders empty state", () => {
    render(
      <WhoopPageStates empty emptyTitle="No live streams">
        <p>content</p>
      </WhoopPageStates>,
    )

    expect(screen.getByText("No live streams")).toBeInTheDocument()
    expect(screen.queryByText("content")).not.toBeInTheDocument()
  })

  it("renders children when ready", () => {
    render(
      <WhoopPageStates>
        <p>Live data ready</p>
      </WhoopPageStates>,
    )

    expect(screen.getByText("Live data ready")).toBeInTheDocument()
  })
})
