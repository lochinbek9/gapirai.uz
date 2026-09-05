'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import {
  TelegramWebApp,
  TmaUser,
  waitForWebApp,
  authenticateTma,
  applyTelegramTheme,
} from '@/lib/tma'

interface TmaContextValue {
  user: TmaUser
  webApp: TelegramWebApp
}

const TmaContext = createContext<TmaContextValue | null>(null)

export function useTma(): TmaContextValue {
  const ctx = useContext(TmaContext)
  if (!ctx) throw new Error('useTma must be used inside <TmaProvider>')
  return ctx
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; user: TmaUser; webApp: TelegramWebApp }

export default function TmaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const wa = await waitForWebApp()
      if (cancelled) return
      if (!wa || !wa.initData) {
        setState({
          phase: 'error',
          message: 'Bu sahifa faqat Telegram ilovasi ichida ochiladi. Botda "GapirAI" tugmasini bosing.',
        })
        return
      }
      try {
        wa.ready()
        wa.expand()
        applyTelegramTheme(wa)
        const user = await authenticateTma(wa.initData)
        if (cancelled) return
        setState({ phase: 'ready', user, webApp: wa })
      } catch (e) {
        if (cancelled) return
        setState({ phase: 'error', message: e instanceof Error ? e.message : 'Kirishda xatolik.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-8 text-center">
        <AlertCircle className="h-9 w-9 text-red-500" />
        <p className="text-sm text-gray-600 dark:text-gray-300">{state.message}</p>
      </div>
    )
  }

  return (
    <TmaContext.Provider value={{ user: state.user, webApp: state.webApp }}>
      {children}
    </TmaContext.Provider>
  )
}
