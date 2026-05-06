export type AppTheme = "light" | "dark"

export const THEME_STORAGE_KEY = "weekwise-theme"

export function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "light"
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"
}

export function applyTheme(theme: AppTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}
