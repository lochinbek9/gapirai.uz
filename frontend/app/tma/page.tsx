'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { waitForWebApp, authenticateTma, applyTelegramTheme } from '@/lib/tma'

/** Telegram Mini App kirish ko'prigi: initData'ni tekshirtirib, tizim
 *  sessiyasini o'rnatadi va foydalanuvchini haqiqiy to'liq saytga
 *  (/dashboard) o'tkazadi. Undan keyin barcha sahifalar (Learning
 *  Workspace, tarif, to'lov) o'zgarishsiz ishlaydi -- marketing
 *  chrome esa TMA rejimida yashiriladi (hooks/useIsTmaMode). */
export default function TmaBridge() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const wa = await waitForWebApp()
      if (cancelled) return
      if (!wa || !wa.initData) {
        setError('Bu sahifa faqat Telegram ilovasi ichida ochiladi. Botda "GapirAI" tugmasini bosing.')
        return
      }
      try {
        wa.ready()
        wa.expand()
        applyTelegramTheme(wa)
        await authenticateTma(wa.initData)
        if (cancelled) return
        router.replace('/dashboard')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Kirishda xatolik.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-8 text-center">
        <AlertCircle className="h-9 w-9 text-red-500" />
        <p className="text-sm text-ui-muted">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
    </div>
  )
}
