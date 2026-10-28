'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/home/SiteHeader'
import Footer from '@/components/Footer'
import { getJob, Job, formatDuration, getVideoUrl, getAudioUrl, getCapcutPackageUrl, initiateClickPayment, initiatePaymePayment, clearJobId, cancelJob, retryJob, createAnalysis, saveAnalysisId } from '@/lib/api'
import UploadRecoveryPrompt from '@/components/UploadRecoveryPrompt'
import { useJobPolling } from '@/hooks/useJobPolling'
import { useAuth } from '@/hooks/useAuth'
import {
  ArrowLeft, ArrowRight, Youtube, ChevronDown, ChevronUp,
  Mic2, Clock, Loader2, CreditCard, AlertTriangle, Copy, Check, RotateCw,
  MicOff, ShieldAlert, X, CircleSlash, Download, Sparkles, Gift
} from 'lucide-react'
import VideoPlayer from '@/components/VideoPlayer'
import FeedbackSection from '@/components/FeedbackSection'
import ResolutionDownloadButtons from '@/components/ResolutionDownloadButtons'
import DonateCTA from '@/components/DonateCTA'
import ConfirmModal from '@/components/ConfirmModal'
import FirstVideoDiscountModal from '@/components/FirstVideoDiscountModal'
import { formatTashkentDateTime, formatTashkentTime, parseApiDate } from '@/lib/timestamp'

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

function getElapsedSeconds(job?: Job | null, currentTime?: number, sessionStartTime?: number): number {
  if (!job) return 0
  const now = currentTime || Date.now()

  // 1. Agar updated_at mavjud bo'lsa va 1 soatdan kam vaqt oldin bo'lsa:
  if (job.updated_at) {
    const upd = parseApiDate(job.updated_at)?.getTime() ?? 0
    const diffUpd = (now - upd) / 1000
    if (upd > 0 && diffUpd >= 0 && diffUpd < 3600) {
      return Math.floor(diffUpd)
    }
  }

  // 2. created_at tekshiruvi:
  if (job.created_at) {
    const start = parseApiDate(job.created_at)?.getTime() ?? 0
    const diff = (now - start) / 1000
    // Agar yaratilganiga 1 soatdan ko'p bo'lmagan bo'lsa, created_at'dan hisoblaymiz:
    if (start > 0 && diff >= 0 && diff < 3600) {
      return Math.floor(diff)
    }
  }

  // 3. Agar video bir necha kun/soat oldin yaratilgan bo'lib, hozir qayta ishlanayotgan bo'lsa:
  // noo'rin 9869:29 ko'rinmasligi uchun joriy sahifa sessiyasi / retry boshlangan vaqtdan hisoblanadi!
  if (sessionStartTime) {
    const sessionDiff = Math.floor((now - sessionStartTime) / 1000)
    return Math.max(0, sessionDiff)
  }

  return 0
}

function formatElapsedTimer(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getActivePipelineStage(job: Job): {
  stageIndex: number;
  icon: string;
  badgeLabel: string;
} {
  const status = job.status?.toLowerCase() || '';
  const progress = job.progress || 0;

  if (status === 'pending' || status === 'downloading' || progress < 15) {
    return { stageIndex: 0, icon: '', badgeLabel: "Yuklanmoqda" };
  }
  if (status === 'transcribing' || status === 'translating' || status === 'syncing' || progress < 50) {
    return { stageIndex: 1, icon: '', badgeLabel: "Matn tayyorlanmoqda" };
  }
  if (status === 'synthesizing' || progress < 85) {
    return { stageIndex: 2, icon: '', badgeLabel: "Ovoz yozilmoqda" };
  }
  return { stageIndex: 3, icon: '', badgeLabel: "Montaj qilinmoqda" };
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
  if (
    errorCode === 'AUTH_ERROR' ||
    errorMessage?.toLowerCase().includes('bot') ||
    errorMessage?.toLowerCase().includes('sign in') ||
    errorMessage?.toLowerCase().includes('ruxsat')
  ) {
    return "YouTube bot himoyasi yoki yosh cheklovi sababli videoni avtomatik yuklab bo'lmadi. Videoni fayl sifatida yuklashingiz mumkin."
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
  if (status === 'completed') return 'Tayyor'
  if (status === 'failed') {
    const isCancelled = errorCode === 'USER_CANCELLED' || 
      errorMessage?.toLowerCase().includes('user cancelled') || 
      errorMessage?.toLowerCase().includes('bekor qilindi')
    if (isCancelled) return 'Bekor qilindi'

    const isNoSpeech = errorCode === 'NO_SPEECH_FOUND' || errorMessage?.toLowerCase().includes('nutq topilmadi')
    const isContentBlocked = errorCode === 'CONTENT_BLOCKED' || errorMessage?.toLowerCase().includes('kontent siyosati') || errorMessage?.toLowerCase().includes('taqiqlangan')
    if (isNoSpeech) return 'Nutq topilmadi'
    if (isContentBlocked) return 'Rad etildi'
    return 'Bajarilmadi'
  }
  switch (status) {
    case 'pending': return 'Navbatda'
    case 'awaiting_payment': return 'To\'lov kutilmoqda'
    case 'downloading': return 'Yuklanmoqda'
    case 'transcribing': return 'Matnga aylantirilmoqda'
    case 'translating': return 'Tarjima qilinmoqda'
    case 'syncing': return 'Moslashtirilmoqda'
    case 'synthesizing': return 'Ovozlashtirilmoqda'
    case 'merging': return 'Birlashtirilmoqda'
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
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [retryLoading, setRetryLoading] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [regenProvider, setRegenProvider] = useState<'gemini' | 'edge' | 'azure'>('gemini')
  const [regenGender, setRegenGender] = useState<'male' | 'female'>('male')
  const [regenLoading, setRegenLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const sessionStartRef = useRef<number>(Date.now())
  const [isCopied, setIsCopied] = useState(false)
  const [isEnCopied, setIsEnCopied] = useState(false)
  const prevStatusRef = useRef<string | undefined>(undefined)
  const paidAmountRef = useRef<number | null>(null)
  const paymentIdRef = useRef<string | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [hasDismissedDiscount, setHasDismissedDiscount] = useState(false)
  const [userEmailCopied, setUserEmailCopied] = useState(false)

  const handleStartAnalysis = async () => {
    if (job?.linked_analysis_id) {
      router.push(`/video-analysis/${job.linked_analysis_id}`)
      return
    }
    if (!job?.youtube_url && !job?.id) return
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)
      return
    }
    setAnalysisLoading(true)
    setAnalysisError(null)
    try {
      const { analysis_id } = await createAnalysis(job.youtube_url || `upload://${job.id}`, 'uz', job.id)
      saveAnalysisId(analysis_id)
      router.push(`/video-analysis/${analysis_id}`)
    } catch (err: any) {
      setAnalysisError(err?.response?.data?.detail || "Tahlilni boshlashda xatolik yuz berdi. Qayta urinib ko'ring.")
      setAnalysisLoading(false)
    }
  }

  const job = polledJob
  // Egasi bo'lmagan tomoshabin (ommaviy video yoki ulashilgan havola) -- qayta yaratish/baholash ko'rinmaydi
  const canManage = Boolean(job?.viewer_is_owner) || isAdmin

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

  useEffect(() => {
    if (job?.status === 'completed' && job?.discount_offer?.active) {
      const storageKey = `dismissed_discount_${job.job_id || id}`
      const isDismissed = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null
      if (!isDismissed && !hasDismissedDiscount) {
        const timer = setTimeout(() => {
          setShowDiscountModal(true)
        }, 2000)
        return () => clearTimeout(timer)
      }
    }
  }, [job?.status, job?.discount_offer?.active, job?.job_id, id, hasDismissedDiscount])

  const handleCloseDiscountModal = () => {
    setShowDiscountModal(false)
    setHasDismissedDiscount(true)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`dismissed_discount_${job?.job_id || id}`, '1')
    }
  }

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

  const handleOpenCancel = () => {
    setConfirmCancelOpen(true)
  }

  const handleExecuteCancel = async () => {
    if (!id) return
    setCancelLoading(true)
    try {
      const res = await cancelJob(id)
      if (res.success) {
        setConfirmCancelOpen(false)
        window.location.reload()
      } else {
        setToast({ type: 'error', message: res.message || "Bekor qilishda xatolik yuz berdi." })
        setConfirmCancelOpen(false)
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err?.response?.data?.detail || "Bekor qilishda xatolik yuz berdi." })
      setConfirmCancelOpen(false)
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
      <>
        <SiteHeader />
        <main id="main" className="flex min-h-[70vh] items-center justify-center bg-ui-surface px-4" role="status">
          <div className="flex items-center gap-3 text-[15px] text-ui-muted">
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
            Video maʼlumotlari ochilmoqda...
          </div>
        </main>
      </>
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
    <>
    <SiteHeader />
    <main id="main" tabIndex={-1} className="min-h-screen bg-ui-surface text-ui-ink focus:outline-none">
      {!theaterMode && (
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <button
            type="button"
            onClick={() => router.push(job.viewer_is_owner === false ? '/videos' : '/dashboard')}
            className="inline-flex items-center gap-1.5 text-sm text-ui-muted transition hover:text-ui-ink"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {job.viewer_is_owner === false ? 'Ommaviy videolar' : 'Mening videolarim'}
          </button>
        </div>
      )}

      {/* Toast Alert */}
      {toast && (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <div
            role={toast.type === "error" ? "alert" : "status"}
            className={`flex items-center justify-between gap-3 rounded-control border px-4 py-3 ${
              toast.type === "error"
                ? "border-ui-red/30 bg-ui-red/[0.05] text-ui-red-ink"
                : "border-ui-green/30 bg-ui-green/[0.06] text-ui-green-ink"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button type="button" onClick={() => setToast(null)} aria-label="Yopish" className="rounded-lg p-1.5 text-ui-muted transition hover:bg-ui-ground hover:text-ui-ink">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className={theaterMode ? 'w-full' : 'max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8'}>
        <div className={theaterMode
          ? 'flex flex-col gap-0'
          : 'grid grid-cols-1 lg:grid-cols-3 gap-8'
        }>
          {/* Player */}
          <div className={theaterMode ? 'w-full' : 'lg:col-span-2 space-y-4'}>
            {job.status === 'completed' ? (
              <div className="space-y-4">
                {/* 10% First Video Welcome Discount Banner */}
                {job.discount_offer?.active && (
                  <div className="flex flex-col items-start justify-between gap-3 rounded-control border border-amber-500/30 bg-amber-500/[0.07] p-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <Gift aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ui-ink">
                            10% chegirma
                          </span>
                          <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                            24 soat
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-ui-muted">
                          Ilk videongiz tayyor bo&apos;ldi! Barcha paketlar va tariflarga 10% chegirmadan foydalaning.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDiscountModal(true)}
                      className="ui-btn ui-btn-primary w-full shrink-0 sm:w-auto"
                    >
                      Chegirmani olish
                    </button>
                  </div>
                )}

                {job.is_preview && (
                  <div className="flex flex-col items-start justify-between gap-3 rounded-control border border-ui-rule bg-ui-ground p-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ui-accent-ink">
                          2 daqiqalik bepul sinov dublyaji tayyor
                        </div>
                        <div className="text-xs text-ui-muted">
                          Ovoz sifati ma'qul keldimi? Butun videoni to'liq dublyaj qilish uchun tarifingizni faollashtiring.
                        </div>
                      </div>
                    </div>
                    <Link
                      href="/pricing"
                      className="btn-premium px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 self-end sm:self-auto"
                    >
                      To'liq ochish (Tariflar) →
                    </Link>
                  </div>
                )}
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
              </div>
            ) : job.status === 'awaiting_payment' ? (
              <div className="glass-card rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-ui-rule relative overflow-hidden min-h-[380px]">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 text-ui-accent-ink mx-auto ">
                  <CreditCard className="w-8 h-8 animate-pulse" />
                </div>

                <div className="space-y-2 max-w-md mx-auto">
                  <span className="text-xs font-semibold text-ui-accent-ink bg-blue-500/10 px-3 py-1 rounded-full">
                    Obuna kerak
                  </span>
                  <h2 className="text-xl sm:text-2xl font-semibold text-ui-ink pt-1">Tarif reja talab etiladi</h2>
                  <p className="text-sm text-ui-muted leading-relaxed">
                    Ushbu video 45 daqiqadan uzun ({job.video_duration ? formatDuration(job.video_duration) : ''}).
                    Katta hajmli videolarni to&apos;liq dublyaj qilish uchun tarif rejalaridan biriga obuna bo&apos;ling.
                  </p>
                </div>

                {paymentError && (
                  <div className="text-xs font-semibold text-ui-red-ink bg-red-500/10 border border-red-500/20 rounded-2xl p-3.5 max-w-md w-full text-center">
                    {paymentError}
                  </div>
                )}

                <div className="max-w-md w-full space-y-4 pt-1">
                  <Link
                    href="/pricing"
                    className="btn-premium w-full py-3.5 px-6 rounded-2xl font-semibold text-sm inline-flex items-center justify-center gap-2"
                  >
                    Tarif rejalarini ko&apos;rish
                  </Link>

                  <div className="border-t border-ui-rule pt-4 space-y-2.5">
                    <p className="text-xs text-ui-muted">
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
                      className="text-xs font-semibold text-ui-muted hover:text-gray-900 dark:hover:text-white transition"
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
                  <div className="glass-card rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-ui-rule relative overflow-hidden min-h-[360px]">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-500/10 text-ui-muted mx-auto ">
                      <CircleSlash className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="text-xs font-semibold text-ui-muted bg-slate-500/10 px-3 py-1 rounded-full">
                        Bekor qilindi
                      </span>
                      <h3 className="text-xl sm:text-2xl font-semibold text-ui-ink pt-1">
                        Dublyaj jarayoni to&apos;xtatildi
                      </h3>
                      <p className="text-sm text-ui-muted leading-relaxed">
                        Ushbu video uchun jarayon bekor qilindi. Istalgan vaqtda qaytadan boshlashingiz mumkin.
                      </p>
                    </div>

                    <div className="glass-input text-xs text-ui-muted rounded-2xl px-4 py-2.5 text-center flex items-center justify-center gap-2 border border-ui-rule max-w-md">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                      <span>Jarayon yakunlanmagani sababli daqiqalaringiz sarflanmadi</span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2 max-w-sm w-full">
                      <button
                        onClick={handleRetry}
                        disabled={retryLoading}
                        className="btn-premium flex-1 py-3 px-5 text-xs font-semibold rounded-2xl inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${retryLoading ? 'animate-spin' : ''}`} />
                        Qaytadan boshlash
                      </button>
                      <button
                        onClick={handleGoHome}
                        className="glass-input flex-1 py-3 px-5 text-xs font-semibold text-ui-muted hover:text-gray-900 dark:hover:text-white rounded-2xl transition border border-ui-rule"
                      >
                        Bosh sahifa
                      </button>
                    </div>
                  </div>
                );
              }

              if (isNoSpeech) {
                return (
                  <div className="glass-card rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-amber-500/20 relative overflow-hidden min-h-[360px]">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 mx-auto ">
                      <MicOff className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full">
                        Ovoz aniqlanmadi
                      </span>
                      <h3 className="text-xl sm:text-2xl font-semibold text-ui-ink pt-1">
                        Videoda nutq topilmadi
                      </h3>
                      <p className="text-sm text-ui-muted leading-relaxed">
                        Ushbu videoda inson nutqi yoki suhbat aniqlanmadi. Dublyaj faqat ovozli nutq mavjud bo&apos;lgan videolarni tarjima qiladi.
                      </p>
                    </div>

                    <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 text-left flex items-start gap-2.5 max-w-md">
                      <span className="text-sm select-none"></span>
                      <span>Musiqa yoki ovozsiz roliklar o&apos;rniga, gapirilgan nutq (ma&apos;ruza, intervyu, darslik) bor videoni tanlang.</span>
                    </div>

                    <div className="pt-2 max-w-xs w-full">
                      <button
                        onClick={handleGoHome}
                        className="btn-premium w-full py-3 px-5 text-xs font-semibold rounded-2xl inline-flex items-center justify-center gap-2"
                      >
                        Boshqa video tanlash
                      </button>
                    </div>
                  </div>
                );
              }

              if (isContentBlocked) {
                return (
                  <div className="glass-card rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-rose-500/20 relative overflow-hidden min-h-[360px]">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 mx-auto ">
                      <ShieldAlert className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full">
                        Cheklov
                      </span>
                      <h3 className="text-xl sm:text-2xl font-semibold text-ui-ink pt-1">
                        Ushbu video dublyaj qilinmaydi
                      </h3>
                      <p className="text-sm text-ui-muted leading-relaxed">
                        {job.error_message || "Video xavfsizlik va kontent siyosatimiz talablariga mos kelmagani sababli to'xtatildi."}
                      </p>
                    </div>

                    <div className="pt-2 max-w-xs w-full">
                      <button
                        onClick={handleGoHome}
                        className="btn-premium w-full py-3 px-5 text-xs font-semibold rounded-2xl inline-flex items-center justify-center gap-2"
                      >
                        Boshqa video tanlash
                      </button>
                    </div>
                  </div>
                );
              }

              const isYouTubeRestricted =
                job.error_code === 'AUTH_ERROR' ||
                job.error_code === 'DOWNLOAD_FAILED' ||
                job.error_code === 'HTTP_403' ||
                job.error_code === 'PO_TOKEN_REQUIRED' ||
                job.error_message?.toLowerCase().includes('bot') ||
                job.error_message?.toLowerCase().includes('sign in') ||
                job.error_message?.toLowerCase().includes('ruxsat');

              if (isYouTubeRestricted) {
                return (
                  <div className="glass-card rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center text-center space-y-6 border border-amber-500/30 dark:border-amber-500/20 relative overflow-hidden min-h-[400px]">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 mx-auto ">
                      <ShieldAlert className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full">
                        YouTube Cheklovi
                      </span>
                      <h3 className="text-xl sm:text-2xl font-semibold text-ui-ink pt-1">
                        Ushbu video YouTube himoyasi bilan cheklangan
                      </h3>
                      <p className="text-xs sm:text-sm text-ui-muted leading-relaxed">
                        Videoni to&apos;g&apos;ridan-to&apos;g&apos;ri fayl sifatida yuklab dublyajni davom ettirishingiz mumkin:
                      </p>
                    </div>

                    {/* Direct File Upload */}
                    <div className="max-w-md w-full">
                      <UploadRecoveryPrompt jobId={id} />
                    </div>

                    {/* Solution 2: Try a verified sample or retry */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-1 max-w-md w-full">
                      <button
                        onClick={handleGoHome}
                        className="btn-premium flex-1 py-3 px-5 text-xs font-semibold rounded-2xl inline-flex items-center justify-center gap-2"
                      >
                        🎬 Boshqa ochiq videoni sinash
                      </button>
                      <button
                        onClick={handleRetry}
                        disabled={retryLoading}
                        className="glass-input flex-1 py-3 px-5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-2xl transition border border-ui-rule inline-flex items-center justify-center gap-2"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${retryLoading ? 'animate-spin' : ''}`} />
                        Qayta urinish
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="glass-card rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 border border-ui-rule relative overflow-hidden min-h-[360px]">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 text-ui-accent-ink mx-auto ">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div className="space-y-2 max-w-md mx-auto">
                    <span className="text-xs font-semibold text-ui-accent-ink bg-blue-500/10 px-3 py-1 rounded-full">
                      Xatolik
                    </span>
                    <h3 className="text-xl sm:text-2xl font-semibold text-ui-ink pt-1">
                      Kutilmagan xatolik yuz berdi
                    </h3>
                    <p className="text-sm text-ui-muted leading-relaxed">
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
                      className="btn-premium flex-1 py-3 px-5 text-xs font-semibold rounded-2xl inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${retryLoading ? 'animate-spin' : ''}`} />
                      Qayta urinish
                    </button>
                    <button
                      onClick={handleGoHome}
                      className="glass-input flex-1 py-3 px-5 text-xs font-semibold text-ui-muted hover:text-gray-900 dark:hover:text-white rounded-2xl transition border border-ui-rule"
                    >
                      Bosh sahifa
                    </button>
                  </div>
                </div>
              );
            })() : (() => {
              const activeStage = getActivePipelineStage(job);
              const elapsedSec = getElapsedSeconds(job, currentTime, sessionStartRef.current);
              const isQueued = job.status === 'pending' || (job.progress || 0) <= 0;

              const stages = [
                { id: 0, label: "Yuklab olish", icon: "", desc: "Video serverga yuklanmoqda" },
                { id: 1, label: "Matn & Tarjima", icon: "", desc: "Nutq o'zbek tiliga o'girilmoqda" },
                { id: 2, label: "Ovoz yaratish", icon: "", desc: "Tabiiy o'zbekcha ovoz yozilmoqda" },
                { id: 3, label: "Montaj", icon: "", desc: "Video va ovoz birlashtirilmoqda" },
              ];

              return (
                <div className="ui-card flex min-h-[400px] flex-col items-center justify-center p-6 text-center sm:p-10">
                  <div className="space-y-6 max-w-lg w-full z-10">
                    {/* Yuqori xotirjam ko'rsatkich (Ko'zni charchatadigan aylanuvchi spinnerlarsiz) */}
                    <div className="flex items-center justify-between px-2 text-xs">
                      <div className="inline-flex items-center gap-2 rounded-full border border-ui-rule px-3 py-1.5 font-medium text-ui-ink">
                        <span className={`w-2 h-2 rounded-full ${isQueued ? 'bg-amber-400' : 'bg-emerald-500'} animate-pulse`} />
                        <span>{isQueued ? "Navbatda turibdi" : "Sun'iy intellekt ishlamoqda"}</span>
                      </div>
                      
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-ui-rule px-3 py-1.5 text-xs font-medium text-ui-muted tabular-nums">
                        <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>{formatElapsedTimer(elapsedSec)}</span>
                      </div>
                    </div>

                    {/* Markaziy xotirjam vizual belgi */}

                    <div className="space-y-2">
                      <h3 className="text-ui-ink font-semibold text-lg sm:text-xl leading-snug">
                        {job.status_message || (isQueued ? "Video navbatda kutilmoqda..." : "Video qayta ishlanmoqda...")}
                      </h3>
                      <p className="mx-auto max-w-sm text-sm leading-relaxed text-ui-muted">
                        Sahifani yopsangiz ham jarayon davom etadi — tayyor video &quot;Mening videolarim&quot; boʻlimida saqlanadi.
                      </p>
                    </div>

                    {/* Progress Bar & Status */}
                    <div className="space-y-2 text-left">
                      <div className="flex items-center justify-between text-xs text-ui-muted font-semibold tracking-wide">
                        <span className="font-medium text-ui-ink">
                          {isQueued ? "Tayyorgarlik" : `Bosqich ${activeStage.stageIndex + 1}/4: ${activeStage.badgeLabel}`}
                        </span>
                        {isQueued ? (
                          <span className="text-amber-500 font-semibold text-xs">
                            Tez orada boshlanadi
                          </span>
                        ) : (
                          <span className="text-ui-accent-ink font-semibold tabular-nums text-sm">
                            {Math.round(job.progress || 0)}%
                          </span>
                        )}
                      </div>

                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ui-ground">
                        {isQueued ? (
                          <div className="h-full w-full rounded-full bg-blue-500/20 relative overflow-hidden animate-pulse">
                            <div className="absolute inset-0 bg-transparent via-white/30 -translate-x-full animate-[shimmer_2s_infinite]" />
                          </div>
                        ) : (
                          <div
                            className="relative h-full overflow-hidden rounded-full bg-ui-accent transition-[width] duration-700 ease-out"
                            style={{ width: `${Math.max(5, Math.min(100, job.progress || 0))}%` }}
                          >
                            {/* Harakatlanuvchi jonli nur (shimmer animation) */}
                            <div className="absolute inset-0 bg-transparent via-white/40 -translate-x-full animate-[shimmer_2s_infinite]" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4 Bosqichli aniq xarita — "cheksiz" tuyg'usini yo'qotadi */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                      {stages.map((st) => {
                        const isDone = activeStage.stageIndex > st.id && !isQueued;
                        const isCurrent = activeStage.stageIndex === st.id && !isQueued;
                        return (
                          <div
                            key={st.id}
                            className={`flex flex-col justify-between rounded-control border p-2.5 text-xs transition-all ${
                              isDone
                              ? 'border-ui-rule text-ui-ink'
                              : isCurrent
                              ? 'border-ui-accent text-ui-ink shadow-[0_0_0_1px_rgb(var(--ui-accent))]'
                              : 'border-ui-rule text-ui-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              {isDone ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-ui-green-ink"><Check aria-hidden="true" className="h-3.5 w-3.5" /> Tayyor</span>
                              ) : isCurrent ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ui-accent-ink">
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ui-accent" />
                                  <span>Bajarilmoqda</span>
                                </span>
                              ) : (
                                <span className="text-xs text-ui-muted">Kutilmoqda</span>
                              )}
                            </div>
                            <div className="mt-1 line-clamp-1 text-[13px] font-medium leading-tight">{st.label}</div>
                          </div>
                        );
                      })}
                    </div>

                    {job.expected_end_time && !isQueued && (
                      <div className="glass-input rounded-2xl p-4 text-xs space-y-1 border border-ui-rule">
                        <div className="flex items-center justify-between text-ui-muted font-semibold">
                          <span>Taxminiy yakunlanish:</span>
                          <span className="text-ui-ink font-mono font-semibold">
                            {formatTashkentTime(job.expected_end_time)}
                          </span>
                        </div>
                        <p className="text-xs text-ui-muted font-medium">
                          {Math.ceil(((parseApiDate(job.expected_end_time)?.getTime() ?? currentTime) - currentTime) / 1000) <= 0
                            ? "(tez orada yakunlanadi...)"
                            : `(taxminan ${formatRemainingTime(Math.ceil(((parseApiDate(job.expected_end_time)?.getTime() ?? currentTime) - currentTime) / 1000))} qoldi)`}
                        </p>
                      </div>
                    )}

                    <div className="pt-1">
                      <button
                        onClick={handleOpenCancel}
                        disabled={cancelLoading}
                        className="glass-input hover:text-red-600 dark:hover:text-red-400 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition duration-200 disabled:opacity-50 border border-ui-rule"
                      >
                        {cancelLoading ? <span className="text-xs">...</span> : null}
                        Jarayonni bekor qilish
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Title & info (below player, padded in theater mode) */}
            <div className={theaterMode ? 'max-w-6xl mx-auto px-6 pt-6 space-y-4' : 'space-y-4'}>
              <div>
                <h1 className="text-lg sm:text-xl font-semibold text-ui-ink mb-2 leading-snug">
                  {job.video_title || "Noma'lum video"}
                </h1>
                <div className="flex items-center gap-4 text-ui-muted text-sm">
                  {job.video_duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDuration(job.video_duration)}
                    </span>
                  )}
                  {job.speaker_gender && (
                    <span className="flex items-center gap-1.5 font-medium">
                      <Mic2 className="w-4 h-4 text-ui-accent-ink" />
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

              {/* ── AI Video Tahlili Lead Magnet Banner ── */}
              {job.status === 'completed' && Boolean(job.youtube_url || job.linked_analysis_id) && (
                <div className="ui-card flex flex-col items-start justify-between gap-4 p-5 md:flex-row md:items-center">
                  <div className="max-w-xl space-y-1.5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-ui-ink">
                      <Sparkles aria-hidden="true" className="h-4 w-4 text-ui-accent-ink" /> Shu videoning tahlili
                    </h2>
                    <p className="text-sm leading-relaxed text-ui-muted">
                      Qisqa xulosa, 5 daqiqalik darslik, konspekt va bilimni mustahkamlash uchun test savollari. Daqiqa sarflamaydi.
                    </p>
                    {analysisError && (
                      <p className="text-xs font-semibold text-red-500 dark:text-red-400 pt-1">
                        {analysisError}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-2.5 shrink-0 w-full md:w-auto">
                    <button
                      onClick={handleStartAnalysis}
                      disabled={analysisLoading}
                      className="ui-btn ui-btn-primary w-full whitespace-nowrap md:w-auto"
                    >
                      {analysisLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Tahlil boshlanmoqda...</span>
                        </>
                      ) : job.linked_analysis_id ? (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Tayyor tahlilni ko&apos;rish</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Videoni tahlil qilish</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card border border-ui-rule rounded-2xl p-4 sm:p-5">
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-ui-muted">
                        Yuklab olish
                      </span>
                      <ResolutionDownloadButtons jobId={id} videoTitle={job.video_title} />
                      <a
                        href={getCapcutPackageUrl(id)}
                        download
                        className="inline-flex items-center gap-2 rounded-xl border border-ui-rule px-3.5 py-2.5 text-xs font-semibold text-ui-ink transition hover:bg-ui-ground sm:text-sm"
                        title="Oʻzbekcha ovoz (MP3), subtitr (SRT) va qoʻllanma — CapCut va boshqa montaj dasturlari uchun"
                      >
                        <Download aria-hidden="true" className="h-4 w-4" />
                        CapCut uchun: ovoz + subtitr
                        <span className="font-normal text-ui-muted">.zip</span>
                      </a>
                    </div>

                    {canManage && (
                    <div className="pt-2 sm:pt-0 sm:border-l sm:border-gray-200/60 dark:sm:border-white/10 sm:pl-5 flex flex-col justify-center">
                      <button
                        onClick={() => setShowRegenerateModal(true)}
                        disabled={retryLoading || regenLoading}
                        className="btn-premium inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-semibold text-xs text-white transition duration-200 active:scale-95 whitespace-nowrap cursor-pointer"
                        title="Videoni yangi sozlamalar bilan qayta yaratish"
                      >
                        <RotateCw className={`w-4 h-4 ${regenLoading ? 'animate-spin' : ''}`} />
                        <span>Qayta yaratish (Regenerate)</span>
                      </button>
                    </div>
                    )}
                  </div>

                  {/* Feedback rating component */}
                  {canManage && (
                    <FeedbackSection
                      jobId={id}
                      initialRating={job.rating}
                      initialComment={job.feedback_comment}
                    />
                  )}
                </div>
              )}

              {/* Translation accordion */}
              {job.translated_text && (
                <div className="glass-card border border-ui-rule rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="w-full flex items-center justify-between px-5 py-4 text-ui-ink font-semibold hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition"
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
                        className="p-1.5 text-ui-muted hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center justify-center cursor-pointer"
                        title="Nusxa olish"
                      >
                        {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </div>
                      {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>
                  {showTranscript && (
                    <div className="px-5 pb-5">
                      <p className="text-ui-muted text-sm leading-relaxed">{job.translated_text}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Subtitles accordion */}
              {job.uzbek_srt_content && (
                <div className="glass-card border border-ui-rule rounded-2xl overflow-hidden">
                  <div
                    onClick={() => setShowSrt(!showSrt)}
                    className="w-full flex items-center justify-between px-5 py-4 text-ui-ink font-semibold hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span>O&apos;zbekcha subtitrlar</span>
                      <span className="rounded-full border border-ui-rule px-2 py-0.5 font-mono text-xs font-medium text-ui-muted">SRT</span>
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
                        className="p-1.5 text-ui-muted hover:text-ui-green-ink dark:hover:text-emerald-400 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center gap-1 text-xs cursor-pointer font-semibold"
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
                        className="p-1.5 text-ui-muted hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center justify-center cursor-pointer"
                        title="Nusxa olish"
                      >
                        {isSrtCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </div>
                      {showSrt ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                  {showSrt && (
                    <div className="px-5 pb-5">
                      <div className="bg-gray-100 dark:bg-black/40 border border-ui-rule rounded-2xl p-4 max-h-80 overflow-y-auto font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
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
                  <div className="glass-card border border-ui-rule rounded-2xl p-5 space-y-3.5">
                    <InfoRow label="Holat" value={getStatusLabel(job.status, job.error_code, job.error_message)} />
                    {job.video_duration && <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} />}
                    {job.speaker_gender && (
                      <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? 'Ayol' : 'Erkak'} />
                    )}
                    {job.tts_provider && (
                      <InfoRow label="Ovoz dvigateli" value={job.tts_provider.toLowerCase() === 'gemini' ? 'GapirAI HD' : job.tts_provider.toLowerCase() === 'edge' ? 'Standart' : 'Neural HD'} />
                    )}
                    {job.voice_name && (
                      <InfoRow label="Ovoz egasi" value={job.voice_name.replace('uz-UZ-', '').replace('Neural', '')} />
                    )}
                    {job.created_at && (
                      <InfoRow label="Yuborilgan" value={formatTashkentDateTime(job.created_at)} />
                    )}
                    {job.uzbek_srt_content && <InfoRow label="Subtitr" value="Mavjud (To'liq matn pastda)" />}
                  </div>
                  {job.transcript_text && (
                    <div className="glass-card border border-ui-rule rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-ui-muted text-xs font-semibold">{getSourceLangLabel(job.source_language)}</p>
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(job.transcript_text || '')
                            setIsEnCopied(true)
                            setTimeout(() => setIsEnCopied(false), 2000)
                          }}
                          className="p-1 text-ui-muted hover:text-gray-900 dark:hover:text-white rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                          title="Nusxa olish"
                        >
                          {isEnCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                      <p className={`text-ui-muted text-sm leading-relaxed ${expandSourceText ? '' : 'line-clamp-6'}`}>{job.transcript_text}</p>
                      {job.transcript_text.length > 240 && (
                        <button
                          type="button"
                          onClick={() => setExpandSourceText(!expandSourceText)}
                          className="mt-2 text-xs text-ui-accent-ink hover:underline font-semibold flex items-center gap-1 cursor-pointer transition"
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
              <h2 className="text-ui-ink font-semibold text-base">Video ma&apos;lumotlari</h2>
              <div className="glass-card border border-ui-rule rounded-2xl p-5 space-y-3.5">
                <InfoRow label="Holat" value={getStatusLabel(job.status, job.error_code, job.error_message)} />
                {job.video_duration && <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} />}
                {job.speaker_gender && (
                  <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? 'Ayol' : 'Erkak'} />
                )}
                {job.tts_provider && (
                  <InfoRow label="Ovoz dvigateli" value={job.tts_provider.toLowerCase() === 'gemini' ? 'GapirAI HD' : job.tts_provider.toLowerCase() === 'edge' ? 'Standart' : 'Neural HD'} />
                )}
                {job.voice_name && (
                  <InfoRow label="Ovoz egasi" value={job.voice_name.replace('uz-UZ-', '').replace('Neural', '')} />
                )}
                {job.created_at && (
                  <InfoRow label="Yuborilgan" value={formatTashkentDateTime(job.created_at)} />
                )}
                {job.uzbek_srt_content && (
                  <InfoRow label="Subtitr" value="Mavjud (To'liq matn pastda)" />
                )}

              </div>

              {/* Admin-only Video Owner (User) Information Card */}
              {isAdmin && (
                <div className="glass-card border border-amber-500/30 rounded-2xl p-5 space-y-3.5 bg-amber-500/10 ">
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-500 ">
                    <span className="flex items-center gap-1.5">
                      <span></span> Video Egasi (Admin)
                    </span>
                    <span className="text-xs bg-amber-500/20 px-2 py-0.5 rounded-full text-amber-600 dark:text-amber-300 font-mono font-semibold">
                      ADMIN
                    </span>
                  </div>

                  {job.user_info ? (
                    job.user_info.anonymous ? (
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                        <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                          <span></span> Anonim Foydalanuvchi
                        </div>
                        <p className="mt-1.5 text-xs text-gray-300 leading-relaxed">
                          Ushbu video saytga kirmagan (tizimda ro&apos;yxatdan o&apos;tmagan) mehmon tomonidan bepul sinov sifatida yuborilgan.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        <InfoRow label="Ism-familiya" value={job.user_info.name || '—'} />
                        {job.user_info.email && (
                          <div className="flex items-center justify-between py-0.5 text-sm">
                            <span className="text-ui-muted text-xs">Email:</span>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`mailto:${job.user_info.email}`}
                                className="font-semibold text-blue-400 hover:underline text-xs"
                              >
                                {job.user_info.email}
                              </a>
                              <button
                                onClick={() => {
                                  if (job.user_info?.email) {
                                    navigator.clipboard.writeText(job.user_info.email)
                                    setUserEmailCopied(true)
                                    setTimeout(() => setUserEmailCopied(false), 2000)
                                  }
                                }}
                                title="Emailni nusxalash"
                                className="p-1 hover:bg-white/10 rounded text-ui-muted hover:text-white transition"
                              >
                                {userEmailCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                        )}
                        {job.user_info.phone && (
                          <div className="flex items-center justify-between py-0.5 text-sm">
                            <span className="text-ui-muted text-xs">Telefon:</span>
                            <a
                              href={`tel:${job.user_info.phone}`}
                              className="font-semibold text-emerald-400 font-mono hover:underline text-xs"
                            >
                              {job.user_info.phone}
                            </a>
                          </div>
                        )}
                        {job.user_info.telegram_chat_id && (
                          <InfoRow label="Telegram ID" value={job.user_info.telegram_chat_id} />
                        )}
                        <InfoRow
                          label="Tarif (Obuna)"
                          value={
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {job.user_info.plan || 'Free'}
                            </span>
                          }
                        />
                        {job.user_info.minutes && (
                          <div className="pt-2 border-t border-white/5 space-y-1 text-xs font-mono">
                            <div className="flex justify-between text-ui-muted">
                              <span>Mavjud balans:</span>
                              <span className="font-semibold text-emerald-400">{job.user_info.minutes.total_available} daq</span>
                            </div>
                            <div className="flex justify-between text-gray-500 text-xs">
                              <span>Sotib olingan (kuymas):</span>
                              <span>{job.user_info.minutes.purchased} daq</span>
                            </div>
                            <div className="flex justify-between text-gray-500 text-xs">
                              <span>Oylik qolgan:</span>
                              <span>{job.user_info.minutes.monthly_remaining} / {job.user_info.minutes.monthly_cap} daq</span>
                            </div>
                          </div>
                        )}
                        <div className="pt-2 border-t border-white/5 space-y-1">
                          <InfoRow
                            label="Jami videolari"
                            value={`${job.user_info.jobs_count ?? 0} ta (${job.user_info.completed_jobs_count ?? 0} tayyor)`}
                          />
                          <InfoRow
                            label="Jami to'lovlari (LTV)"
                            value={`~${(job.user_info.payments_total_uzs ?? 0).toLocaleString()} UZS (${job.user_info.payments_count ?? 0} ta)`}
                          />
                          {job.user_info.created_at && (
                            <InfoRow label="Ro'yxatdan o'tgan" value={formatTashkentDateTime(job.user_info.created_at)} />
                          )}
                          {job.user_info.last_active_at && (
                            <InfoRow label="Oxirgi faollik" value={formatTashkentDateTime(job.user_info.last_active_at)} />
                          )}
                          <InfoRow label="Kirish usuli" value={job.user_info.auth_provider || 'parol'} />
                        </div>
                        <div className="pt-2 mt-2 border-t border-white/10 flex justify-between items-center text-xs">
                          <span className="font-mono text-gray-500">ID: {job.user_info.id.slice(0, 8)}...</span>
                          <Link
                            href={`/admin?search=${encodeURIComponent(job.user_info.email || job.user_info.id)}`}
                            className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 hover:underline"
                          >
                            <span>Admin boshqaruvida ochish</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="text-xs text-ui-muted">Foydalanuvchi ma&apos;lumotlari yuklanmoqda...</div>
                  )}
                </div>
              )}

              {job.transcript_text && (
                <div className="glass-card border border-ui-rule rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-ui-muted text-xs font-semibold">{getSourceLangLabel(job.source_language)}</p>
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(job.transcript_text || '')
                        setIsEnCopied(true)
                        setTimeout(() => setIsEnCopied(false), 2000)
                      }}
                      className="p-1 text-ui-muted hover:text-gray-900 dark:hover:text-white rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                      title="Nusxa olish"
                    >
                      {isEnCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                  <p className={`text-ui-muted text-sm leading-relaxed ${expandSourceText ? '' : 'line-clamp-6'}`}>{job.transcript_text}</p>
                  {job.transcript_text.length > 240 && (
                    <button
                      type="button"
                      onClick={() => setExpandSourceText(!expandSourceText)}
                      className="mt-2 text-xs text-ui-accent-ink hover:underline font-semibold flex items-center gap-1 cursor-pointer transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200">
          <div className="glass-card border border-ui-rule rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg ">
                  <RotateCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ui-ink tracking-tight">Qayta yaratish (Regenerate)</h3>
                  <p className="text-xs text-ui-muted">Yangi ovoz yoki dvigatel bilan qayta dublyaj</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegenerateModal(false)}
                className="text-ui-muted hover:text-gray-900 dark:hover:text-white p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notice info */}
            <div className="glass-input border border-ui-rule rounded-2xl p-4 text-xs text-ui-muted space-y-2 relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-ui-muted">Video davomiyligi:</span>
                <span className="text-ui-ink font-semibold">{job.video_duration ? formatDuration(job.video_duration) : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ui-muted">Balansdan yechiladigan daqiqa:</span>
                <span className="text-amber-500 font-semibold font-mono text-sm">
                  {isAdmin ? "0 daqiqa (Admin — bepul)" : `~${Math.max(1, Math.ceil((job.video_duration || 60) / 60))} daqiqa`}
                </span>
              </div>
              <div className="pt-2 border-t border-ui-rule text-xs text-ui-muted leading-relaxed">
                💡 Matnlar va tarjima saqlanadi. Faqat audio ovoz yangidan toza generatsiya qilinadi va video qayta birlashtiriladi (~1 daqiqa).
              </div>
            </div>

            {/* Form Controls: Gender */}
            <div className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ui-accent-ink ">
                  Ovoz jinsi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'male', label: 'Erkak ovozi', name: 'Charon' },
                    { id: 'female', label: 'Ayol ovozi', name: 'Autonoe' },
                  ].map((g) => {
                    const active = regenGender === g.id
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setRegenGender(g.id as any)}
                        className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-sm transition-all ${
                          active
                          ? "border-blue-500 bg-blue-500/15 text-ui-accent-ink font-semibold ring-2 ring-blue-500/30 shadow-lg "
                          : "border-ui-rule glass-input hover:border-gray-300 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <span>{g.label}</span>
                        <span className="text-xs text-blue-600 dark:text-blue-300 font-mono">({g.name})</span>
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
                className="glass-input px-5 py-2.5 rounded-xl text-xs font-semibold text-ui-muted hover:text-gray-900 dark:hover:text-white border border-ui-rule transition"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleRegenerateSubmit}
                disabled={regenLoading}
                className="btn-premium inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                {regenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                <span>Tasdiqlash va qayta yaratish</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Cancel Confirmation Modal */}
      {(() => {
        const canRefund = job?.can_refund_on_cancel !== undefined
          ? job.can_refund_on_cancel
          : (getElapsedSeconds(job, currentTime, sessionStartRef.current) <= 30);
        const secLeft = job?.cancel_refund_seconds_left !== undefined
          ? Math.max(0, Math.round(job.cancel_refund_seconds_left))
          : Math.max(0, 30 - Math.round(getElapsedSeconds(job, currentTime, sessionStartRef.current)));
        const stageName = job?.initial_stage || "boshlang'ich";

        return (
          <ConfirmModal
            isOpen={confirmCancelOpen}
            onClose={() => setConfirmCancelOpen(false)}
            onConfirm={handleExecuteCancel}
            loading={cancelLoading}
            title="Dublyaj jarayonini bekor qilish"
            message={
              !canRefund
                ? "Diqqat: Dublyajning dastlabki bosqichi (30 soniya) yakunlangan yoki keyingi bosqichga o'tib bo'lgan! Server va AI resurslari sarflangani sababli, bekor qilsangiz sarflangan daqiqalar (limit) hisobingizga QAYTARILMAYDI!\n\nJarayonni bekor qilishni tasdiqlaysizmi?"
                : `Haqiqatan ham ushbu videoni qayta ishlashni to'xtatmoqchimisiz? Dastlabki bosqich (${stageName}) vaqti (30 soniya, qolgan vaqt: ${secLeft}s) ichida bo'lgani sababli sarflangan daqiqalaringiz hisobingizga to'liq qaytariladi.`
            }
            confirmText={!canRefund ? "Ha, limit qaytarilmasligiga roziman" : "Ha, bekor qilinsin"}
            cancelText="Ortga (davom ettirish)"
            danger
          />
        );
      })()}

      {/* 24-Hour 10% Welcome Discount Modal for First Video */}
      {job?.discount_offer && (
        <FirstVideoDiscountModal
          discount={job.discount_offer}
          isOpen={showDiscountModal}
          onClose={handleCloseDiscountModal}
        />
      )}
    </main>
    <Footer />
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 text-sm">
      <span className="text-ui-muted">{label}</span>
      <span className="text-right font-medium text-ui-ink">{value}</span>
    </div>
  )
}
