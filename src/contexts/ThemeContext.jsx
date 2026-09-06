import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  // Read the legacy key so existing visitors retain their theme preference.
  const [theme, setTheme] = useState(() => localStorage.getItem('cedt-theme') || localStorage.getItem('vise-theme') || 'system')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', isDark)
      document.documentElement.dataset.theme = theme
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    localStorage.setItem('cedt-theme', theme)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
