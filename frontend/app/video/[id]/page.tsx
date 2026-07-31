'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getJob, Job, formatDuration, getVideoUrl, getDownloadUrl, getAudioUrl, initiateClickPayment, clearJobId } from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'
import {
  Download, ArrowLeft, Youtube, ChevronDown, ChevronUp,
  Mic2, Clock, Loader2, CreditCard
} from 'lucide-react'
import VideoPlayer from '@/components/VideoPlayer'

const TEST_PRICE_MULTIPLIER = 1.0

function calculateClientPrice(durationMinutes: number): number {
  if (durationMinutes <= 10.0) return 0
  return Math.ceil(durationMinutes) * 1000
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

  const job = polledJob

  const handleGoHome = () => {
    clearJobId()
    router.push('/')
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

  if (loading || !job) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  const videoSrc = getVideoUrl(id)
  const audioUrl = job.status === 'completed' ? getAudioUrl(id) : undefined

  const handlePayment = async () => {
    if (!id) return
    setPaymentLoading(true)
    setPaymentError(null)

    // Popup blocker'ga tushmaslik uchun yangi oynani darhol ochamiz
    const paymentWindow = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null

    try {
      const res = await initiateClickPayment(id)
      if (res.success && res.payment_url) {
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
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={handleGoHome}
            className="text-slate-400 hover:text-white transition p-2 -ml-2 rounded-xl hover:bg-white/5"
            title="Bosh sahifaga qaytish"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 transition duration-300 hover:scale-105">
            <img src="/logodark.png" alt="Xadichai.uz Logo" className="h-8 w-auto object-contain" style={{ maxWidth: "160px", maxHeight: "40px", height: "auto" }} />
            <span className="text-lg font-black tracking-tight text-white">
              Xadichai<span className="text-rose-500">.uz</span>
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
              <div className="aspect-video bg-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 border border-white/5 shadow-2xl relative overflow-hidden">
                {/* Visual glow backdrop */}
                <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

                <div className="max-w-md w-full text-center space-y-6 z-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-500/10 mb-2">
                    <CreditCard className="w-7 h-7 text-blue-400 animate-pulse" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-extrabold text-white">To'lov kutilmoqda</h2>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Ushbu video 10 daqiqadan uzun bo'lgani sababli, dublyaj xizmati pullik.
                    </p>
                  </div>

                  {/* Pricing Details */}
                  <div className="grid grid-cols-2 gap-4 bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="text-left">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Davomiylik</p>
                      <p className="text-lg font-bold text-white mt-1">
                        {job.video_duration ? formatDuration(job.video_duration) : 'Noma\'lum'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Xizmat haqi</p>
                      <p className="text-lg font-bold text-blue-400 mt-1">
                        {job.video_duration ? (() => {
                          const amount = calculateClientPrice(job.video_duration / 60.0);
                          return amount.toLocaleString('uz-UZ') + " UZS";
                        })() : 'Loyiha narxi'}
                      </p>
                    </div>
                  </div>

                  {paymentError && (
                    <div className="text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl p-3 text-left">
                      {paymentError}
                    </div>
                  )}

                  <button
                    onClick={handlePayment}
                    disabled={paymentLoading}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition duration-300 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {paymentLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "Click orqali to'lov qilish"
                    )}
                  </button>

                  <p className="text-[11px] text-slate-500">
                    To'lov tasdiqlangandan so'ng, dublyaj jarayoni avtomatik tarzda boshlanadi.
                  </p>

                  <button
                    onClick={handleGoHome}
                    className="inline-block text-xs font-semibold text-slate-400 hover:text-white transition pt-2"
                  >
                    ← Bosh sahifaga qaytish
                  </button>
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-slate-800 rounded-2xl flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-400 mx-auto mb-3" />
                  <p className="text-slate-400">{job.status_message || 'Qayta ishlanmoqda...'}</p>
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

              {/* Download */}
              {job.status === 'completed' && (
                <a
                  href={getDownloadUrl(id)}
                  download
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition"
                >
                  <Download className="w-4 h-4" />
                  Yuklab olish (MP4)
                </a>
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
