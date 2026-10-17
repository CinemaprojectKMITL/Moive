import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, setApiUser } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const data = await apiGet('/auth/me')
      setApiUser(data.user)
      setUser(data.user)
    } catch (error) {
      if (error.status !== 401) console.error(error)
      setApiUser(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    refresh()
    const clear = () => { setApiUser(null); setUser(null) }
    window.addEventListener('auth:unauthorized', clear)
    return () => window.removeEventListener('auth:unauthorized', clear)
  }, [refresh])
  const login = async (credentials) => { const data = await apiPost('/auth/login', credentials); setApiUser(data.user); setUser(data.user); return data.user }
  const register = async (details) => { const data = await apiPost('/auth/register', details); setApiUser(data.user); setUser(data.user); return data.user }
  const logout = async () => { await apiPost('/auth/logout'); setApiUser(null); setUser(null) }
  const value = useMemo(() => ({ user, loading, login, register, logout, refresh, isAdmin: user?.role === 'admin' }), [user, loading, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
