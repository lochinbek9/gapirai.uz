'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'
import { Loader2 } from 'lucide-react'
import { apiTelegramConfig, type TelegramLoginData } from '@/lib/auth'

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (options: { bot_id: number; request_access?: 'write'; lang?: string }, cb: (data: TelegramLoginData | false) => void) => void
      }
    }
  }
}

interface TelegramSignInButtonProps {
  onAuth: (data: TelegramLoginData) => void
  text?: 'continue_with' | 'signup_with'
}

// Telegram Login Widget'ning JS API'si (Telegram.Login.auth) -- o'z tugmamiz bilan:
// bosilganda Telegram oynasi ochiladi, foydalanuvchi o'z Telegram'ida tasdiqlaydi,
// imzolangan ma'lumot onAuth'ga keladi (backend /auth/telegram tekshiradi).
// Bot domeni BotFather'da (/setdomain) gapirai.uz bo'lishi shart.
export default function TelegramSignInButton({ onAuth, text = 'continue_with' }: TelegramSignInButtonProps) {
  const [botId, setBotId] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    apiTelegramConfig()
      .then((cfg) => { if (cfg.enabled && cfg.bot_id) setBotId(cfg.bot_id) })
      .catch(() => {})
    if (window.Telegram?.Login) setReady(true)
  }, [])

  if (!botId) return null

  const click = () => {
    if (!window.Telegram?.Login) return
    setCancelled(false)
    // Popup bloklanmasligi uchun -- to'g'ridan-to'g'ri bosish hodisasi ichida
    window.Telegram.Login.auth({ bot_id: botId, request_access: 'write' }, (data) => {
      if (data) onAuth(data)
      else setCancelled(true)
    })
  }

  return (
    <div className="w-full">
      <Script src="https://telegram.org/js/telegram-widget.js?22" strategy="afterInteractive" onLoad={() => setReady(true)} />
      <button
        type="button"
        onClick={click}
        disabled={!ready}
        className="mx-auto flex min-h-[44px] w-full max-w-[400px] items-center justify-center gap-2.5 rounded-full border border-ui-rule bg-ui-surface px-4 text-sm font-medium text-ui-ink transition hover:bg-ui-ground disabled:opacity-60"
      >
        {ready ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
            <circle cx="12" cy="12" r="12" fill="#2AABEE" />
            <path fill="#fff" d="M5.43 11.87c3.5-1.52 5.83-2.53 7-3.02 3.33-1.39 4.03-1.63 4.48-1.64.1 0 .32.02.47.14.12.1.15.23.17.33.02.1.04.31.02.48-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.83 1.23-.7.07-1.24-.46-1.92-.91-1.07-.7-1.67-1.14-2.71-1.82-1.2-.79-.42-1.23.26-1.94.18-.19 3.3-3.02 3.36-3.28.01-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.1.02-1.79 1.14-5.06 3.35-.48.33-.91.49-1.3.48-.43-.01-1.25-.24-1.86-.44-.75-.24-1.35-.37-1.3-.79.03-.22.32-.44.89-.67Z" />
          </svg>
        ) : (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        )}
        {text === 'signup_with' ? 'Telegram orqali roʻyxatdan oʻtish' : 'Telegram orqali kirish'}
      </button>
      {cancelled && <p className="mt-2 text-center text-xs text-ui-muted">Telegram oynasi yopildi. Qaytadan urinib koʻring.</p>}
    </div>
  )
}
