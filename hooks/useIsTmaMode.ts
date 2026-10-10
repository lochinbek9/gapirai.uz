'use client'

import { useEffect, useState } from 'react'
import { isTmaMode } from '@/lib/tma'

/** Sayt Telegram Mini App WebView'i ichida ochilganmi.
 *  SSR/birinchi renderда har doim `false` qaytadi (hidratsiya mos kelishi
 *  uchun), keyin mount'dan so'ng haqiqiy qiymatga o'tadi. */
export function useIsTmaMode(): boolean {
  const [tma, setTma] = useState(false)
  useEffect(() => {
    setTma(isTmaMode())
  }, [])
  return tma
}
