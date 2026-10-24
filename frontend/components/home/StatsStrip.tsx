'use client'

import { useEffect, useRef, useState } from 'react'
import { PLATFORM_STATS } from './stats'

// toLocaleString server va brauzerda turli probel beradi (hydration xatosi) -- qo'lda guruhlaymiz
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')

const DURATION_MS = 1600
// Boshida tez, oxirida sekinlashib to'xtaydi (ease-out-expo)
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

const ITEMS = [
  { value: PLATFORM_STATS.finishedDubs, label: 'video oʻzbek tiliga dublaj qilindi' },
  { value: PLATFORM_STATS.dubbedMinutes, label: 'daqiqa oʻzbekcha ovozga aylantirildi' },
  { value: PLATFORM_STATS.verifiedUsers, label: 'foydalanuvchi roʻyxatdan oʻtgan' },
]

/** Haqiqiy, sanali raqamlar (taxmin emas). Bo'lim ekranga kirganda 0 dan sanaladi.
 *  Server HTML'da va harakat kamaytirilgan rejimda doim yakuniy qiymat turadi. */
export default function StatsStrip() {
  const ref = useRef<HTMLElement>(null)
  // null = yakuniy qiymat (SSR, animatsiyasiz holat); 0..1 = animatsiya jarayoni
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Bo'lim allaqachon tepada qolgan bo'lsa (sahifa pastdan ochilgan) -- sanamaymiz
    if (el.getBoundingClientRect().bottom < 0) return

    setProgress(0)
    let frame = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION_MS)
          setProgress(t)
          if (t < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <section ref={ref} aria-label="Platforma raqamlarda" className="border-y border-ui-rule bg-ui-ground">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <dl className="grid gap-8 sm:grid-cols-3">
          {ITEMS.map(({ value, label }) => {
            const shown = progress === null ? value : Math.round(value * easeOutExpo(progress))
            return (
              <div key={label} className="flex flex-col-reverse">
                <dt className="mt-1 text-base text-ui-muted">{label}</dt>
                <dd className="text-4xl font-semibold tracking-[-0.03em] text-ui-ink tabular-nums">
                  {/* Ekran o'quvchi o'zgarib turgan raqamni emas, faqat yakuniysini o'qiydi */}
                  <span aria-hidden="true">{fmt(shown)}</span>
                  <span className="sr-only">{fmt(value)}</span>
                </dd>
              </div>
            )
          })}
        </dl>
        <p className="mt-6 text-sm text-ui-muted">{PLATFORM_STATS.asOf} holatiga, ichki va test hisoblarisiz.</p>
      </div>
    </section>
  )
}
