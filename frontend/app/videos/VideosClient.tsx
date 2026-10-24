'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Clapperboard, Loader2, Play } from 'lucide-react'
import PageShell, { PageTitle } from '@/components/PageShell'
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
    <PageShell current="videos">
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-20">
        <PageTitle title="Ommaviy videolar" lead="Dunyo boʻylab foydali videolar — oʻzbek tilida. Tomosha qilish bepul." />
        <div className="mt-10" />

        {isEmpty ? (
          <div className="py-20 text-center">
            <Clapperboard aria-hidden className="mx-auto mb-4 h-6 w-6 text-ui-muted" />
            <p className="text-lg font-semibold text-ui-ink">Hozircha bu yerda videolar yo‘q</p>
            <p className="mt-1 text-[15px] text-ui-muted">Tez orada yangi videolar qo‘shiladi.</p>
            <Link
              href="/"
              className="ui-btn ui-btn-primary mt-6"
            >
              O‘zingiz video dublaj qiling
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v) => {
              const duration = formatDuration(v.video_duration)
              const when = getTashkentRelativeTime(v.published_at)
              return (
                <li key={v.id} className="min-w-0">
                  <Link href={`/video/${v.id}`} className="group block rounded-xl">
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-ui-ground">
                      {v.video_thumbnail ? (
                        <img
                          src={v.video_thumbnail}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-ui-muted">
                          <Play aria-hidden="true" className="w-8 h-8" />
                        </div>
                      )}
                      {duration && (
                        <span className="absolute bottom-1.5 right-1.5 text-xs font-medium tabular-nums bg-black/80 text-white px-1.5 py-0.5 rounded">
                          {duration}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-[15px] font-medium leading-snug text-ui-ink">
                      {v.video_title || 'Nomsiz video'}
                    </h2>
                    <p className="mt-1 text-[13px] text-ui-muted">
                      O‘zbekcha dublaj{when ? ` · ${when}` : ''}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <div ref={sentinelRef} aria-hidden className="h-px" />
        <div className="pt-10 text-center text-sm text-ui-muted" aria-live="polite">
          {loading && (
            <span className="inline-flex items-center gap-2">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Yuklanmoqda...
            </span>
          )}
          {error && (
            <button type="button" onClick={() => setError(false)} className="font-medium text-ui-accent-ink hover:underline">
              Yuklab bo‘lmadi — qayta urinish
            </button>
          )}
          {!loading && !error && !hasMore && videos.length > 0 && <span>Hammasi ko‘rsatildi</span>}
        </div>
      </div>
    </PageShell>
  )
}
