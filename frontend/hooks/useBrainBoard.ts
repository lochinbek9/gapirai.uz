'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BrainBoard, getBoard } from '@/lib/brain'

/** Doska holati -- yagona manba server: har o'zgarishdan keyin qayta o'qiladi. */
export function useBrainBoard(enabled: boolean) {
  const [board, setBoard] = useState<BrainBoard | null>(null)
  const [error, setError] = useState('')
  const sequence = useRef(0)

  const reload = useCallback(async () => {
    const id = ++sequence.current
    try {
      const data = await getBoard()
      if (id === sequence.current) setBoard(data) // eskirgan javob yangisini bosib ketmasin
    } catch {
      setError('Vazifalarni yuklab boʻlmadi.')
    }
  }, [])

  /** true -- o'zgarish saqlandi */
  const run = useCallback(async (action: () => Promise<unknown>) => {
    let ok = false
    try {
      await action()
      setError('')
      ok = true
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Oʻzgarish saqlanmadi. Qayta urinib koʻring.')
    }
    await reload()
    return ok
  }, [reload])

  useEffect(() => { if (enabled) reload() }, [enabled, reload])

  // Takliflar tayyorlanayotganda tez-tez tekshiriladi
  const pending = !!board?.generations.some((g) => g.status === 'pending')
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(reload, 1500)
    return () => clearInterval(timer)
  }, [pending, reload])

  return { board, setBoard, error, run, reload }
}

export type BrainBoardState = ReturnType<typeof useBrainBoard>
