import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'keeptrack-theme'
const VALID_THEMES = ['light', 'dark', 'system']

function readStoredTheme() {
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
  return VALID_THEMES.includes(stored) ? stored : 'system'
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Applies the resolved theme to <html data-theme>. 'system' removes the
// attribute entirely so theme.css's prefers-color-scheme media query is
// what actually decides — see theme.css for why that's safe.
function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // Only matters while theme === 'system' (for the toggle's own icon/label —
  // the actual CSS repaints itself via the media query with no JS needed),
  // but it's cheap to keep the listener live all the time.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => setSystemDark(e.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  const setTheme = useCallback((next) => {
    if (!VALID_THEMES.includes(next)) return
    setThemeState(next)
  }, [])

  // Cycles light -> dark -> system -> light ...
  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const order = ['light', 'dark', 'system']
      return order[(order.indexOf(current) + 1) % order.length]
    })
  }, [])

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, cycleTheme }),
    [theme, resolvedTheme, setTheme, cycleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// Returns { theme, resolvedTheme, setTheme, cycleTheme }.
// theme: 'light' | 'dark' | 'system' (the user's stored preference)
// resolvedTheme: 'light' | 'dark' (theme with 'system' resolved against the OS)
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
