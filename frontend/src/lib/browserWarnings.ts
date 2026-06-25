export function warningMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message.trim() ? err.message : fallback
}

let lastWarning: { message: string; shownAt: number } | null = null

export function showBrowserWarning(message: string) {
  const now = Date.now()
  if (lastWarning?.message === message && now - lastWarning.shownAt < 2_000) {
    return
  }
  lastWarning = { message, shownAt: now }

  if (typeof window !== "undefined") {
    window.alert(message)
    return
  }

  console.warn(message)
}

export function warnError(err: unknown, fallback: string) {
  showBrowserWarning(warningMessage(err, fallback))
}
