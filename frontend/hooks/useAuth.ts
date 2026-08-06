'use client'
import { useState, useEffect, useCallback } from 'react'
import { User, getToken, setToken, setStoredUser, getStoredUser, clearAuth, apiLogin, apiRegister, apiMe, apiVerifyCode, apiResendCode } from '@/lib/auth'

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

  // login/register endi to'g'ridan-to'g'ri token bermaydi — email'ga
  // tasdiqlash kodi yuboriladi, kirish faqat verifyCode orqali yakunlanadi.
  const login = useCallback(async (email: string, password: string) => {
    return apiLogin(email, password)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    return apiRegister(name, email, password)
  }, [])

  const verifyCode = useCallback(async (email: string, code: string) => {
    const data = await apiVerifyCode(email, code)
    setToken(data.access_token)
    setStoredUser(data.user)
    setUser(data.user)
    return data.user
  }, [])

  const resendCode = useCallback(async (email: string) => {
    return apiResendCode(email)
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setUser(null)
  }, [])

  return { user, loading, login, register, verifyCode, resendCode, logout, isLoggedIn: !!user }
}
