'use client'

import { useEffect, useState } from 'react'

// Mobil ilova uchun Telegram orqali kirish ko'prigi (2026-10-29).
// Ilova Custom Tab'da shu sahifani ?start=telegram&bot_id=... bilan ochadi; sahifa
// oauth.telegram.org'ga o'tadi (return_to=https://gapirai.uz/auth/app -- bot domeni
// gapirai.uz, shuning uchun qaytish shu yerga). Telegram imzolangan ma'lumotni
// #tgAuthResult=<base64 JSON> (yoki ?id=...&hash=...) ko'rinishida beradi -- biz uni
// o'zgartirmasdan gapirai://auth/telegram ga uzatamiz, ilova /auth/telegram'ga yuborib
// imzoni backendda tekshiradi. Bu sahifada token ham, sessiya ham yo'q.
//
// Nega ilova oauth.telegram.org'ni to'g'ridan-to'g'ri ochmaydi: tab tarixi bo'sh bo'lsa
// (history.length == 1) Telegram tasdiqdan keyin return_to'ga qaytarmay, window.close()
// qiladi -- ma'lumot yo'qoladi (emulyatorda tasdiqlangan). Shuning uchun avval shu sahifa,
// keyin oauth -- tarixda yozuv qoladi. Yuklanish paytidagi skript yo'naltirishini Chrome
// tarixga yozmaydi (replace qiladi), shuning uchun load'dan keyin kechiktirib o'tiladi.

const FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'] as const
const APP_PACKAGE = 'uz.gapirai.mobile'
const START_DELAY_MS = 1500

function readTelegramResult(): Record<string, string> | null {
  const raw: Record<string, unknown> = {}
  const hash = window.location.hash.slice(1)
  const fromHash = new URLSearchParams(hash).get('tgAuthResult')
  if (fromHash) {
    try {
      const b64 = fromHash.replace(/-/g, '+').replace(/_/g, '/')
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      Object.assign(raw, JSON.parse(new TextDecoder().decode(bytes)))
    } catch {
      return null
    }
  } else {
    new URLSearchParams(window.location.search).forEach((v, k) => { raw[k] = v })
  }
  const out: Record<string, string> = {}
  for (const k of FIELDS) {
    const v = raw[k]
    if (v !== undefined && v !== null && v !== '') out[k] = String(v)
  }
  return out.id && out.hash && out.auth_date ? out : null
}

/** ?start=telegram&bot_id=123 -> oauth.telegram.org URL (origin va return_to faqat shu sayt) */
function readStartUrl(): string | null {
  const q = new URLSearchParams(window.location.search)
  const botId = q.get('bot_id') ?? ''
  if (q.get('start') !== 'telegram' || !/^\d{1,20}$/.test(botId)) return null
  const origin = window.location.origin
  return (
    `https://oauth.telegram.org/auth?bot_id=${botId}` +
    `&origin=${encodeURIComponent(origin)}&request_access=write` +
    `&return_to=${encodeURIComponent(`${origin}/auth/app`)}`
  )
}

type State =
  | { kind: 'start'; url: string }
  | { kind: 'return'; scheme: string; intent: string }
  | { kind: 'failed' }

export default function AppAuthBridge() {
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    const data = readTelegramResult()
    if (data) {
      const qs = new URLSearchParams(data).toString()
      const scheme = `gapirai://auth/telegram?${qs}`
      // Android Chrome intent:// ni ishonchliroq ochadi; ilova yo'q bo'lsa hech narsa buzilmaydi
      const intent = `intent://auth/telegram?${qs}#Intent;scheme=gapirai;package=${APP_PACKAGE};end`
      setState({ kind: 'return', scheme, intent })
      window.location.replace(/android/i.test(navigator.userAgent) ? intent : scheme)
      return
    }

    const url = readStartUrl()
    if (!url) {
      setState({ kind: 'failed' })
      return
    }
    setState({ kind: 'start', url })
    let timer: ReturnType<typeof setTimeout> | undefined
    const go = () => { timer = setTimeout(() => window.location.assign(url), START_DELAY_MS) }
    if (document.readyState === 'complete') go()
    else window.addEventListener('load', go, { once: true })
    return () => {
      window.removeEventListener('load', go)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-ui-ground px-4 text-ui-ink">
      <div className="ui-card w-full max-w-[400px] p-6 text-center sm:p-8">
        <img src="/logo.webp" alt="GapirAI.uz" width={120} height={32} className="mx-auto h-8 w-auto dark:hidden" />
        <img src="/logodark.webp" alt="GapirAI.uz" width={120} height={32} className="mx-auto hidden h-8 w-auto dark:block" />
        {state?.kind === 'failed' && (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-[-0.02em]">Telegram maʼlumoti kelmadi</h1>
            <p className="mt-2 text-[15px] text-ui-muted">Ilovaga qayting va «Telegram orqali kirish» tugmasini qayta bosing.</p>
          </>
        )}
        {state?.kind === 'start' && (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-[-0.02em]">Telegram sahifasi ochilmoqda</h1>
            <p className="mt-2 text-[15px] text-ui-muted">
              Telefon raqamingizni kiriting va Telegramʼda kirishni tasdiqlang. Tasdiqlagach shu oynaga qayting — ilova oʻzi ochiladi.
            </p>
            <a href={state.url} className="ui-btn ui-btn-primary mt-6 w-full">
              Davom etish
            </a>
          </>
        )}
        {state?.kind === 'return' && (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-[-0.02em]">GapirAI ilovasiga qaytilmoqda</h1>
            <p className="mt-2 text-[15px] text-ui-muted">Ilova oʻzi ochilmasa, tugmani bosing.</p>
            <a href={state.intent} className="ui-btn ui-btn-primary mt-6 w-full">
              Ilovaga qaytish
            </a>
          </>
        )}
      </div>
    </main>
  )
}
