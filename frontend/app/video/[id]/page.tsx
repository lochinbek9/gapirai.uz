'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getJob, Job, formatDuration, getVideoUrl, getAudioUrl, initiateClickPayment, initiatePaymePayment, clearJobId, cancelJob, retryJob } from '@/lib/api'
import UploadRecoveryPrompt from '@/components/UploadRecoveryPrompt'
import { useJobPolling } from '@/hooks/useJobPolling'
import { useAuth } from '@/hooks/useAuth'
import {
  ArrowLeft, Youtube, ChevronDown, ChevronUp,
  Mic2, Clock, Loader2, CreditCard, AlertTriangle, Copy, Check, RotateCw,
  MicOff, ShieldAlert, X, CircleSlash, Download
} from 'lucide-react'
import VideoPlayer from '@/components/VideoPlayer'
import FeedbackSection from '@/components/FeedbackSection'
import ResolutionDownloadButtons from '@/components/ResolutionDownloadButtons'
import DonateCTA from '@/components/DonateCTA'
import { formatTashkentDateTime, formatTashkentTime } from '@/lib/timestamp'

const TEST_PRICE_MULTIPLIER = 1.0

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  )
}

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

function getFriendlyErrorMessage(errorCode?: string | null, errorMessage?: string | null): string {
  if (
    errorCode === 'USER_CANCELLED' ||
    errorMessage?.toLowerCase().includes('user cancelled') ||
    errorMessage?.toLowerCase().includes('bekor qilindi')
  ) {
    return "Dublyaj jarayoni foydalanuvchi tomonidan bekor qilindi."
  }
  if (errorCode === 'NO_SPEECH_FOUND' || errorMessage?.toLowerCase().includes('nutq topilmadi')) {
    return "Ushbu videoda inson nutqi yoki suhbat aniqlanmadi."
  }
  if (errorCode === 'CONTENT_BLOCKED' || errorMessage?.toLowerCase().includes('kontent') || errorMessage?.toLowerCase().includes('taqiqlangan')) {
    return "Video xavfsizlik va kontent siyosatimiz talablariga mos kelmagani sababli to'xtatildi."
  }
  if (errorCode === 'TTS_FAILED') {
    return "Ovoz sintez qilish (TTS) xizmatida texnik uzilish yuz berdi. Iltimos, qaytadan urinib ko'ring."
  }
  if (errorCode === 'TRANSCRIBE_FAILED') {
    return "Video audiosini matnga aylantirishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
  }
  if (errorCode === 'TRANSLATE_FAILED') {
    return "Matnni o'zbek tiliga tarjima qilish jarayonida xatolik yuz berdi."
  }
  if (errorCode === 'VIDEO_UNAVAILABLE' || errorCode === 'DOWNLOAD_FAILED') {
    return "Videoni manbadan yuklab olishda muammo yuz berdi. Video ochiq va mavjudligini tekshiring."
  }
  if (errorCode === 'MERGE_FAILED') {
    return "Video va dublyaj qilingan ovozni birlashtirishda texnik xatolik yuz berdi."
  }
  if (errorCode === 'RECOVERY_EXHAUSTED' || errorCode === 'STUCK_JOB_TIMEOUT') {
    return "Video hajmi juda katta yoki server yuklamasi yuqori bo'lgani sababli jarayon to'xtab qoldi."
  }
  if (
    !errorMessage ||
    errorMessage.toLowerCase().includes('error') ||
    errorMessage.toLowerCase().includes('failed') ||
    errorMessage.toLowerCase().includes('exception') ||
    errorMessage.toLowerCase().includes('traceback')
  ) {
    return "Tizimda kutilmagan texnik nosozlik yuz berdi. Iltimos, qaytadan urinib ko'ring."
  }
  return errorMessage
}

function getStatusLabel(status: string, errorCode?: string | null, errorMessage?: string | null): string {
  if (status === 'completed') return '✅ Tayyor'
  if (status === 'failed') {
    const isCancelled = errorCode === 'USER_CANCELLED' || 
      errorMessage?.toLowerCase().includes('user cancelled') || 
      errorMessage?.toLowerCase().includes('bekor qilindi')
    if (isCancelled) return '⏹️ Bekor qilindi'

    const isNoSpeech = errorCode === 'NO_SPEECH_FOUND' || errorMessage?.toLowerCase().includes('nutq topilmadi')
    const isContentBlocked = errorCode === 'CONTENT_BLOCKED' || errorMessage?.toLowerCase().includes('kontent siyosati') || errorMessage?.toLowerCase().includes('taqiqlangan')
    if (isNoSpeech) return '🎙 Nutq topilmadi'
    if (isContentBlocked) return '🛡 Rad etildi'
    return '❌ Bajarilmadi'
  }
  switch (status) {
    case 'pending': return '⏳ Navbatda'
    case 'awaiting_payment': return '💳 To\'lov kutilmoqda'
    case 'downloading': return '📥 Yuklanmoqda'
    case 'transcribing': return '🎙 Matnga aylantirilmoqda'
    case 'translating': return '🌐 Tarjima qilinmoqda'
    case 'syncing': return '⚡ Moslashtirilmoqda'
    case 'synthesizing': return '🗣 Ovozlashtirilmoqda'
    case 'merging': return '🎬 Birlashtirilmoqda'
    default: return status
  }
}

function getSourceLangLabel(code?: string | null): string {
  if (!code) return "Asl tildagi matn";
  const c = code.toLowerCase().trim();
  const map: Record<string, string> = {
    en: "Inglizcha matn",
    ru: "Ruscha matn",
    tr: "Turkcha matn",
    de: "Nemischa matn",
    fr: "Fransuzcha matn",
    es: "Ispancha matn",
    ar: "Arabcha matn",
    zh: "Xitoycha matn",
    ko: "Koreyscha matn",
    ja: "Yaponcha matn",
    fa: "Forscha matn",
    hi: "Hindcha matn",
    it: "Italyancha matn",
    pt: "Portugalcha matn",
    uz: "O'zbekcha matn",
    kk: "Qozoqcha matn",
    ky: "Qirg'izcha matn",
  };
  return map[c] || `Asl tildagi matn (${code.toUpperCase()})`;
}

/* ── Page ────────────────────────────────────────── */
export default function VideoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { job: polledJob, error: pollError, is404 } = useJobPolling(id)
  
  const [loading, setLoading] = useState(true)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [expandSourceText, setExpandSourceText] = useState(false)
  const [showSrt, setShowSrt] = useState(false)
  const [isSrtCopied, setIsSrtCopied] = useState(false)
  const [showSrtModal, setShowSrtModal] = useState(false)
  const [theaterMode, setTheaterMode] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [retryLoading, setRetryLoading] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [regenProvider, setRegenProvider] = useState<'gemini' | 'edge' | 'azure'>('gemini')
  const [regenGender, setRegenGender] = useState<'male' | 'female'>('male')
  const [regenLoading, setRegenLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [isCopied, setIsCopied] = useState(false)
  const [isEnCopied, setIsEnCopied] = useState(false)
  const prevStatusRef = useRef<string | undefined>(undefined)
  const paidAmountRef = useRef<number | null>(null)
  const paymentIdRef = useRef<string | null>(null)

  const job = polledJob

  useEffect(() => {
    if (job?.tts_provider) {
      const p = job.tts_provider.toLowerCase()
      if (p === 'gemini' || p === 'edge' || p === 'azure') {
        setRegenProvider(p as any)
      }
    }
    if (job?.speaker_gender) {
      const g = job.speaker_gender.toLowerCase()
      if (g === 'male' || g === 'female') {
        setRegenGender(g as any)
      }
    }
  }, [job?.tts_provider, job?.speaker_gender])

  const handleGoHome = () => {
    clearJobId()
    router.push('/')
  }

  const handleRetry = async () => {
    if (!id || retryLoading) return
    setRetryLoading(true)
    try {
      await retryJob(id)
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Videoni qayta ishga tushirishda xatolik yuz berdi.")
    } finally {
      setRetryLoading(false)
    }
  }

  const handleRegenerateSubmit = async () => {
    if (!id || regenLoading) return
    setRegenLoading(true)
    try {
      await retryJob(id, {
        tts_provider: regenProvider,
        speaker_gender: regenGender,
        force_regenerate: true,
      })
      setShowRegenerateModal(false)
      window.location.reload()
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Videoni qayta ishga tushirishda xatolik yuz berdi.")
    } finally {
      setRegenLoading(false)
    }
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
      <div className="min-h-screen relative flex items-center justify-center p-6 transition-colors duration-300">
        <MeshBackground />
        <div className="glass-card rounded-[28px] p-8 max-w-sm w-full text-center space-y-4 border border-gray-200/60 dark:border-white/10 shadow-2xl z-10">
          <div className="w-14 h-14 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center mx-auto shadow-inner">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">Video ma&apos;lumotlari yuklanmoqda...</p>
        </div>
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
    <div className="min-h-screen relative transition-colors duration-300 text-gray-900 dark:text-white">
      <MeshBackground />

      {/* Header */}
      <header className="border-b border-gray-200/60 dark:border-white/10 glass-card sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 sm:py-4 flex items-center gap-3 sm:gap-4 pointer-events-auto">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl sm:rounded-2xl glass-input border border-gray-200/60 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition active:scale-95 shadow-sm shrink-0"
            aria-label="Orqaga qaytish"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 transition duration-300 hover:scale-105">
            <img src="/logo.webp" alt="GapirAI.uz Logo" width={120} height={32} className="h-7 sm:h-8 w-auto object-contain dark:hidden" style={{ maxWidth: "160px", maxHeight: "40px", height: "auto" }} />
            <img src="/logodark.webp" alt="GapirAI.uz Logo" width={120} height={32} className="h-7 sm:h-8 w-auto object-contain hidden dark:block" style={{ maxWidth: "160px", maxHeight: "40px", height: "auto" }} />
            <span className="text-base sm:text-lg font-black tracking-tight text-gray-900 dark:text-white">
              GapirAI<span className="text-violet-500">.uz</span>
            </span>
          </Link>
        </div>
      </header>

      <div className={theaterMode ? 'w-full' : 'max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8'}>
        <div className={theaterMode
          ? 'flex flex-col gap-0'
          : 'grid grid-cols-1 lg:grid-cols-3 gap-8'
        }>
          {/* Player */}
          <div className={theaterMode ? 'w-full' : 'lg:col-span-2 space-y-4'}>
            {job.status === 'completed' ? (
              <VideoPlayer
                src={videoSrc}
                jobId={id}
                videoTitle={job.video_title}
                channelName={job.channel_name}
                youtubeUrl={job.youtube_url}
                subtitlesContent={job.uzbek_srt_content}
                audioDownloadUrl={audioUrl}
                theaterMode={theaterMode}
                onTheaterToggle={() => setTheaterMode(m => !m)}
                className={theaterMode ? '' : 'rounded-2xl'}
              />
            ) : job.status === 'awaiting_payment' ? (
              <div className="glass-card rounded-[28px] p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-gray-200/60 dark:border-white/10 shadow-2xl relative overflow-hidden min-h-[380px]">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 mx-auto shadow-inner">
                  <CreditCard className="w-8 h-8 animate-pulse" />
                </div>

                <div className="space-y-2 max-w-md mx-auto">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400 bg-violet-500/10 px-3 py-1 rounded-full">
                    Obuna kerak
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white pt-1">Tarif reja talab etiladi</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Ushbu video 45 daqiqadan uzun ({job.video_duration ? formatDuration(job.video_duration) : ''}).
                    Katta hajmli videolarni to&apos;liq dublyaj qilish uchun tarif rejalaridan biriga obuna bo&apos;ling.
                  </p>
                </div>

                {paymentError && (
                  <div className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl p-3.5 max-w-md w-full text-center">
                    {paymentError}
                  </div>
                )}

                <div className="max-w-md w-full space-y-4 pt-1">
                  <Link
                    href="/pricing"
                    className="btn-premium w-full py-3.5 px-6 rounded-2xl font-bold text-sm inline-flex items-center justify-center gap-2 shadow-lg"
                  >
                    Tarif rejalarini ko&apos;rish
                  </Link>

                  <div className="border-t border-gray-200/60 dark:border-white/10 pt-4 space-y-2.5">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Yoki ushbu video uchun bir martalik to&apos;lov qiling{job.video_duration ? ` (${calculateClientPrice(job.video_duration / 60.0).toLocaleString('uz-UZ')} so'm)` : ''}:
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => handlePayment('click')}
                        disabled={paymentLoading}
                        title="Click orqali to'lash"
                        className="flex items-center justify-center h-12 px-5 rounded-2xl bg-white border border-gray-200/80 hover:shadow-md transition disabled:opacity-50 active:scale-95 shadow-sm"
                      >
                        {paymentLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                        ) : (
                          <img src="/logos/click.png" alt="Click" className="h-4 w-auto object-contain" />
                        )}
                      </button>
                      <button
                        onClick={() => handlePayment('payme')}
                        disabled={paymentLoading}
                        title="Payme orqali to'lash"
                        className="flex items-center justify-center h-12 px-5 rounded-2xl bg-white border border-gray-200/80 hover:shadow-md transition disabled:opacity-50 active:scale-95 shadow-sm"
                      >
                        <img src="/logos/payme.png" alt="Payme" className="h-4 w-auto object-contain" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleGoHome}
                      className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                    >
                      ← Bosh sahifaga qaytish
                    </button>
                  </div>
                </div>
              </div>
            ) : job.status === 'failed' ? (() => {
              const isCancelled = job.error_code === 'USER_CANCELLED' ||
                job.error_message?.toLowerCase().includes('user cancelled') ||
                job.error_message?.toLowerCase().includes('bekor qilindi') ||
                job.status_message?.toLowerCase().includes('bekor qilindi');
              const isNoSpeech = job.error_code === 'NO_SPEECH_FOUND' || job.error_message?.toLowerCase().includes('nutq topilmadi');
              const isContentBlocked = job.error_code === 'CONTENT_BLOCKED' || job.error_message?.toLowerCase().includes('kontent siyosati') || job.error_message?.toLowerCase().includes('taqiqlangan');

              if (isCancelled) {
                return (
                  <div className="glass-card rounded-[28px] p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-gray-200/60 dark:border-white/10 shadow-2xl relative overflow-hidden min-h-[360px]">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 mx-auto shadow-inner">
                      <CircleSlash className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400 bg-slate-500/10 px-3 py-1 rounded-full">
                        Bekor qilindi
                      </span>
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white pt-1">
                        Dublyaj jarayoni to&apos;xtatildi
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Ushbu video uchun jarayon bekor qilindi. Istalgan vaqtda qaytadan boshlashingiz mumkin.
                      </p>
                    </div>

                    <div className="glass-input text-xs text-gray-600 dark:text-gray-300 rounded-2xl px-4 py-2.5 text-center flex items-center justify-center gap-2 border border-gray-200/60 dark:border-white/10 max-w-md">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                      <span>Jarayon yakunlanmagani sababli daqiqalaringiz sarflanmadi</span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2 max-w-sm w-full">
                      <button
                        onClick={handleRetry}
                        disabled={retryLoading}
                        className="btn-premium flex-1 py-3 px-5 text-xs font-bold rounded-2xl shadow-lg inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${retryLoading ? 'animate-spin' : ''}`} />
                        Qaytadan boshlash
                      </button>
                      <button
                        onClick={handleGoHome}
                        className="glass-input flex-1 py-3 px-5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-2xl transition border border-gray-200/60 dark:border-white/10"
                      >
                        Bosh sahifa
                      </button>
                    </div>
                  </div>
                );
              }

              if (isNoSpeech) {
                return (
                  <div className="glass-card rounded-[28px] p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-amber-500/20 shadow-2xl relative overflow-hidden min-h-[360px]">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 mx-auto shadow-inner">
                      <MicOff className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full">
                        Ovoz aniqlanmadi
                      </span>
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white pt-1">
                        Videoda nutq topilmadi
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Ushbu videoda inson nutqi yoki suhbat aniqlanmadi. Dublyaj faqat ovozli nutq mavjud bo&apos;lgan videolarni tarjima qiladi.
                      </p>
                    </div>

                    <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 text-left flex items-start gap-2.5 max-w-md">
                      <span className="text-sm select-none">💡</span>
                      <span>Musiqa yoki ovozsiz roliklar o&apos;rniga, gapirilgan nutq (ma&apos;ruza, intervyu, darslik) bor videoni tanlang.</span>
                    </div>

                    <div className="pt-2 max-w-xs w-full">
                      <button
                        onClick={handleGoHome}
                        className="btn-premium w-full py-3 px-5 text-xs font-bold rounded-2xl shadow-lg inline-flex items-center justify-center gap-2"
                      >
                        Boshqa video tanlash
                      </button>
                    </div>
                  </div>
                );
              }

              if (isContentBlocked) {
                return (
                  <div className="glass-card rounded-[28px] p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-rose-500/20 shadow-2xl relative overflow-hidden min-h-[360px]">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 mx-auto shadow-inner">
                      <ShieldAlert className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full">
                        Cheklov
                      </span>
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white pt-1">
                        Ushbu video dublyaj qilinmaydi
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        {job.error_message || "Video xavfsizlik va kontent siyosatimiz talablariga mos kelmagani sababli to'xtatildi."}
                      </p>
                    </div>

                    <div className="pt-2 max-w-xs w-full">
                      <button
                        onClick={handleGoHome}
                        className="btn-premium w-full py-3 px-5 text-xs font-bold rounded-2xl shadow-lg inline-flex items-center justify-center gap-2"
                      >
                        Boshqa video tanlash
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="glass-card rounded-[28px] p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-gray-200/60 dark:border-white/10 shadow-2xl relative overflow-hidden min-h-[360px]">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 text-blue-500 mx-auto shadow-inner">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div className="space-y-2 max-w-md mx-auto">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full">
                      Xatolik
                    </span>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white pt-1">
                      Kutilmagan xatolik yuz berdi
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      {getFriendlyErrorMessage(job.error_code, job.error_message)}
                    </p>
                  </div>
                  {job.fallback_available && (
                    <div className="max-w-md w-full">
                      <UploadRecoveryPrompt jobId={id} />
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2 max-w-sm w-full">
                    <button
                      onClick={handleRetry}
                      disabled={retryLoading}
                      className="btn-premium flex-1 py-3 px-5 text-xs font-bold rounded-2xl shadow-lg inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${retryLoading ? 'animate-spin' : ''}`} />
                      Qayta urinish
                    </button>
                    <button
                      onClick={handleGoHome}
                      className="glass-input flex-1 py-3 px-5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-2xl transition border border-gray-200/60 dark:border-white/10"
                    >
                      Bosh sahifa
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div className="glass-card rounded-[28px] p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-gray-200/60 dark:border-white/10 shadow-2xl relative overflow-hidden min-h-[380px]">
                <div className="space-y-5 max-w-md w-full z-10">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 mx-auto shadow-inner">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>

                  <div className="space-y-3">
                    <p className="text-gray-900 dark:text-white font-bold text-lg sm:text-xl">
                      {job.status_message || 'Qayta ishlanmoqda...'}
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                        <span>Jarayon</span>
                        <span className="text-violet-600 dark:text-violet-400 font-bold tabular-nums">
                          {Math.round(job.progress || 0)}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500 transition-[width] duration-700 ease-out shadow-sm"
                          style={{ width: `${Math.max(3, Math.min(100, job.progress || 0))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {job.expected_end_time && (
                    <div className="glass-input rounded-2xl p-4 text-xs space-y-1.5 border border-gray-200/60 dark:border-white/10">
                      <p className="font-semibold text-gray-500 dark:text-gray-400">Taxminiy yakunlanish vaqti:</p>
                      <p className="text-gray-900 dark:text-white font-mono text-base font-bold">
                        {formatTashkentTime(job.expected_end_time)}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
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
                      className="glass-input hover:text-red-600 dark:hover:text-red-400 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition duration-200 disabled:opacity-50 border border-gray-200/60 dark:border-white/10"
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
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 leading-snug">
                  {job.video_title || "Noma'lum video"}
                </h1>
                <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400 text-sm">
                  {job.video_duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDuration(job.video_duration)}
                    </span>
                  )}
                  {job.speaker_gender && (
                    <span className="flex items-center gap-1.5 font-medium">
                      <Mic2 className="w-4 h-4 text-violet-600 dark:text-indigo-400" />
                      {(() => {
                        const prov = (job.tts_provider || 'azure').toLowerCase();
                        const provLabel = prov === 'gemini' ? 'GapirAI HD' : prov === 'edge' ? 'Standart' : 'Neural HD';
                        const voiceName = (job.voice_name || (prov === 'gemini' ? (job.speaker_gender === 'female' ? 'Autonoe' : 'Charon') : (job.speaker_gender === 'female' ? 'Madina' : 'Sardor'))).replace('uz-UZ-', '').replace('Neural', '');
                        return `${job.speaker_gender === 'female' ? 'Ayol ovozi' : 'Erkak ovozi'} (${voiceName} • ${provLabel})`;
                      })()}
                    </span>
                  )}
                </div>
              </div>

              {job.status === 'completed' && job.content_flagged && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 leading-relaxed">
                    Video tayyor va shaxsiy foydalanish uchun mavjud. Ammo kontent siyosatimizga ko'ra
                    (diniy, 18+, zo'ravonlik yoki shunga o'xshash kategoriya) bunday videolarni
                    keyingi safar yubormaslikni so'raymiz.
                  </p>
                </div>
              )}

              {/* Download & Feedback */}
              {job.status === 'completed' && (
                <div className="space-y-6 pt-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card border border-gray-200/60 dark:border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg">
                    <div className="space-y-2">
                      <span className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                        Videoni yuklab olish
                      </span>
                      <ResolutionDownloadButtons jobId={id} videoTitle={job.video_title} />
                    </div>

                    <div className="pt-2 sm:pt-0 sm:border-l sm:border-gray-200/60 dark:sm:border-white/10 sm:pl-5 flex flex-col justify-center">
                      <button
                        onClick={() => setShowRegenerateModal(true)}
                        disabled={retryLoading || regenLoading}
                        className="btn-premium inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs text-white shadow-lg shadow-violet-500/25 transition duration-200 active:scale-95 whitespace-nowrap cursor-pointer"
                        title="Videoni yangi sozlamalar bilan qayta yaratish"
                      >
                        <RotateCw className={`w-4 h-4 ${regenLoading ? 'animate-spin' : ''}`} />
                        <span>Qayta yaratish (Regenerate)</span>
                      </button>
                    </div>
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
                <div className="glass-card border border-gray-200/60 dark:border-white/10 rounded-[24px] overflow-hidden shadow-lg">
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="w-full flex items-center justify-between px-5 py-4 text-gray-900 dark:text-white font-bold hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition"
                  >
                    <span>O&apos;zbek tilidagi matn</span>
                    <div className="flex items-center gap-3">
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(job.translated_text || '')
                          setIsCopied(true)
                          setTimeout(() => setIsCopied(false), 2000)
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center justify-center cursor-pointer"
                        title="Nusxa olish"
                      >
                        {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </div>
                      {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>
                  {showTranscript && (
                    <div className="px-5 pb-5">
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">{job.translated_text}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Subtitles accordion */}
              {job.uzbek_srt_content && (
                <div className="glass-card border border-gray-200/60 dark:border-white/10 rounded-[24px] overflow-hidden shadow-lg">
                  <div
                    onClick={() => setShowSrt(!showSrt)}
                    className="w-full flex items-center justify-between px-5 py-4 text-gray-900 dark:text-white font-bold hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span>O&apos;zbekcha subtitrlar</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-mono font-bold">SRT</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const blob = new Blob([job.uzbek_srt_content || ''], { type: 'text/plain;charset=utf-8' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `subtitles_${id.slice(0, 8)}.srt`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                        className="p-1.5 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center gap-1 text-xs cursor-pointer font-semibold"
                        title="SRT faylini yuklab olish"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Yuklab olish</span>
                      </button>
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(job.uzbek_srt_content || '')
                          setIsSrtCopied(true)
                          setTimeout(() => setIsSrtCopied(false), 2000)
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center justify-center cursor-pointer"
                        title="Nusxa olish"
                      >
                        {isSrtCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </div>
                      {showSrt ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                  {showSrt && (
                    <div className="px-5 pb-5">
                      <div className="bg-gray-100 dark:bg-black/40 border border-gray-200/60 dark:border-white/5 rounded-2xl p-4 max-h-80 overflow-y-auto font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {job.uzbek_srt_content}
                      </div>
                    </div>
                  )}
                </div>
              )}


              {/* Donate CTA */}
              {job.status === 'completed' && (
                <DonateCTA variant="line" className="pt-2" />
              )}

              {/* Sidebar info shown below in theater mode */}
              {theaterMode && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
                  <div className="glass-card border border-gray-200/60 dark:border-white/10 rounded-[24px] p-5 space-y-3.5 shadow-lg">
                    <InfoRow label="Holat" value={getStatusLabel(job.status, job.error_code, job.error_message)} />
                    {job.video_duration && <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} />}
                    {job.speaker_gender && (
                      <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? '👩 Ayol' : '👨 Erkak'} />
                    )}
                    {job.tts_provider && (
                      <InfoRow label="Ovoz dvigateli" value={job.tts_provider.toLowerCase() === 'gemini' ? '✨ GapirAI HD' : job.tts_provider.toLowerCase() === 'edge' ? '⚡ Standart' : '🔷 Neural HD'} />
                    )}
                    {job.voice_name && (
                      <InfoRow label="Ovoz egasi" value={job.voice_name.replace('uz-UZ-', '').replace('Neural', '')} />
                    )}
                    {job.created_at && (
                      <InfoRow label="Yuborilgan" value={formatTashkentDateTime(job.created_at)} />
                    )}
                    {job.uzbek_srt_content && <InfoRow label="Subtitr" value="✅ Mavjud (To'liq matn pastda)" />}
                  </div>
                  {job.transcript_text && (
                    <div className="glass-card border border-gray-200/60 dark:border-white/10 rounded-[24px] p-5 shadow-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">{getSourceLangLabel(job.source_language)}</p>
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(job.transcript_text || '')
                            setIsEnCopied(true)
                            setTimeout(() => setIsEnCopied(false), 2000)
                          }}
                          className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                          title="Nusxa olish"
                        >
                          {isEnCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                      <p className={`text-gray-600 dark:text-gray-300 text-sm leading-relaxed ${expandSourceText ? '' : 'line-clamp-6'}`}>{job.transcript_text}</p>
                      {job.transcript_text.length > 240 && (
                        <button
                          type="button"
                          onClick={() => setExpandSourceText(!expandSourceText)}
                          className="mt-2 text-xs text-violet-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer transition"
                        >
                          {expandSourceText ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              <span>Qisqartirish</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span>To&apos;liq matnni ko&apos;rish</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar (only in default mode) */}
          {!theaterMode && (
            <div className="space-y-4">
              <h2 className="text-gray-900 dark:text-white font-bold text-base">Video ma&apos;lumotlari</h2>
              <div className="glass-card border border-gray-200/60 dark:border-white/10 rounded-[24px] p-5 space-y-3.5 shadow-xl">
                <InfoRow label="Holat" value={getStatusLabel(job.status, job.error_code, job.error_message)} />
                {job.video_duration && <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} />}
                {job.speaker_gender && (
                  <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? '👩 Ayol' : '👨 Erkak'} />
                )}
                {job.tts_provider && (
                  <InfoRow label="Ovoz dvigateli" value={job.tts_provider.toLowerCase() === 'gemini' ? '✨ GapirAI HD' : job.tts_provider.toLowerCase() === 'edge' ? '⚡ Standart' : '🔷 Neural HD'} />
                )}
                {job.voice_name && (
                  <InfoRow label="Ovoz egasi" value={job.voice_name.replace('uz-UZ-', '').replace('Neural', '')} />
                )}
                {job.created_at && (
                  <InfoRow label="Yuborilgan" value={formatTashkentDateTime(job.created_at)} />
                )}
                {job.uzbek_srt_content && (
                  <InfoRow label="Subtitr" value="✅ Mavjud (To'liq matn pastda)" />
                )}

                {/* Admin-only AI models breakdown */}
                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-amber-500/20 bg-amber-500/5 -mx-5 -mb-5 p-4 rounded-b-[24px] space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-500 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <span>🛠</span> AI Modellar (Admin)
                      </span>
                      <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full text-amber-600 dark:text-amber-300 font-mono font-bold">
                        ADMIN
                      </span>
                    </div>
                    <InfoRow label="STT Dvigateli" value={job.stt_model || '— (eski job)'} />
                    <InfoRow label="Tarjima Modeli" value={job.translation_model || '— (eski job)'} />
                    <InfoRow
                      label="TTS Modeli"
                      value={
                        job.tts_model ||
                        (job.tts_provider === 'gemini'
                          ? `gemini-3.8-flash-tts (${job.voice_name || 'Charon'})`
                          : job.tts_provider === 'edge'
                          ? `edge-tts (${job.voice_name || 'uz-UZ-SardorNeural'})`
                          : (job.tts_provider === 'azure' || (job.voice_name && String(job.voice_name).includes('Neural'))
                          ? `azure-neural (${job.voice_name || 'uz-UZ-SardorNeural'})`
                          : '— (eski job)'))
                      }
                    />
                  </div>
                )}
              </div>

              {job.transcript_text && (
                <div className="glass-card border border-gray-200/60 dark:border-white/10 rounded-[24px] p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">{getSourceLangLabel(job.source_language)}</p>
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(job.transcript_text || '')
                        setIsEnCopied(true)
                        setTimeout(() => setIsEnCopied(false), 2000)
                      }}
                      className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                      title="Nusxa olish"
                    >
                      {isEnCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                  <p className={`text-gray-600 dark:text-gray-300 text-sm leading-relaxed ${expandSourceText ? '' : 'line-clamp-6'}`}>{job.transcript_text}</p>
                  {job.transcript_text.length > 240 && (
                    <button
                      type="button"
                      onClick={() => setExpandSourceText(!expandSourceText)}
                      className="mt-2 text-xs text-violet-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      {expandSourceText ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Qisqartirish</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>To&apos;liq matnni ko&apos;rish</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Regenerate Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-card border border-gray-200/60 dark:border-white/10 rounded-[28px] max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/25">
                  <RotateCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Qayta yaratish (Regenerate)</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Yangi ovoz yoki dvigatel bilan qayta dublyaj</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegenerateModal(false)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notice info */}
            <div className="glass-input border border-gray-200/60 dark:border-white/10 rounded-2xl p-4 text-xs text-gray-600 dark:text-gray-300 space-y-2 relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Video davomiyligi:</span>
                <span className="text-gray-900 dark:text-white font-semibold">{job.video_duration ? formatDuration(job.video_duration) : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Balansdan yechiladigan daqiqa:</span>
                <span className="text-amber-500 font-bold font-mono text-sm">
                  {isAdmin ? "0 daqiqa (Admin — bepul)" : `~${Math.max(1, Math.ceil((job.video_duration || 60) / 60))} daqiqa`}
                </span>
              </div>
              <div className="pt-2 border-t border-gray-200/60 dark:border-white/10 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                💡 Matnlar va tarjima saqlanadi. Faqat audio ovoz yangidan toza generatsiya qilinadi va video qayta birlashtiriladi (~1 daqiqa).
              </div>
            </div>

            {/* Form Controls: Gender */}
            <div className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-violet-600 dark:text-indigo-400 uppercase tracking-wider">
                  Ovoz jinsi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'male', label: '👨 Erkak ovozi', name: 'Charon' },
                    { id: 'female', label: '👩 Ayol ovozi', name: 'Autonoe' },
                  ].map((g) => {
                    const active = regenGender === g.id
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setRegenGender(g.id as any)}
                        className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-sm transition-all ${
                          active
                            ? "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300 font-bold ring-2 ring-violet-500/30 shadow-lg shadow-violet-500/10"
                            : "border-gray-200/80 dark:border-white/10 glass-input hover:border-gray-300 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <span>{g.label}</span>
                        <span className="text-xs text-violet-600 dark:text-indigo-300 font-mono">({g.name})</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 relative z-10">
              <button
                type="button"
                onClick={() => setShowRegenerateModal(false)}
                className="glass-input px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-200/60 dark:border-white/10 transition"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleRegenerateSubmit}
                disabled={regenLoading}
                className="btn-premium inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg shadow-violet-500/25 transition active:scale-95 disabled:opacity-50"
              >
                {regenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                <span>Tasdiqlash va qayta yaratish</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-900 dark:text-white font-semibold text-right">{value}</span>
    </div>
  )
}
