'use client'

import { useEffect, useRef, useState } from 'react'
import { getPublicStats, type PublicStats } from '@/lib/api'

// toLocaleString server va brauzerda turli probel beradi (hydration xatosi) -- qo'lda guruhlaymiz
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const DURATION_MS = 1600
// Boshida tez, oxirida sekinlashib to'xtaydi (ease-out-expo)
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

const ITEMS: { key: keyof PublicStats; label: string }[] = [
  { key: 'dubs', label: 'video oʻzbek tiliga oʻgirildi' },
  { key: 'minutes', label: 'daqiqa oʻzbekcha ovozga aylantirildi' },
  { key: 'users', label: 'foydalanuvchi roʻyxatdan oʻtgan' },
]

/** Jonli raqamlar: har kirishda /api/public-stats dan olinadi.
 *  Bo'lim ekranga kirganda 0 dan sanaladi; harakat
 *  kamaytirilgan rejimda darhol yakuniy qiymat. API javob bermasa bo'lim
 *  ko'rsatilmaydi -- eskirgan yoki taxminiy raqam chiqarmaymiz. */
export default function StatsStrip() {
  const ref = useRef<HTMLElement>(null)
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  // 0..1 -- sanash jarayoni; bo'lim ko'ringuncha 0 da turadi
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    let alive = true
    getPublicStats()
      .then((s) => alive && setStats(s))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!stats || !visible || reduceMotion) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      setProgress(t)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [stats, visible, reduceMotion])

  if (failed) return null

  return (
    <section ref={ref} aria-label="Platforma raqamlarda" className="border-y border-ui-rule bg-ui-ground">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <dl className="grid gap-8 sm:grid-cols-3" aria-busy={!stats}>
          {ITEMS.map(({ key, label }) => {
            const value = stats?.[key]
            const shown = value === undefined ? 0 : reduceMotion ? value : Math.round(value * easeOutExpo(progress))
            return (
              <div key={key} className="flex flex-col-reverse">
                <dt className="mt-1 text-base text-ui-muted">{label}</dt>
                <dd className="text-4xl font-semibold tracking-[-0.03em] text-ui-ink tabular-nums">
                  {value === undefined ? (
                    <span className="text-ui-muted/40">—</span>
                  ) : (
                    <>
                      {/* Ekran o'quvchi o'zgarib turgan raqamni emas, faqat yakuniysini o'qiydi */}
                      <span aria-hidden="true">{fmt(shown)}</span>
                      <span className="sr-only">{fmt(value)}</span>
                    </>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
    </section>
  )
}
