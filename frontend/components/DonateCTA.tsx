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
      <div className={`flex flex-wrap items-center justify-center gap-2 text-[15px] text-ui-muted ${className}`}>
        <Heart aria-hidden="true" className="h-4 w-4 text-ui-muted" />
        <span>GapirAI.uz sizga foydali bo‘ldimi?</span>
        <Link href="/donate" className="font-medium text-ui-accent-ink underline-offset-4 hover:underline">
          Loyihani qo‘llab-quvvatlang
        </Link>
      </div>
    )
  }

  return (
    <div className={`ui-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${className}`}>
      <Heart aria-hidden="true" className="h-5 w-5 shrink-0 text-ui-muted" />
      <div className="min-w-0 flex-1">
        {headingId ? (
          <h2 id={headingId} className="font-semibold text-ui-ink">Loyihaga hissa qoʻshing</h2>
        ) : (
          <p className="font-semibold text-ui-ink">Loyihaga hissa qoʻshing</p>
        )}
        <p className="mt-0.5 text-sm text-ui-muted">
          GapirAI.uz — mustaqil loyiha. Har bir hissa videolarni koʻproq odamga yetkazishga yordam beradi.
        </p>
      </div>
      <Link href="/donate" className="ui-btn ui-btn-secondary shrink-0">Qoʻllab-quvvatlash</Link>
    </div>
  )
}
