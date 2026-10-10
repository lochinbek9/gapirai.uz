'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, CreditCard, AlertTriangle, Copy, Check, Clock,
} from 'lucide-react'
import {
  formatDuration, getVideoUrl, getAudioUrl, initiateClickPayment, initiatePaymePayment, initiateUzumPayment, cancelJob,
  askQuestion, generateQuiz, generateNotes, QuizQuestion, QAEntry,
} from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'
import { useAnalysisPolling } from '@/hooks/useAnalysisPolling'
import VideoPlayer, { VideoPlayerHandle } from '@/components/VideoPlayer'
import YouTubePlayer, { YouTubePlayerHandle } from '@/components/YouTubePlayer'
import NotesTab from '@/components/analysis/NotesTab'
import UploadRecoveryPrompt from '@/components/UploadRecoveryPrompt'
import QuizTab from '@/components/analysis/QuizTab'
import QATab from '@/components/analysis/QATab'
import FiveMinuteTab from '@/components/analysis/FiveMinuteTab'
import { extractYouTubeId } from '@/lib/youtube'
import { trackEvent, trackOnce } from '@/lib/analytics'

// video/[id]/page.tsx bilan bir xil narx qoidasi (45 daqiqadan uzun videolar
// uchun) -- backend/services/plans.py'dagi haqiqiy hisob-kitobning taxminiy
// mijoz-tomon ko'rinishi, faqat UI uchun.
function calculateClientPrice(durationMinutes: number): number {
  if (durationMinutes < 45.0) return 0
  return Math.ceil(durationMinutes) * 500
}

// Backend'ning job.status_message'i (masalan "Nutq matnga aylantirilmoqda...")
// allaqachon o'zbekcha va texnik jargonsiz -- lekin bu maydon /video/[id]
// bilan BIR XIL (haqiqiy to'lovchi mijozlar ko'radigan sahifa), shuning
// uchun uni o'zgartirmaymiz. Bu yerda faqat Learning Workspace uchun
// qo'shimcha, frontend-only emoji/label qatlami -- "5-daqiqalik dars"
// hissi uchun (backend maydoniga tegilmaydi).
const PROCESSING_LABELS: Partial<Record<string, string>> = {
  pending: "🎬 Videoni tayyorlayapmiz",
  downloading: "🎬 Videoni tayyorlayapmiz",
  transcribing: "📝 Nutqni aniqlayapmiz",
  translating: "🇺🇿 O'zbekchaga tarjima qilinmoqda",
  syncing: "🎙️ O'zbekcha ovoz tayyorlanmoqda",
  synthesizing: "🎙️ O'zbekcha ovoz tayyorlanmoqda",
  merging: "✨ Darsingiz tayyorlanmoqda",
}

type Tab = 'video' | 'notes' | 'five' | 'quiz' | 'qa'

const TABS: { key: Tab; label: string }[] = [
  { key: 'video', label: '🎬 Video' },
  { key: 'notes', label: '📝 Konspekt' },
  { key: 'five', label: '⚡ 5 daqiqada' },
  { key: 'quiz', label: '🧠 Test' },
  { key: 'qa', label: '💬 AI Ustoz' },
]

/* ── Page ────────────────────────────────────────── */
export default function LearnPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { job, is404 } = useJobPolling(id)
  const { analysis } = useAnalysisPolling(job?.linked_analysis_id ?? null)

  const youtubePlayerRef = useRef<YouTubePlayerHandle>(null)
  const dubbedPlayerRef = useRef<VideoPlayerHandle>(null)

  const [tab, setTab] = useState<Tab>('video')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [uzumAccount, setUzumAccount] = useState<{ account: number; amount: number } | null>(null)
  const [uzumCopied, setUzumCopied] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [qaHistory, setQaHistory] = useState<QAEntry[]>([])
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [notes, setNotes] = useState<string | null>(null)
  const [notesLoading, setNotesLoading] = useState(false)

  const hasUserPickedTab = useRef(false)

  useEffect(() => {
    if (is404) router.push('/')
  }, [is404, router])

  // Agar sahifa ochilganda video HAM, tahlil HAM allaqachon tayyor bo'lsa
  // (masalan avval tugagan darsni qayta ochish) -- "5 daqiqada"dan
  // boshlash tabiiyroq. Lekin foydalanuvchi o'zi biror tabni tanlagan
  // bo'lsa, keyingi poll natijasi uni HECH QACHON o'sha yerdan
  // yulib olmasligi kerak (masalan video tomosha qilayotganda tahlil
  // orqada tugab qolsa).
  useEffect(() => {
    if (hasUserPickedTab.current) return
    if (job?.status === 'completed' && analysis?.status === 'completed') {
      setTab('five')
    }
  }, [job?.status, analysis?.status])

  useEffect(() => {
    if (analysis?.qa_history) setQaHistory(analysis.qa_history)
    if (analysis?.quiz) setQuiz(analysis.quiz)
    if (analysis?.notes) setNotes(analysis.notes)
  }, [analysis])

  // Learning Workspace'ga xos analitika -- useJobPolling o'zining umumiy
  // "processing_started"/"video_completed" eventlarini alohida yuboradi
  // (bosh sahifada ham ishlaydi), bular esa aynan shu sahifa kontekstida.
  useEffect(() => {
    if (id) trackOnce(id, 'learning_started')
  }, [id])

  useEffect(() => {
    if (!id || !job) return
    if (job.status !== 'completed' && job.status !== 'failed') {
      trackOnce(id, 'video_processing_started')
    }
    if (job.status === 'completed') {
      trackOnce(id, 'video_ready')
    }
  }, [id, job?.status])

  const handleTabChange = (next: Tab) => {
    hasUserPickedTab.current = true
    setTab(next)
    if (!id) return
    if (next === 'five') trackOnce(id, 'five_minute_opened')
    if (next === 'notes') trackOnce(id, 'notes_opened')
  }

  // Video tab qaysi pleerni ko'rsatishidan (original YouTube dub tugagunga
  // qadar, keyin dublyaj videosi) qat'i nazar bitta seek() -- VideoPlayer
  // endi YouTubePlayer bilan bir xil seekTo() interfeysini beradi
  // (frontend/components/VideoPlayer.tsx).
  const seek = (seconds: number) => {
    if (job?.status === 'completed') {
      dubbedPlayerRef.current?.seekTo(seconds)
    } else {
      youtubePlayerRef.current?.seekTo(seconds)
    }
  }

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || !analysis) return
    setAsking(true)
    try {
      const entry = await askQuestion(analysis.id, question.trim())
      setQaHistory((prev) => [...prev, entry])
      setQuestion('')
      trackEvent('ai_tutor_used')
    } catch {
      alert('Savolga javob berishda xatolik yuz berdi.')
    } finally {
      setAsking(false)
    }
  }

  const handleGenerateQuiz = async () => {
    if (!analysis) return
    setQuizLoading(true)
    try {
      const res = await generateQuiz(analysis.id)
      setQuiz(res.quiz)
    } catch {
      alert('Test yaratishda xatolik yuz berdi.')
    } finally {
      setQuizLoading(false)
    }
  }

  const handleGenerateNotes = async () => {
    if (!analysis) return
    setNotesLoading(true)
    try {
      const res = await generateNotes(analysis.id)
      setNotes(res.notes)
    } catch {
      alert('Konspekt yaratishda xatolik yuz berdi.')
    } finally {
      setNotesLoading(false)
    }
  }

  // To'lov va bekor qilish mantig'i video/[id]/page.tsx bilan bir xil --
  // real pul bilan ishlaydigan kod, shuning uchun ataylab qayta yozilmadi,
  // faqat shu sahifaga moslashtirilib ko'chirildi.
  const handlePayment = async (provider: 'click' | 'payme' = 'click') => {
    if (!id) return
    setPaymentLoading(true)
    setPaymentError(null)
    const paymentWindow = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
    try {
      const res = await (provider === 'payme' ? initiatePaymePayment(id) : initiateClickPayment(id))
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

  const handleUzumPayment = async () => {
    if (!id) return
    setPaymentLoading(true)
    setPaymentError(null)
    try {
      const res = await initiateUzumPayment(id)
      if (res.success && res.account) {
        setUzumAccount({ account: res.account, amount: res.amount })
      } else if (res.amount === 0) {
        window.location.reload()
      } else {
        setPaymentError("To'lov ma'lumotlarini yaratishda xatolik yuz berdi.")
      }
    } catch (err: any) {
      setPaymentError(err?.response?.data?.detail || "To'lov jarayonida xatolik yuz berdi.")
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleCopyUzumAccount = () => {
    if (!uzumAccount) return
    navigator.clipboard.writeText(String(uzumAccount.account)).then(() => {
      setUzumCopied(true)
      setTimeout(() => setUzumCopied(false), 2000)
    })
  }

  const handleCancel = async () => {
    if (!id) return
    if (!window.confirm('Rostdan ham ushbu dublyajni bekor qilmoqchimisiz?')) return
    setCancelLoading(true)
    try {
      const res = await cancelJob(id)
      if (res.success) {
        window.location.reload()
      } else {
        alert(res.message || 'Bekor qilishda xatolik yuz berdi.')
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Bekor qilishda xatolik yuz berdi.')
    } finally {
      setCancelLoading(false)
    }
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  const videoSrc = getVideoUrl(id)
  const audioUrl = job.status === 'completed' ? getAudioUrl(id) : undefined
  const youtubeVideoId = job.youtube_url ? extractYouTubeId(job.youtube_url) : null
  const analysisReady = analysis?.status === 'completed'

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition active:scale-95 shadow-sm"
            aria-label="Orqaga qaytish"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 transition duration-300 hover:scale-105">
            <img src="/logodark.webp" alt="GapirAI.uz Logo" width={120} height={32} className="h-8 w-auto object-contain" />
            <span className="text-lg font-black tracking-tight text-white">
              GapirAI<span className="text-violet-500">.uz</span>
            </span>
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">{job.video_title || "Noma'lum video"}</h1>
          {job.video_duration && (
            <span className="flex items-center gap-1 text-sm text-slate-400">
              <Clock className="w-4 h-4" /> {formatDuration(job.video_duration)}
            </span>
          )}
        </div>

        <div role="tablist" aria-label="O'quv bo'limlari" className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/10 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              id={`tab-${t.key}`}
              onClick={() => handleTabChange(t.key)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                tab === t.key ? 'bg-white/10 text-blue-400 shadow' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'video' && (
          <div role="tabpanel" id="panel-video" aria-labelledby="tab-video" className="space-y-3">
            {job.status === 'completed' ? (
              <VideoPlayer
                ref={dubbedPlayerRef}
                src={videoSrc}
                subtitlesContent={job.uzbek_srt_content}
                audioDownloadUrl={audioUrl}
                className="rounded-2xl"
              />
            ) : job.status === 'awaiting_payment' ? (
              <div className="min-h-[28rem] bg-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 border border-white/5 shadow-2xl relative overflow-visible">
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

                  {uzumAccount ? (
                    <div className="bg-white/5 border border-violet-500/20 rounded-xl p-4 text-left space-y-3">
                      <p className="text-xs font-semibold text-slate-300">
                        Uzum ilovasida to'lovlar bo'limidan quyidagi hisob raqamini kiriting va {uzumAccount.amount.toLocaleString('uz-UZ')} so'm to'lang:
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-mono text-lg font-bold text-white bg-black/30 rounded-lg px-3 py-2 text-center tracking-wider">
                          {uzumAccount.account}
                        </span>
                        <button
                          onClick={handleCopyUzumAccount}
                          className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition flex-shrink-0"
                          title="Nusxalash"
                          aria-label="Hisob raqamini nusxalash"
                        >
                          {uzumCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        To'lov tasdiqlangach, bu sahifa avtomatik yangilanadi.
                      </p>
                    </div>
                  ) : (
                    <div className="border-t border-white/10 pt-4 space-y-3">
                      <p className="text-xs text-slate-500">
                        Yoki ushbu video uchun bir martalik to'lov qiling{job.video_duration ? ` (${calculateClientPrice(job.video_duration / 60.0).toLocaleString('uz-UZ')} so'm)` : ''}:
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handlePayment('click')}
                          disabled={paymentLoading}
                          title="Click orqali to'lash"
                          className="flex items-center justify-center h-11 px-3.5 rounded-xl bg-white border border-white/10 hover:shadow-md transition disabled:opacity-50"
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
                          className="flex items-center justify-center h-11 px-3.5 rounded-xl bg-white border border-white/10 hover:shadow-md transition disabled:opacity-50"
                        >
                          <img src="/logos/payme.png" alt="Payme" className="h-4 w-auto object-contain" />
                        </button>
                        <button
                          onClick={handleUzumPayment}
                          disabled={paymentLoading}
                          title="Uzum orqali to'lash"
                          className="flex items-center justify-center h-11 px-3.5 rounded-xl bg-white border border-white/10 hover:shadow-md transition disabled:opacity-50"
                        >
                          <img src="/logos/uzum.png" alt="Uzum" className="h-5 w-auto object-contain" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : job.status === 'failed' ? (
              <div className="min-h-[18rem] sm:min-h-0 sm:aspect-video bg-slate-800 rounded-2xl flex items-center justify-center p-6 relative overflow-hidden border border-violet-500/20">
                <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-violet-500/5 blur-3xl pointer-events-none" />
                <div className="text-center space-y-4 max-w-md z-10">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-500/10 text-violet-400 mb-2">
                    <AlertTriangle className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-white font-bold text-lg">Dublyaj jarayonida xatolik yuz berdi</h3>
                    {!job.fallback_available && (
                      <p className="text-xs text-violet-300 font-mono bg-violet-950/30 border border-violet-900/30 rounded-xl p-3 text-left overflow-auto max-h-32 leading-relaxed">
                        {job.error_message || "Tizimda noma'lum xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."}
                      </p>
                    )}
                  </div>
                  {job.fallback_available && <UploadRecoveryPrompt jobId={id} />}
                </div>
              </div>
            ) : (
              <>
                {youtubeVideoId ? (
                  <YouTubePlayer ref={youtubePlayerRef} videoId={youtubeVideoId} />
                ) : (
                  <div className="aspect-video bg-black rounded-2xl flex items-center justify-center text-gray-500 text-sm">
                    Video ko'rsatib bo'lmadi
                  </div>
                )}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  <p className="text-xs text-slate-400">
                    O'zbekcha dublyaj tayyorlanmoqda — hozircha original videoni tomosha qilib turing.
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                        <span className="truncate">{PROCESSING_LABELS[job.status] || job.status_message || 'Darsingiz tayyorlanmoqda...'}</span>
                      </span>
                      <span className="text-xs font-semibold text-slate-200 tabular-nums shrink-0">
                        {Math.round(job.progress || 0)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.max(3, Math.min(100, job.progress || 0))}%` }}
                      />
                    </div>
                    {job.expected_end_time && (
                      <p className="text-[11px] text-slate-500">
                        Taxminan tugash vaqti:{' '}
                        {new Date(job.expected_end_time).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-400 hover:text-white transition disabled:opacity-50"
                  >
                    {cancelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Jarayonni bekor qilish
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <NotesTab notes={notes} loading={notesLoading} onGenerate={handleGenerateNotes} />
          </div>
        )}

        {tab === 'five' && (
          <div role="tabpanel" id="panel-five" aria-labelledby="tab-five" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <FiveMinuteTab summary={analysis?.five_minute_summary ?? null} loading={!analysisReady} />
          </div>
        )}

        {tab === 'quiz' && (
          <div role="tabpanel" id="panel-quiz" aria-labelledby="tab-quiz" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <QuizTab
              quiz={quiz}
              loading={quizLoading}
              answers={quizAnswers}
              onGenerate={handleGenerateQuiz}
              onAnswer={(qi, oi) => setQuizAnswers((prev) => ({ ...prev, [qi]: oi }))}
              onSeek={seek}
              onQuizStarted={() => trackEvent('quiz_started')}
              onQuizCompleted={(scoreVal, totalVal) => trackEvent('quiz_completed', { score: scoreVal, total: totalVal })}
            />
          </div>
        )}

        {tab === 'qa' && (
          <div role="tabpanel" id="panel-qa" aria-labelledby="tab-qa" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <QATab
              history={qaHistory}
              question={question}
              asking={asking}
              onQuestionChange={setQuestion}
              onAsk={handleAsk}
              onSeek={seek}
              placeholder="AI Ustozdan so'rang..."
              emptyText="AI Ustozdan video haqida savol so'rang."
            />
          </div>
        )}
      </div>
    </div>
  )
}
