'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Clock, Loader2, CheckCircle2 } from 'lucide-react'
import { getJob, getLibrary, getLibraryAccess, getVideoUrl, formatDuration, LibraryItem, Job } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import VideoPlayer from '@/components/VideoPlayer'

export default function LibraryWatchPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { isLoggedIn, loading: authLoading } = useAuth()

  const [job, setJob] = useState<Job | null>(null)
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!isLoggedIn) {
      router.replace('/login')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([getLibraryAccess(), getJob(id), getLibrary(24, 0)])
      .then(([access, jobData, list]) => {
        if (cancelled) return
        if (!access.has_access) {
          router.replace('/library')
          return
        }
        setJob(jobData)
        setItems(list)
      })
      .catch(() => {
        if (!cancelled) setError("Videoni yuklashda xatolik yuz berdi.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [id, isLoggedIn, authLoading, router])

  const otherItems = items.filter((item) => item.job_id !== id)

  return (
    <div className="min-h-screen bg-white dark:bg-[#070202] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Link
          href="/library"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition duration-200 mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> Ommaviy videolarga qaytish
        </Link>

        {loading && (
          <div className="py-24 flex flex-col items-center gap-3 text-gray-400 dark:text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin" />
            <p className="text-xs font-semibold">Yuklanmoqda...</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-24 text-center text-sm text-red-500 dark:text-red-400 font-semibold">{error}</div>
        )}

        {!loading && !error && job && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-2xl overflow-hidden shadow-lg">
                <VideoPlayer src={getVideoUrl(job.job_id)} subtitlesContent={job.uzbek_srt_content} />
              </div>
              <div className="space-y-2">
                <h1 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white leading-snug">
                  {job.video_title || 'Nomsiz video'}
                </h1>
                <div className="flex items-center gap-3 text-xs font-semibold text-gray-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Dublyaj qilingan
                  </span>
                  {job.video_duration != null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {formatDuration(job.video_duration)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-1 space-y-3">
              <h2 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest px-1">
                Boshqa ommaviy videolar
              </h2>
              <div className="space-y-2">
                {otherItems.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 px-1">Boshqa video hozircha yo'q.</p>
                )}
                {otherItems.map((item) => (
                  <Link
                    key={item.job_id}
                    href={`/library/${item.job_id}`}
                    className="flex gap-3 p-2 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition"
                  >
                    <div className="relative w-32 sm:w-40 aspect-video shrink-0 rounded-lg overflow-hidden bg-black/10 dark:bg-black/30">
                      {item.video_thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.video_thumbnail} alt={item.video_title || ''} className="w-full h-full object-cover" />
                      )}
                      {item.video_duration != null && (
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-bold">
                          {formatDuration(item.video_duration)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="text-xs font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug">
                        {item.video_title || 'Nomsiz video'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
