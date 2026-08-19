'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Library, Clock, Loader2, Lock, CheckCircle2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getLibrary, getLibraryAccess, purchaseLibraryAccess, getJob, getVideoUrl, formatDuration, LibraryItem, Job } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import VideoPlayer from '@/components/VideoPlayer'

const LIBRARY_ACCESS_PRICE = 5000

export default function LibraryPage() {
  const router = useRouter()
  const { isLoggedIn, loading: authLoading } = useAuth()

  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [purchaseLoading, setPurchaseLoading] = useState(false)

  const [viewingJob, setViewingJob] = useState<Job | null>(null)
  const [viewingLoading, setViewingLoading] = useState<string | null>(null)

  useEffect(() => {
    getLibrary(24, 0)
      .then(setItems)
      .catch(() => setError("Ro'yxatni yuklashda xatolik yuz berdi."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (authLoading || !isLoggedIn) return
    getLibraryAccess()
      .then((res) => setHasAccess(res.has_access))
      .catch(() => setHasAccess(false))
  }, [authLoading, isLoggedIn])

  const handlePurchase = async () => {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setPurchaseLoading(true)
    setError(null)
    try {
      const res = await purchaseLibraryAccess()
      if (res.payment_url) {
        window.location.href = res.payment_url
      } else {
        setHasAccess(true)
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "To'lovni boshlashda xatolik yuz berdi.")
      setPurchaseLoading(false)
    }
  }

  const handleOpen = async (item: LibraryItem) => {
    if (authLoading) return
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    if (!hasAccess) {
      handlePurchase()
      return
    }
    setViewingLoading(item.job_id)
    setError(null)
    try {
      const job = await getJob(item.job_id)
      setViewingJob(job)
    } catch (err: any) {
      setError("Videoni ochishda xatolik yuz berdi.")
    } finally {
      setViewingLoading(null)
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center py-12 px-4 sm:px-6 transition-colors duration-300">
      <MeshBackground />

      <div className="w-full max-w-5xl z-10 space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition duration-200"
        >
          <ArrowLeft className="w-4 h-4" /> Bosh sahifaga qaytish
        </Link>

        <div className="glass-card border border-black/5 dark:border-white/5 rounded-[32px] p-6 sm:p-10 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-black/5 dark:border-slate-800/80 pb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 dark:text-violet-400 flex items-center justify-center">
              <Library className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Ommaviy videolar</h1>
              <p className="text-xs text-gray-500 dark:text-slate-500">Boshqa foydalanuvchilar allaqachon dublyaj qilgan videolar</p>
            </div>
          </div>

          {!authLoading && hasAccess !== true && (
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-between rounded-2xl border border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 p-5">
              <div className="text-center sm:text-left">
                <p className="text-sm font-black text-gray-900 dark:text-white">Kutubxonaga umrbod kirish — {LIBRARY_ACCESS_PRICE.toLocaleString('uz-UZ')} so'm</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Bir martalik to'lov — barcha (hozirgi va kelajakdagi) dublyaj qilingan videolarni cheksiz tomosha qiling</p>
              </div>
              <button
                onClick={handlePurchase}
                disabled={purchaseLoading}
                className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl btn-premium font-extrabold text-xs uppercase tracking-wide disabled:opacity-60"
              >
                {purchaseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {isLoggedIn ? "Kirish huquqini olish" : "Kirib, huquq olish"}
              </button>
            </div>
          )}

          {hasAccess === true && (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Kutubxonaga kirish huquqingiz bor — istalgan videoni bepul tomosha qiling
            </div>
          )}

          {loading && (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-400 dark:text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs font-semibold">Yuklanmoqda...</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-3 text-center text-sm text-red-500 dark:text-red-400 font-semibold">{error}</div>
          )}

          {!loading && items.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400 dark:text-slate-500">
              Hozircha ommaviy videolar mavjud emas.
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {items.map((item) => (
                <motion.button
                  key={item.job_id}
                  onClick={() => handleOpen(item)}
                  disabled={viewingLoading !== null}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="text-left rounded-2xl overflow-hidden bg-black/[0.02] dark:bg-slate-950/40 border border-black/5 dark:border-slate-800/80 hover:border-violet-400/50 transition disabled:opacity-60"
                >
                  <div className="relative aspect-video bg-black/10 dark:bg-black/30">
                    {item.video_thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.video_thumbnail} alt={item.video_title || ''} className="w-full h-full object-cover" />
                    )}
                    <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/90 text-white text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3" /> Dublyaj qilingan
                    </span>
                    {item.video_duration != null && (
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] font-bold">
                        <Clock className="w-3 h-3" /> {formatDuration(item.video_duration)}
                      </span>
                    )}
                    {!hasAccess && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Lock className="w-6 h-6 text-white/90" />
                      </div>
                    )}
                    {viewingLoading === item.job_id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug">{item.video_title || 'Nomsiz video'}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {viewingJob && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setViewingJob(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setViewingJob(null)}
                className="absolute -top-10 right-0 sm:-right-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                aria-label="Yopish"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <VideoPlayer src={getVideoUrl(viewingJob.job_id)} subtitlesContent={viewingJob.uzbek_srt_content} />
              </div>
              <p className="mt-3 text-sm font-bold text-white/90 line-clamp-2">{viewingJob.video_title}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  );
}
