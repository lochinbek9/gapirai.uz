'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clapperboard, Loader2, Play } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import Footer from '@/components/Footer'
import { listPublicVideos, PublicVideo } from '@/lib/api'
import { getTashkentRelativeTime } from '@/lib/timestamp'

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return ''
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export default function VideosClient() {
  const [videos, setVideos] = useState<PublicVideo[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadNext = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    setError(false)
    try {
      const next = page + 1
      const res = await listPublicVideos(next)
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id))
        return [...prev, ...res.videos.filter((v) => !seen.has(v.id))]
      })
      setPage(next)
      setHasMore(res.has_more)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [loading, hasMore, page])

  // YouTube kabi cheksiz: ro'yxat oxiri ko'rinishga yaqinlashganda keyingi sahifa
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || error) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNext()
      },
      { rootMargin: '800px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadNext, error])

  const isEmpty = !loading && !error && !hasMore && videos.length === 0

  return (
    <main className="relative min-h-screen flex flex-col overflow-x-hidden transition-colors duration-300">
      <header className="w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-5 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center transition duration-300 hover:scale-105">
            <img src="/logo.webp" alt="GapirAI.uz" width={160} height={40} className="h-9 sm:h-11 w-auto object-contain dark:hidden" />
            <img src="/logodark.webp" alt="GapirAI.uz" width={160} height={40} className="h-9 sm:h-11 w-auto object-contain hidden dark:block" />
          </Link>
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="flex items-center gap-2 h-9 sm:h-10 px-3.5 sm:px-4 bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-slate-200 dark:border-white/15 text-slate-900 dark:text-white text-xs font-bold rounded-2xl shadow-sm transition"
            >
              <ArrowLeft className="w-4 h-4 text-violet-500" />
              Bosh sahifa
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="w-full max-w-7xl mx-auto flex-1 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-16">
        <div className="mb-8 sm:mb-10 max-w-2xl">
          <h1 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-slate-900 dark:text-white">
            Ommaviy videolar
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Dunyo bo‘ylab foydali videolar — o‘zbek tilida. Tomosha qilish bepul.
          </p>
        </div>

        {isEmpty ? (
          <div className="py-20 text-center">
            <Clapperboard aria-hidden className="w-10 h-10 mx-auto text-violet-500 mb-4" />
            <p className="text-base font-semibold text-slate-900 dark:text-white">Hozircha bu yerda videolar yo‘q</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Tez orada yangi videolar qo‘shiladi.</p>
            <Link
              href="/"
              className="inline-flex mt-6 px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition"
            >
              O‘zingiz video dublaj qiling
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
            {videos.map((v) => {
              const duration = formatDuration(v.video_duration)
              const when = getTashkentRelativeTime(v.published_at)
              return (
                <li key={v.id} className="min-w-0">
                  <Link href={`/video/${v.id}`} className="group block focus:outline-none">
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-200 dark:bg-white/5 ring-violet-500 group-focus-visible:ring-2">
                      {v.video_thumbnail ? (
                        <img
                          src={v.video_thumbnail}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <Play className="w-8 h-8" />
                        </div>
                      )}
                      {duration && (
                        <span className="absolute bottom-1.5 right-1.5 text-xs font-medium tabular-nums bg-black/80 text-white px-1.5 py-0.5 rounded">
                          {duration}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-sm sm:text-[15px] font-semibold leading-snug text-slate-900 dark:text-white line-clamp-2 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">
                      {v.video_title || 'Nomsiz video'}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      O‘zbekcha dublaj{when ? ` · ${when}` : ''}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <div ref={sentinelRef} aria-hidden className="h-px" />
        <div className="pt-8 text-center text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          {loading && (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              Yuklanmoqda...
            </span>
          )}
          {error && (
            <button type="button" onClick={() => setError(false)} className="text-violet-600 dark:text-violet-400 font-semibold hover:underline">
              Yuklab bo‘lmadi — qayta urinish
            </button>
          )}
          {!loading && !error && !hasMore && videos.length > 0 && <span>Hammasi ko‘rsatildi</span>}
        </div>
      </div>

      <Footer />
    </main>
  )
}
