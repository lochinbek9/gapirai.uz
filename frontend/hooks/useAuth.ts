'use client'
import { useState, useEffect, useCallback } from 'react'
import { User, getToken, setToken, setStoredUser, getStoredUser, clearAuth, apiLogin, apiRegister, apiMe, apiVerifyCode, apiResendCode, apiForgotPassword, apiResetPassword, apiGoogleAuth, apiTelegramAuth, apiRequestPhoneCode, apiVerifyPhoneCode, type TelegramLoginData } from '@/lib/auth'

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
    if (data.access_token) {
      setToken(data.access_token)
      setStoredUser(data.user)
      setUser(data.user)
    }
    return data
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

  const forgotPassword = useCallback(async (email: string) => {
    return apiForgotPassword(email)
  }, [])

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    const data = await apiResetPassword(email, code, newPassword)
    setToken(data.access_token)
    setStoredUser(data.user)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setUser(null)
  }, [])

  // Google va telefon kirishi bir bosqichli — email kodidan farqli, token
  // darhol qaytadi.
  const googleAuth = useCallback(async (credential: string) => {
    const data = await apiGoogleAuth(credential)
    setToken(data.access_token)
    setStoredUser(data.user)
    setUser(data.user)
    return data.user
  }, [])

  const telegramAuth = useCallback(async (payload: TelegramLoginData) => {
    const data = await apiTelegramAuth(payload)
    setToken(data.access_token)
    setStoredUser(data.user)
    setUser(data.user)
    return data.user
  }, [])

  const requestPhoneCode = useCallback(async (phone: string) => {
    return apiRequestPhoneCode(phone)
  }, [])

  const verifyPhoneCode = useCallback(async (phone: string, code: string) => {
    const data = await apiVerifyPhoneCode(phone, code)
    setToken(data.access_token)
    setStoredUser(data.user)
    setUser(data.user)
    return data.user
  }, [])

  return {
    user, loading, login, register, verifyCode, resendCode, forgotPassword, resetPassword, logout,
    googleAuth, telegramAuth, requestPhoneCode, verifyPhoneCode,
    isLoggedIn: !!user,
  }
}
