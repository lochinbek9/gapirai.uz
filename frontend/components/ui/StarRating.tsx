'use client'

import { KeyboardEvent, useRef, useState } from 'react'
import { Star } from 'lucide-react'

interface Props {
  value: number
  onChange: (value: number) => void
  label: string
  /** true bo'lsa tanlangan yulduzni qayta bosish bahoni 0 ga qaytaradi (ixtiyoriy baho) */
  allowClear?: boolean
  starClassName?: string
  emptyClassName?: string
}

/** Yulduzcha baho -- role=radiogroup, har yulduz "N yulduz" nomli radio.
 * ←/→ (yoki ↑/↓) bahoni o'zgartiradi, Tab faqat tanlangan yulduzga tushadi. */
export default function StarRating({
  value, onChange, label, allowClear = false,
  starClassName = 'w-5 h-5', emptyClassName = 'text-metro-muted',
}: Props) {
  const [hover, setHover] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const shown = hover || value
  const focusIndex = value > 0 ? value - 1 : 0

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, star: number) => {
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(5, star + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(1, star - 1)
      : e.key === 'Home' ? 1
      : e.key === 'End' ? 5
      : null
    if (next === null) return
    e.preventDefault()
    onChange(next)
    refs.current[next - 1]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          ref={(el) => { refs.current[star - 1] = el }}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} yulduz`}
          tabIndex={star - 1 === focusIndex ? 0 : -1}
          onClick={() => onChange(allowClear && value === star ? 0 : star)}
          onMouseEnter={() => setHover(star)}
          onKeyDown={(e) => onKeyDown(e, star)}
          className="p-1.5 rounded-lg transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-blue"
        >
          <Star
            aria-hidden="true"
            className={`${starClassName} transition-colors ${star <= shown ? 'fill-current text-metro-ink' : emptyClassName}`}
          />
        </button>
      ))}
    </div>
  )
}
