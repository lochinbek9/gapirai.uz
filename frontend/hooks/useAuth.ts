'use client'
import { useState, useEffect, useCallback } from 'react'
import { User, getToken, setToken, setStoredUser, getStoredUser, clearAuth, apiLogin, apiRegister, apiMe } from '@/lib/auth'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (token) {
      const stored = getStoredUser()
      if (stored) {
        setUser(stored)
        setLoading(false)
      } else {
        apiMe(token)
          .then((u) => { setUser(u); setStoredUser(u) })
          .catch(() => clearAuth())
          .finally(() => setLoading(false))
      }
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password)
    setToken(data.access_token)
    setStoredUser(data.user)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await apiRegister(name, email, password)
    setToken(data.access_token)
    setStoredUser(data.user)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setUser(null)
  }, [])

  return { user, loading, login, register, logout, isLoggedIn: !!user }
}
