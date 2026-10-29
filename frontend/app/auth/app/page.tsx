'use client'

import { useEffect, useState } from 'react'

// Mobil ilova uchun Telegram orqali kirish ko'prigi (2026-10-29).
// Ilova oauth.telegram.org'ni return_to=https://gapirai.uz/auth/app bilan ochadi (bot domeni
// gapirai.uz, shuning uchun qaytish shu yerga). Telegram imzolangan ma'lumotni
// #tgAuthResult=<base64 JSON> (yoki ?id=...&hash=...) ko'rinishida beradi -- biz uni
// o'zgartirmasdan gapirai://auth/telegram ga uzatamiz, ilova /auth/telegram'ga yuborib
// imzoni backendda tekshiradi. Bu sahifada token ham, sessiya ham yo'q.

const FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'] as const
const APP_PACKAGE = 'uz.gapirai.mobile'

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

export default function AppAuthBridge() {
  const [link, setLink] = useState<{ scheme: string; intent: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const data = readTelegramResult()
    if (!data) {
      setFailed(true)
      return
    }
    const qs = new URLSearchParams(data).toString()
    const scheme = `gapirai://auth/telegram?${qs}`
    // Android Chrome intent:// ni ishonchliroq ochadi; ilova yo'q bo'lsa hech narsa buzilmaydi
    const intent = `intent://auth/telegram?${qs}#Intent;scheme=gapirai;package=${APP_PACKAGE};end`
    setLink({ scheme, intent })
    window.location.replace(/android/i.test(navigator.userAgent) ? intent : scheme)
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-ui-ground px-4 text-ui-ink">
      <div className="ui-card w-full max-w-[400px] p-6 text-center sm:p-8">
        <img src="/logo.webp" alt="GapirAI.uz" width={120} height={32} className="mx-auto h-8 w-auto dark:hidden" />
        <img src="/logodark.webp" alt="GapirAI.uz" width={120} height={32} className="mx-auto hidden h-8 w-auto dark:block" />
        {failed ? (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-[-0.02em]">Telegram maʼlumoti kelmadi</h1>
            <p className="mt-2 text-[15px] text-ui-muted">Ilovaga qayting va «Telegram orqali kirish» tugmasini qayta bosing.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-[-0.02em]">GapirAI ilovasiga qaytilmoqda</h1>
            <p className="mt-2 text-[15px] text-ui-muted">Ilova oʻzi ochilmasa, tugmani bosing.</p>
            {link && (
              <a href={link.intent} className="ui-btn ui-btn-primary mt-6 w-full">
                Ilovaga qaytish
              </a>
            )}
          </>
        )}
      </div>
    </main>
  )
}
