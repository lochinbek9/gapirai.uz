'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'

interface Props {
  variant?: 'card' | 'line'
  className?: string
  /** Berilsa karta sarlavhasi shu id bilan <h2> bo'ladi (bosh sahifadagi bo'lim sarlavhasi) */
  headingId?: string
}

/** Kichik "loyihani qo'llab-quvvatlash" chaqirig'i -> /donate. `card` — box
 *  (dashboard, landing), `line` — ixcham matn+havola (video natijasi, tarif).
 *  TMA ichida ham ko'rsatiladi — /donate login talab qilmaydi. */
export default function DonateCTA({ variant = 'card', className = '', headingId }: Props) {
  if (variant === 'line') {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-2 text-base text-metro-muted ${className}`}>
        <Heart aria-hidden="true" className="h-4 w-4 text-metro-red" fill="currentColor" />
        <span>GapirAI.uz sizga foydali bo‘ldimi?</span>
        <Link href="/donate" className="font-semibold text-metro-red-ink underline-offset-4 hover:underline">
          Loyihani qo‘llab-quvvatlang
        </Link>
      </div>
    )
  }

  return (
    <div
      className={`glass-card rounded-2xl border border-rose-500/15 bg-rose-500/[0.04] p-5 shadow-inner dark:border-rose-400/15 ${className}`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <Heart aria-hidden="true" className="h-5 w-5" fill="currentColor" />
          </div>
          <div className="min-w-0 flex-1">
            {headingId ? (
              <h2 id={headingId} className="font-black text-gray-900 dark:text-white">Loyihaga hissa qo‘shing</h2>
            ) : (
              <p className="font-black text-gray-900 dark:text-white">Loyihaga hissa qo‘shing</p>
            )}
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              GapirAI.uz — mustaqil loyiha. Har bir hissa videolarni ko‘proq odamga yetkazishga yordam beradi.
            </p>
          </div>
        </div>
        <Link
          href="/donate"
          className="w-full sm:w-auto text-center shrink-0 self-center rounded-xl bg-gradient-to-r from-rose-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500"
        >
          Qo‘llab-quvvatlash
        </Link>
      </div>
    </div>
  )
}
