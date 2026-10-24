'use client'

import { useEffect, useState } from 'react'
import { LINES, STATIONS, type LineId } from './lines'

interface Props {
  line?: LineId
  /** Poyezd to'xtaydigan bekat (0..4). Berilmasa sahifa ochilganda bir marta oxirigacha yuradi. */
  step?: number
  className?: string
  /** Ekran o'quvchi uchun izoh (masalan, "Video hozir: Tarjima bekatida") */
  label?: string
}

/** Dublaj yo'lining metro chizig'i: 5 bekat va poyezd. Imzo harakati --
 * poyezd bir marta yuradi va to'xtaydi; prefers-reduced-motion'da darhol
 * o'z joyida turadi. */
export default function LineMap({ line = 'dub', step, className = '', label }: Props) {
  const colors = LINES[line]
  const target = step ?? STATIONS.length - 1
  const [pos, setPos] = useState(step ?? 0)

  useEffect(() => {
    // Birinchi kadrdan keyin pozitsiyani o'zgartiramiz -- CSS transition shu bilan ishlaydi
    const id = requestAnimationFrame(() => setPos(target))
    return () => cancelAnimationFrame(id)
  }, [target])

  const pct = (i: number) => (i / (STATIONS.length - 1)) * 100

  return (
    <figure className={`relative ${className}`} aria-label={label || `Dublaj yoʻli: ${STATIONS.join(', ')}`}>
      <div className="relative mx-3 h-12">
        {/* liniya */}
        <div aria-hidden className={`absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full ${colors.bg}`} />
        {/* bekatlar */}
        {STATIONS.map((name, i) => {
          const passed = i <= pos
          return (
            <span
              key={name}
              aria-hidden
              className={`absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] ${colors.border} transition-colors duration-500 ${
                passed ? colors.bg : 'bg-metro-surface'
              }`}
              style={{ left: `${pct(i)}%` }}
            />
          )
        })}
        {/* poyezd */}
        <svg
          aria-hidden
          viewBox="0 0 56 20"
          className="absolute top-1/2 h-5 w-14 -translate-x-1/2 -translate-y-[calc(50%+24px)] text-metro-plaque drop-shadow-[0_3px_4px_rgb(0_0_0/0.25)] transition-[left] duration-[1600ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ left: `${pct(pos)}%` }}
        >
          {/* vagon: to'g'ri orqa, qiya kabina burni o'ngda (harakat yo'nalishi) */}
          <path d="M2 3h38c6 0 10 3 13 8l1 3v2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor" />
          <rect x="5" y="6" width="8" height="5" rx="1" className="fill-metro-plaque-ink/70" />
          <rect x="16" y="6" width="8" height="5" rx="1" className="fill-metro-plaque-ink/70" />
          <rect x="27" y="6" width="8" height="5" rx="1" className="fill-metro-plaque-ink/70" />
          <path d="M39 6h3c3 0 6 2 8 5h-11z" className="fill-metro-plaque-ink/90" />
          <rect x="0" y="16" width="54" height="2" className={colors.fill} />
        </svg>
      </div>
      <figcaption className="relative mx-3 h-6">
        <ol className="contents">
          {STATIONS.map((name, i) => (
            <li
              key={name}
              className={`absolute top-0 whitespace-nowrap font-sign text-sm font-bold uppercase tracking-wide sm:text-base ${
                i === 0 ? 'translate-x-0' : i === STATIONS.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
              } ${i === pos ? 'text-metro-ink' : 'text-metro-muted'}`}
              style={{ left: `${pct(i)}%` }}
              aria-current={step !== undefined && i === pos ? 'step' : undefined}
            >
              {name}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}
