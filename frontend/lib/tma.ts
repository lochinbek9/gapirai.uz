'use client'

import { apiClient } from './api'
import { setToken, setStoredUser } from './auth'
import { getApiUrl } from './runtime-config'

// Telegram WebApp SDK'ning bizga kerakli qismi (to'liq typing shart emas).
export interface TelegramWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  isExpanded: boolean
  ready: () => void
  expand: () => void
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void
  MainButton: {
    setText: (t: string) => void
    show: () => void
    hide: () => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
    showProgress: (leaveActive?: boolean) => void
    hideProgress: () => void
  }
  HapticFeedback?: { impactOccurred: (s: string) => void; notificationOccurred: (t: string) => void }
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null
}

/** SDK skripti afterInteractive yuklanadi -- shu sabab window.Telegram
 *  bir zumda mavjud bo'lmasligi mumkin. Qisqa poll bilan kutamiz. */
export async function waitForWebApp(timeoutMs = 5000): Promise<TelegramWebApp | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const wa = getWebApp()
    if (wa && wa.initData) return wa
    await new Promise((r) => setTimeout(r, 120))
  }
  return getWebApp()
}

export interface TmaUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  has_phone: boolean
}

/** initData'ni backendda tekshirtirib, tizim JWT'sini oladi va uni
 *  mavjud auth qatlamiga (cookie + apiClient default header) o'rnatadi --
 *  shundan keyin lib/api.ts'dagi hamma narsa o'zgarishsiz ishlaydi. */
export async function authenticateTma(initData: string): Promise<TmaUser> {
  const res = await fetch(`${getApiUrl()}/api/tma/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: initData }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.detail || `Auth xatosi (${res.status})`)

  const token: string = body.token
  const user: TmaUser = body.user
  try {
    setToken(token)
  } catch {
    /* webview cookie'ni rad etsa ham -- pastdagi default header yetadi */
  }
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
  setStoredUser({ id: user.id, name: user.name, email: user.email })
  return user
}

/** Telegram temasini <html> ga qo'llaydi (darkMode: "class"). */
export function applyTelegramTheme(wa: TelegramWebApp) {
  const root = document.documentElement
  root.classList.toggle('dark', wa.colorScheme === 'dark')
  const bg = wa.themeParams?.bg_color
  if (bg) root.style.backgroundColor = bg
}
