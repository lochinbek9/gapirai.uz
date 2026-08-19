'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getJob, Job, formatDuration, getVideoUrl, getAudioUrl, initiateClickPayment, initiatePaymePayment, clearJobId, cancelJob } from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'
import {
  ArrowLeft, Youtube, ChevronDown, ChevronUp,
  Mic2, Clock, Loader2, CreditCard, AlertTriangle
} from 'lucide-react'
import VideoPlayer from '@/components/VideoPlayer'
import FeedbackSection from '@/components/FeedbackSection'
import ResolutionDownloadButtons from '@/components/ResolutionDownloadButtons'

const TEST_PRICE_MULTIPLIER = 1.0

function calculateClientPrice(durationMinutes: number): number {
  if (durationMinutes < 45.0) return 0
  return Math.ceil(durationMinutes) * 500
}

function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return "kam qoldi..."
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) {
    return `${m} daqiqa ${s} soniya`
  }
  return `${s} soniya`
}

/* ── Page ────────────────────────────────────────── */
export default function VideoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { job: polledJob, error: pollError, is404 } = useJobPolling(id)
  
  const [loading, setLoading] = useState(true)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [theaterMode, setTheaterMode] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const prevStatusRef = useRef<string | undefined>(undefined)
  const paidAmountRef = useRef<number | null>(null)
  const paymentIdRef = useRef<string | null>(null)

  const job = polledJob

  const handleGoHome = () => {
    clearJobId()
    router.push('/')
  }

  const handleCancel = async () => {
    if (!id) return
    if (!window.confirm("Rostdan ham ushbu dublyajni bekor qilmoqchimisiz?")) return
    setCancelLoading(true)
    try {
      const res = await cancelJob(id)
      if (res.success) {
        window.location.reload()
      } else {
        alert(res.message || "Bekor qilishda xatolik yuz berdi.")
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Bekor qilishda xatolik yuz berdi.")
    } finally {
      setCancelLoading(false)
    }
  }

  useEffect(() => {
    const handlePopState = () => {
      clearJobId()
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (job) {
      setLoading(false)
    }
  }, [job])

  useEffect(() => {
    if (is404) {
      clearJobId()
      router.push('/dashboard')
    }
  }, [is404, router])

  // To'lov "awaiting_payment"dan boshqa holatga o'tganda (ya'ni Click
  // to'lovni tasdiqlaganda) Yandex Metrika'ga bir martagina purchase
  // eventi yuboriladi — bu foydalanuvchi to'lov tugagach payment
  // sahifasiga emas, shu sahifada qolganini poll orqali kuzatadi.
  useEffect(() => {
    if (!job || !id) return
    const prevStatus = prevStatusRef.current
    const trackKey = `ym_purchase_tracked_${id}`
    if (
      prevStatus === 'awaiting_payment' &&
      job.status !== 'awaiting_payment' &&
      typeof window !== 'undefined' &&
      !sessionStorage.getItem(trackKey)
    ) {
      const amount = paidAmountRef.current ?? (job.video_duration ? calculateClientPrice(job.video_duration / 60.0) : 0)
      if (amount > 0) {
        const orderId = paymentIdRef.current || id
        sessionStorage.setItem(trackKey, '1')
        ;(window as any).dataLayer = (window as any).dataLayer || []
        ;(window as any).dataLayer.push({
          ecommerce: {
            currencyCode: 'UZS',
            purchase: {
              actionField: { id: orderId, revenue: amount },
              products: [{
                id,
                name: job.video_title || 'Video dublyaj',
                category: 'Dublyaj xizmati',
                price: amount,
                quantity: 1,
              }],
            },
          },
        })
      }
    }
    prevStatusRef.current = job.status
  }, [job?.status, job?.video_duration, job?.video_title, id])

  if (loading || !job) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  const videoSrc = getVideoUrl(id)
  const audioUrl = job.status === 'completed' ? getAudioUrl(id) : undefined

  const handlePayment = async (provider: 'click' | 'payme' = 'click') => {
    if (!id) return
    setPaymentLoading(true)
    setPaymentError(null)

    // Popup blocker'ga tushmaslik uchun yangi oynani darhol ochamiz
    const paymentWindow = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null

    try {
      const res = await (provider === 'payme' ? initiatePaymePayment(id) : initiateClickPayment(id))
      if (res.success && res.payment_url) {
        paidAmountRef.current = res.amount
        paymentIdRef.current = res.payment_id || null
        if (paymentWindow) {
          paymentWindow.location.href = res.payment_url
        } else {
          window.location.href = res.payment_url
        }
      } else if (res.amount === 0) {
        if (paymentWindow) paymentWindow.close()
        window.location.reload()
      } else {
        if (paymentWindow) paymentWindow.close()
        setPaymentError("To'lov havolasini yaratishda xatolik yuz berdi.")
      }
    } catch (err: any) {
      if (paymentWindow) paymentWindow.close()
      setPaymentError(err?.response?.data?.detail || "To'lov jarayonida xatolik yuz berdi.")
    } finally {
      setPaymentLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4 pointer-events-auto">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition active:scale-95 shadow-sm"
            aria-label="Orqaga qaytish"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 transition duration-300 hover:scale-105">
            <img src="/logodark.webp" alt="GapirAI.uz Logo" width={120} height={32} className="h-8 w-auto object-contain" style={{ maxWidth: "160px", maxHeight: "40px", height: "auto" }} />
            <span className="text-lg font-black tracking-tight text-white">
              GapirAI<span className="text-violet-500">.uz</span>
            </span>
          </Link>
        </div>
      </header>

      <div className={theaterMode ? 'w-full' : 'max-w-6xl mx-auto px-6 py-8'}>
        <div className={theaterMode
          ? 'flex flex-col gap-0'
          : 'grid grid-cols-1 lg:grid-cols-3 gap-8'
        }>
          {/* Player */}
          <div className={theaterMode ? 'w-full' : 'lg:col-span-2 space-y-4'}>
            {job.status === 'completed' ? (
              <VideoPlayer
                src={videoSrc}
                subtitlesContent={job.uzbek_srt_content}
                audioDownloadUrl={audioUrl}
                theaterMode={theaterMode}
                onTheaterToggle={() => setTheaterMode(m => !m)}
                className={theaterMode ? '' : 'rounded-2xl'}
              />
            ) : job.status === 'awaiting_payment' ? (
              <div className="min-h-[28rem] bg-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 border border-white/5 shadow-2xl relative overflow-visible">
                {/* Visual glow backdrop */}
                <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

                <div className="max-w-md w-full text-center space-y-6 z-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-500/10 mb-2">
                    <CreditCard className="w-7 h-7 text-blue-400 animate-pulse" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-extrabold text-white">Tarif reja kerak</h2>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Ushbu video 45 daqiqadan uzun ({job.video_duration ? formatDuration(job.video_duration) : ''}).
                      45 daqiqadan uzun videolarni dublyaj qilish uchun tarif rejalaridan biriga obuna bo'lishingiz kerak.
                    </p>
                  </div>

                  {paymentError && (
                    <div className="text-xs font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-xl p-3 text-left">
                      {paymentError}
                    </div>
                  )}

                  <Link
                    href="/pricing"
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition duration-300 shadow-lg"
                  >
                    Tarif rejalarini ko'rish
                  </Link>

                  <p className="text-[11px] text-slate-500">
                    Obuna bo'lgandan so'ng, shunga o'xshash videolarni qo'shimcha to'lovsiz dublyaj qila olasiz.
                  </p>

                  <div className="border-t border-white/10 pt-4 space-y-2">
                    <button
                      onClick={() => handlePayment('click')}
                      disabled={paymentLoading}
                      className="text-xs font-semibold text-slate-400 hover:text-white transition disabled:opacity-50 block"
                    >
                      {paymentLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin inline" />
                      ) : (
                        <>Click orqali bir martalik to'lov qiling ({job.video_duration ? calculateClientPrice(job.video_duration / 60.0).toLocaleString('uz-UZ') : '...'} UZS)</>
                      )}
                    </button>
                    <button
                      onClick={() => handlePayment('payme')}
                      disabled={paymentLoading}
                      className="text-xs font-semibold text-slate-400 hover:text-white transition disabled:opacity-50 block"
                    >
                      Payme orqali to'lash
                    </button>
                  </div>

                  <button
                    onClick={handleGoHome}
                    className="inline-block text-xs font-semibold text-slate-400 hover:text-white transition pt-2"
                  >
                    ← Bosh sahifaga qaytish
                  </button>
                </div>
              </div>
            ) : job.status === 'failed' ? (
              <div className="aspect-video bg-slate-800 rounded-2xl flex items-center justify-center p-6 relative overflow-hidden border border-violet-500/20">
                <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-violet-500/5 blur-3xl pointer-events-none" />
                <div className="text-center space-y-4 max-w-md z-10">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-500/10 text-violet-400 mb-2">
                    <AlertTriangle className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-white font-bold text-lg">Dublyaj jarayonida xatolik yuz berdi</h3>
                    <p className="text-xs text-violet-300 font-mono bg-violet-950/30 border border-violet-900/30 rounded-xl p-3 text-left overflow-auto max-h-32 leading-relaxed">
                      {job.error_message || "Tizimda noma'lum xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."}
                    </p>
                  </div>
                  <div className="pt-2 flex justify-center gap-3">
                    <button
                      onClick={handleGoHome}
                      className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition duration-200"
                    >
                      Bosh sahifaga qaytish
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-slate-800 rounded-2xl flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
                <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
                
                <div className="text-center space-y-4 max-w-sm z-10">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-400 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-white font-semibold text-lg">{job.status_message || 'Qayta ishlanmoqda...'}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Progress: {job.progress}%</p>
                  </div>

                  {job.expected_end_time && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-400 space-y-1">
                      <p className="font-semibold text-slate-300">Taxminiy yakunlanish vaqti:</p>
                      <p className="text-white font-mono text-sm">
                        {new Date(job.expected_end_time).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {Math.ceil((new Date(job.expected_end_time).getTime() - currentTime) / 1000) <= 0
                          ? "(tez orada yakunlanadi...)"
                          : `(taxminan ${formatRemainingTime(Math.ceil((new Date(job.expected_end_time).getTime() - currentTime) / 1000))} qoldi)`}
                      </p>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      onClick={handleCancel}
                      disabled={cancelLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-violet-400 hover:text-white bg-violet-500/10 hover:bg-violet-500 rounded-lg transition duration-200 disabled:opacity-50"
                    >
                      {cancelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Jarayonni bekor qilish
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Title & info (below player, padded in theater mode) */}
            <div className={theaterMode ? 'max-w-6xl mx-auto px-6 pt-6 space-y-4' : 'space-y-4'}>
              <div>
                <h1 className="text-xl font-bold text-white mb-2">
                  {job.video_title || "Noma'lum video"}
                </h1>
                <div className="flex items-center gap-4 text-slate-400 text-sm">
                  {job.video_duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDuration(job.video_duration)}
                    </span>
                  )}
                  {job.speaker_gender && (
                    <span className="flex items-center gap-1">
                      <Mic2 className="w-4 h-4" />
                      {job.speaker_gender === 'female' ? 'Ayol ovozi (MadinaNeural)' : 'Erkak ovozi (SardorNeural)'}
                    </span>
                  )}
                </div>
              </div>

              {job.status === 'completed' && job.content_flagged && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 leading-relaxed">
                    Video tayyor va shaxsiy foydalanish uchun mavjud, lekin kontent siyosatimizga ko'ra
                    (diniy, 18+, zo'ravonlik yoki shunga o'xshash kategoriya) <strong>Ommaviy videolar</strong> kutubxonasiga
                    chiqarilmaydi. Iltimos, keyingi safar bunday kontentni yubormaslikni so'raymiz.
                  </p>
                </div>
              )}

              {/* Download & Feedback */}
              {job.status === 'completed' && (
                <div className="space-y-6 pt-1">
                  <div>
                    <ResolutionDownloadButtons jobId={id} />
                  </div>

                  {/* Feedback rating component */}
                  <FeedbackSection
                    jobId={id}
                    initialRating={job.rating}
                    initialComment={job.feedback_comment}
                  />
                </div>
              )}

              {/* Translation accordion */}
              {job.translated_text && (
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="w-full flex items-center justify-between px-5 py-4 text-white font-medium hover:bg-white/5 transition"
                  >
                    <span>O'zbek tilidagi matn</span>
                    {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showTranscript && (
                    <div className="px-5 pb-5">
                      <p className="text-slate-300 text-sm leading-relaxed">{job.translated_text}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Sidebar info shown below in theater mode */}
              {theaterMode && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                    <InfoRow label="Holat" value={job.status === 'completed' ? '✅ Tayyor' : job.status} />
                    {job.video_duration && <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} />}
                    {job.speaker_gender && (
                      <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? '👩 Ayol' : '👨 Erkak'} />
                    )}
                    {job.created_at && (
                      <InfoRow label="Yuborilgan" value={new Date(job.created_at).toLocaleDateString('uz-UZ')} />
                    )}
                    {job.uzbek_srt_content && <InfoRow label="Subtitr" value="✅ Mavjud" />}
                  </div>
                  {job.transcript_text && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Inglizcha matn</p>
                      <p className="text-slate-300 text-sm leading-relaxed line-clamp-6">{job.transcript_text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar (only in default mode) */}
          {!theaterMode && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold">Video ma'lumotlari</h2>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <InfoRow label="Holat" value={job.status === 'completed' ? '✅ Tayyor' : job.status} />
                {job.video_duration && <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} />}
                {job.speaker_gender && (
                  <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? '👩 Ayol' : '👨 Erkak'} />
                )}
                {job.created_at && (
                  <InfoRow label="Yuborilgan" value={new Date(job.created_at).toLocaleDateString('uz-UZ')} />
                )}
                {job.uzbek_srt_content && (
                  <InfoRow label="Subtitr" value="✅ Mavjud" />
                )}
              </div>

              {job.transcript_text && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Inglizcha matn</p>
                  <p className="text-slate-300 text-sm leading-relaxed line-clamp-6">{job.transcript_text}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium text-right">{value}</span>
    </div>
  )
}
