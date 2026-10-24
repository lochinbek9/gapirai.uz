'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  Layers,
  Cpu,
  ExternalLink,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Play,
  Volume2,
  FileText,
  Sparkles,
  ShieldAlert,
  Info,
  X,
  TrendingUp,
  Percent,
  Calendar,
  LayoutGrid,
  List,
  Globe,
  Trash2,
  Ban,
  UserCheck,
} from 'lucide-react'
import {
  apiAdminJobsCost,
  apiAdminRetryJob,
  apiAdminCancelJob,
  apiAdminSetJobVisibility,
  apiAdminDeleteJob,
  apiAdminJobDeleteImpact,
  apiAdminUpdateUserCredentials,
  apiAdminGeminiKeysOverview,
  AdminJobsCostResponse,
  AdminJobCostItem,
  GeminiKeysOverviewResponse,
} from '@/lib/admin'
import { formatTashkentDateTimeObj, getTashkentRelativeTime } from '@/lib/timestamp'
import CustomSelect from '@/components/CustomSelect'
import DateRangePills, { DateRangeValue } from '@/components/DateRangePills'

interface AdminJobsCostManagerProps {
  token: string
}

export default function AdminJobsCostManager({ token }: AdminJobsCostManagerProps) {
  const [data, setData] = useState<AdminJobsCostResponse | null>(null)
  const [geminiOverview, setGeminiOverview] = useState<GeminiKeysOverviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters state
  const [page, setPage] = useState(1)
  const [pageSize] = useState(24)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [ttsProviderFilter, setTtsProviderFilter] = useState<string>('ALL')
  const [planFilter, setPlanFilter] = useState<string>('ALL')
  const [errorCodeFilter, setErrorCodeFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [includeInternal, setIncludeInternal] = useState(false)
  const [publicOnly, setPublicOnly] = useState(false)
  const [dateRange, setDateRange] = useState<DateRangeValue>('all')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  // Ko'rinish: jadval yoki YouTube uslubidagi kartochkalar (tanlov brauzerda eslab qolinadi)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  useEffect(() => {
    try {
      const saved = localStorage.getItem('admin_jobs_view')
      if (saved === 'grid' || saved === 'table') setViewMode(saved)
    } catch {}
  }, [])
  const changeViewMode = (mode: 'table' | 'grid') => {
    setViewMode(mode)
    setPage(1)
    try { localStorage.setItem('admin_jobs_view', mode) } catch {}
  }

  // Kartochka ko'rinishi YouTube kabi cheksiz: sahifalar ketma-ket qo'shilib boradi
  const [gridJobs, setGridJobs] = useState<AdminJobCostItem[]>([])
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  // Detail Modal State
  const [selectedJob, setSelectedJob] = useState<AdminJobCostItem | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [retryMessage, setRetryMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Retry Confirmation Modal State (Granular AI models per stage)
  const [retryModalJob, setRetryModalJob] = useState<AdminJobCostItem | null>(null)
  const [retryTtsOption, setRetryTtsOption] = useState<'gemini_paid' | 'edge' | 'gemini_free' | 'azure'>('gemini_paid')
  const [retrySttOption, setRetrySttOption] = useState<'existing' | 'groq' | 'gemini_free' | 'gemini_paid' | 'openai'>('existing')
  const [retryLlmOption, setRetryLlmOption] = useState<'existing' | 'groq' | 'gemini_free' | 'gemini_paid' | 'openai'>('existing')

  // Bepul kalitlarning cooldown holati va aniq tiklanish vaqti
  const freeKeys = geminiOverview?.free_keys || []
  const activeFreeKeysCount = Array.isArray(freeKeys) ? freeKeys.filter((k) => k?.status === 'active').length : 0
  const isFreeKeysInCooldown = Array.isArray(freeKeys) && freeKeys.length > 0 && activeFreeKeysCount === 0

  const cooldownCandidateSeconds = Array.isArray(freeKeys) ? freeKeys.map((k) => k?.remaining_seconds || 0).filter((s) => s > 0) : []
  const minCooldownSeconds = isFreeKeysInCooldown && cooldownCandidateSeconds.length > 0
    ? Math.min(...cooldownCandidateSeconds)
    : (isFreeKeysInCooldown ? 82800 : 0)

  const formatExactRemaining = (sec: number) => {
    if (!sec || sec <= 0 || !isFinite(sec)) return '0 daqiqa'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h} soat ${m} daqiqa`
    if (m > 0) return `${m} daqiqa ${s} soniya`
    return `${s} soniya`
  }
  const exactCooldownText = formatExactRemaining(minCooldownSeconds)

  const openRetryModal = (job: AdminJobCostItem) => {
    setRetryModalJob(job)
    // Standart holatda bepul variantlar (Edge TTS va Groq/Kesh) tanlanadi, kerak bo'lsa pullik Gemini/Azure tanlanishi mumkin:
    if (isFreeKeysInCooldown) {
      setRetryTtsOption('edge')
      setRetrySttOption(job.models.has_transcript ? 'existing' : 'groq')
      setRetryLlmOption(job.models.has_translation ? 'existing' : 'groq')
    } else {
      setRetryTtsOption('edge')
      setRetrySttOption(job.models.has_transcript ? 'existing' : 'groq')
      setRetryLlmOption(job.models.has_translation ? 'existing' : 'gemini_free')
    }
  }

  const handleRetryJob = async (
    jobId: string,
    options?: {
      gemini_key_tier?: string
      tts_provider?: string
      stt_provider?: string
      translation_model?: string
      reuse_transcript?: boolean
      reuse_translation?: boolean
    }
  ) => {
    try {
      setRetryingId(jobId)
      setRetryMessage(null)
      const res = await apiAdminRetryJob(token, jobId, options)
      setRetryMessage({ type: 'success', text: res.message || 'Job muvaffaqiyatli qayta navbatga qo‘yildi!' })
      setRetryModalJob(null)
      await loadData()
    } catch (err: any) {
      setRetryMessage({
        type: 'error',
        text: err?.response?.data?.detail || err?.message || 'Qayta ishga tushirishda xatolik yuz berdi',
      })
    } finally {
      setRetryingId(null)
      setTimeout(() => setRetryMessage(null), 6000)
    }
  }

  const handleCancelJob = async (jobId: string) => {
    if (!confirm("Haqiqatan ham ushbu dublyaj jarayonini to'xtatmoqchimisiz?")) return
    try {
      setCancellingId(jobId)
      setRetryMessage(null)
      const res = await apiAdminCancelJob(token, jobId)
      setRetryMessage({ type: 'success', text: res.message || 'Jarayon to‘xtatildi.' })
      await loadData()
    } catch (err: any) {
      setRetryMessage({
        type: 'error',
        text: err?.response?.data?.detail || err?.message || 'To‘xtatishda xatolik yuz berdi',
      })
    } finally {
      setCancellingId(null)
    }
  }

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1)
    }, 400)
    return () => clearTimeout(handler)
  }, [searchTerm])

  const loadData = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      setError(null)
      const [res, geminiRes] = await Promise.all([
        apiAdminJobsCost(
          token,
          page,
          pageSize,
          statusFilter === 'ALL' ? undefined : statusFilter,
          debouncedSearch || undefined,
          ttsProviderFilter === 'ALL' ? undefined : ttsProviderFilter,
          includeInternal,
          sortBy,
          dateRange,
          customStartDate || undefined,
          customEndDate || undefined,
          planFilter === 'ALL' ? undefined : planFilter,
          errorCodeFilter === 'ALL' ? undefined : errorCodeFilter,
          publicOnly
        ),
        apiAdminGeminiKeysOverview(token).catch(() => null),
      ])
      setData(res)
      if (viewMode === 'grid') {
        setGridJobs((prev) => {
          if (page === 1) return res.jobs
          const seen = new Set(prev.map((j) => j.id))
          return [...prev, ...res.jobs.filter((j) => !seen.has(j.id))]
        })
      }
      if (geminiRes) setGeminiOverview(geminiRes)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Maʼlumotlarni yuklab bo‘lmadi')
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, statusFilter, debouncedSearch, ttsProviderFilter, planFilter, errorCodeFilter, includeInternal, publicOnly, sortBy, dateRange, customStartDate, customEndDate, viewMode])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Kartochkalar oxiriga yaqinlashganda keyingi sahifani yuklash
  const totalPages = data?.pagination?.total_pages ?? 1
  useEffect(() => {
    const el = loadMoreRef.current
    if (viewMode !== 'grid' || !el || loading || page >= totalPages) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setPage((p) => p + 1)
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [viewMode, loading, page, totalPages])

  // Amaldan keyin butun ro'yxatni qayta yuklamaymiz (cheksiz ro'yxatda pozitsiya yo'qoladi) -- joyida yangilaymiz
  const patchJobs = (fn: (j: AdminJobCostItem) => AdminJobCostItem | null) => {
    const apply = (list: AdminJobCostItem[]) =>
      list.map(fn).filter((j): j is AdminJobCostItem => j !== null)
    setGridJobs(apply)
    setData((prev) => (prev ? { ...prev, jobs: apply(prev.jobs) } : prev))
  }

  const errorText = (err: any, fallback: string) => err?.response?.data?.detail || err?.message || fallback

  const handleToggleVisibility = async (job: AdminJobCostItem) => {
    try {
      setBusyAction(`vis:${job.id}`)
      const res = await apiAdminSetJobVisibility(token, job.id, !job.is_public)
      patchJobs((j) => (j.id === job.id ? { ...j, is_public: res.is_public, published_at: res.published_at } : j))
    } catch (err: any) {
      alert(errorText(err, "Ommaviylik holatini o'zgartirib bo'lmadi"))
    } finally {
      setBusyAction(null)
    }
  }

  const handleDeleteJob = async (job: AdminJobCostItem) => {
    setBusyAction(`del:${job.id}`)
    // Kesh nusxalari bo'lsa fayllar o'chirilmaydi, eng birinchi nusxaga ko'chadi -- admin buni oldindan bilsin
    let detail = "Video fayllari serverdan ham o'chadi, bu amalni qaytarib bo'lmaydi."
    try {
      const impact = await apiAdminJobDeleteImpact(token, job.id)
      if (impact.is_copy) {
        detail = "Bu boshqa videoning kesh nusxasi: faqat shu foydalanuvchidan o'chadi, asl fayllar va boshqa foydalanuvchilarning videolari saqlanib qoladi."
      } else if (impact.copies > 0) {
        detail = `Bu videoning yana ${impact.copies} ta nusxasi boshqa foydalanuvchilarda bor. Ular ishlashda davom etadi: fayllar eng birinchi nusxaga ko'chiriladi, faqat shu yozuv o'chadi.`
      }
      if (impact.is_public) detail += "\n\nVideo ommaviy videolar ro'yxatidan ham olib tashlanadi."
    } catch {
      // Ma'lumotni olib bo'lmasa ham o'chirish mumkin -- umumiy ogohlantirish ko'rsatiladi
    }
    if (!confirm(`"${job.video_title}" videosini o'chirasizmi?\n\n${detail}`)) {
      setBusyAction(null)
      return
    }
    try {
      await apiAdminDeleteJob(token, job.id)
      patchJobs((j) => (j.id === job.id ? null : j))
    } catch (err: any) {
      alert(errorText(err, "Videoni o'chirib bo'lmadi"))
    } finally {
      setBusyAction(null)
    }
  }

  const handleToggleBlockUser = async (job: AdminJobCostItem) => {
    const userId = job.user.id
    if (!userId) return
    const block = job.user.is_active !== false
    const who = job.user.email || job.user.name
    const question = block
      ? `${who} foydalanuvchisini bloklaysizmi?\n\nU saytga va Telegram botga kira olmaydi, yangi dublaj qila olmaydi.`
      : `${who} foydalanuvchisini blokdan chiqarasizmi?`
    if (!confirm(question)) return
    try {
      setBusyAction(`blk:${job.id}`)
      await apiAdminUpdateUserCredentials(token, userId, { is_active: !block })
      patchJobs((j) => (j.user.id === userId ? { ...j, user: { ...j.user, is_active: !block } } : j))
    } catch (err: any) {
      alert(errorText(err, "Foydalanuvchi holatini o'zgartirib bo'lmadi"))
    } finally {
      setBusyAction(null)
    }
  }

  const handleDateRangeChange = (newRange: DateRangeValue, start?: string, end?: string) => {
    setDateRange(newRange)
    if (start) setCustomStartDate(start)
    if (end) setCustomEndDate(end)
    setPage(1)
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatSeconds = (sec: number | null | undefined): string => {
    if (!sec || sec <= 0) return '0s'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    if (m === 0) return `${s}s`
    return `${m}m ${s}s`
  }

  const formatDurationBadge = (sec: number | null | undefined): string => {
    if (!sec || sec <= 0) return '00:00'
    const totalSec = Math.floor(sec)
    const hrs = Math.floor(totalSec / 3600)
    const mins = Math.floor((totalSec % 3600) / 60)
    const secs = totalSec % 60
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDateTime = (dateStr: string | null | undefined) => formatTashkentDateTimeObj(dateStr)

  const getRelativeTime = (dateStr: string | null | undefined): string => getTashkentRelativeTime(dateStr)

  const getStatusBadge = (status: string, errorCode?: string | null) => {
    switch (status) {
      case 'COMPLETED':
        return {
          label: 'Tayyor',
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-400',
        }
      case 'FAILED':
        if (errorCode === 'NO_SPEECH_FOUND' || errorCode?.includes('NO_SPEECH')) {
          return {
            label: 'Ovoz topilmadi',
            color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            dot: 'bg-amber-400',
          }
        }
        if (errorCode === 'CONTENT_BLOCKED' || errorCode?.includes('CONTENT') || errorCode?.includes('POLICY')) {
          return {
            label: 'Kontent taqiqlangan',
            color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
            dot: 'bg-rose-400',
          }
        }
        if (errorCode?.includes('MUSIC') || errorCode?.includes('COPYRIGHT')) {
          return {
            label: 'Mualliflik huquqi',
            color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            dot: 'bg-amber-400',
          }
        }
        return {
          label: 'Xatolik',
          color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          dot: 'bg-rose-400',
        }
      case 'DOWNLOADING':
        return {
          label: 'Yuklanmoqda',
          color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          dot: 'bg-amber-400 animate-pulse',
        }
      case 'TRANSCRIBING':
        return {
          label: 'Nutqni aniqlash (STT)',
          color: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          dot: 'bg-purple-400 animate-pulse',
        }
      case 'TRANSLATING':
        return {
          label: 'Tarjima (LLM)',
          color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
          dot: 'bg-indigo-400 animate-pulse',
        }
      case 'SYNTHESIZING':
        return {
          label: 'Ovoz sintezi (TTS)',
          color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
          dot: 'bg-cyan-400 animate-pulse',
        }
      case 'SYNCING':
        return {
          label: 'Sinxronlanmoqda',
          color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          dot: 'bg-blue-400 animate-pulse',
        }
      case 'MERGING':
        return {
          label: 'Birlashtirilmoqda',
          color: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
          dot: 'bg-teal-400 animate-pulse',
        }
      case 'AWAITING_PAYMENT':
        return {
          label: 'To‘lov kutilmoqda',
          color: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
          dot: 'bg-orange-400',
        }
      case 'PENDING':
      default:
        return {
          label: 'Kutilmoqda',
          color: 'bg-gray-500/10 text-ui-muted border-gray-500/30',
          dot: 'bg-gray-400',
        }
    }
  }

  const isNonRetryable = (code?: string | null) => {
    if (!code) return false
    const c = code.toUpperCase()
    return (
      c.includes('NO_SPEECH') ||
      c.includes('CONTENT_BLOCKED') ||
      c.includes('POLICY_VIOLATION') ||
      c.includes('COPYRIGHT') ||
      c.includes('MUSIC') ||
      c.includes('INVALID_URL') ||
      c.includes('BAD_FILE')
    )
  }

  const summary = data?.summary
  const jobs = data?.jobs || []
  const pagination = data?.pagination

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className=" bg-blue-900/30 border border-white/10 rounded-2xl p-5 sm:p-6 ">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Layers className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                  Dublyaj Joblari va Xarajatlar Tahlili
                </h2>
                <p className="text-xs sm:text-sm text-ui-muted mt-0.5">
                  Har bir dublyaj jarayoni, uning holati, TTS, STT va LLM xarajatlari hamda unit economics tahlili
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle internal accounts */}
            <label className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/10 transition text-xs text-gray-300">
              <input
                type="checkbox"
                checked={includeInternal}
                onChange={(e) => {
                  setIncludeInternal(e.target.checked)
                  setPage(1)
                }}
                className="rounded border-gray-600 bg-black/40 text-ui-accent-ink focus:ring-0"
              />
              <span>Dasturchi / Test hisoblarni ham ko‘rsatish</span>
            </label>

            {/* Date Range Pills & Refresh */}
            <DateRangePills
              value={dateRange}
              onChange={handleDateRangeChange}
              onRefresh={() => loadData()}
              loading={loading}
              startDate={customStartDate}
              endDate={customEndDate}
            />
          </div>
        </div>

        {/* KPI Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
            {/* Card 1: Total & Success */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-ui-muted mb-1">
                <span>Jami Dublyajlar</span>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {summary.success_rate_pct}% muvaffaqiyat
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-semibold text-white font-mono">
                {summary.total_jobs.toLocaleString()}
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-ui-muted">
                <span className="text-emerald-400">✓ {summary.completed_jobs} tayyor</span>
                <span className="text-rose-400">✗ {summary.failed_jobs} xatolik</span>
                {summary.processing_jobs > 0 && (
                  <span className="text-amber-400 animate-pulse">● {summary.processing_jobs} jarayonda</span>
                )}
                {(summary.queued_jobs ?? 0) > 0 && (
                  <span className="text-blue-400 font-medium">⏳ {summary.queued_jobs} navbatda</span>
                )}
              </div>
            </div>

            {/* Card 2: Cost Summary */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-ui-muted mb-1">
                <span>Sahifa Xarajati</span>
                <span className="text-xs font-mono text-blue-400">
                  ${summary.page_total_cost_usd} USD
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-semibold text-emerald-400 font-mono">
                {summary.page_total_cost_uzs.toLocaleString()} <span className="text-xs text-ui-muted font-normal">UZS</span>
              </div>
              <div className="text-xs text-ui-muted mt-2">
                1 ta video o‘rtacha: <span className="text-gray-200 font-medium">{summary.page_avg_job_cost_uzs.toLocaleString()} UZS</span>
              </div>
            </div>

            {/* Card 3: Total Audio Duration */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-ui-muted mb-1">
                <span>Muvaffaqiyatli Dublyaj Vaqti</span>
                <Clock className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-xl sm:text-2xl font-semibold text-white font-mono">
                {summary.total_completed_duration_min.toLocaleString()} <span className="text-xs text-ui-muted font-normal">daqiqa</span>
              </div>
              <div className="text-xs text-ui-muted mt-2">
                Taxminan: <span className="text-gray-200 font-medium">{Math.round(summary.total_completed_duration_min / 60)} soat</span> video
              </div>
            </div>

            {/* Card 4: Providers Breakdown */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-ui-muted mb-1.5 flex items-center justify-between">
                <span>TTS Provayderlar</span>
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto pr-1">
                {Object.entries(summary.providers).map(([prov, count]) => (
                  <span
                    key={prov}
                    className="inline-flex items-center gap-1 text-xs bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-300 font-mono"
                  >
                    <span className="font-semibold text-white capitalize">{prov}:</span> {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: 'Barchasi' },
              { id: 'COMPLETED', label: 'Tayyor' },
              { id: 'FAILED', label: 'Xatolik' },
              { id: 'PROCESSING', label: 'Jarayonda' },
              { id: 'AWAITING_PAYMENT', label: 'To‘lov kutilmoqda' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFilter(tab.id)
                  if (tab.id !== 'FAILED' && errorCodeFilter !== 'ALL') {
                    setErrorCodeFilter('ALL')
                  }
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                  statusFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-md '
                    : 'bg-black/20 text-ui-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search, Error Type, Plan, Provider, Sorting */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[180px] sm:min-w-[220px] flex-1">
              <Search className="w-3.5 h-3.5 text-ui-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Qidirish (Nomi, URL, ID, Email...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ui-muted hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Error Type Filter Dropdown (Xatolik turi filtri - faqat Xatolik bosilganda yoki faol bo'lganda) */}
            {(statusFilter === 'FAILED' || errorCodeFilter !== 'ALL') && (
              <CustomSelect
                value={errorCodeFilter}
                onChange={(val) => {
                  setErrorCodeFilter(val)
                  if (val !== 'ALL') {
                    setStatusFilter('FAILED')
                  }
                  setPage(1)
                }}
                options={[
                  { value: 'ALL', label: 'Barcha xatoliklar' },
                  { value: 'NO_SPEECH_FOUND', label: '🎙 Ovoz topilmadi (User)' },
                  { value: 'AUTH_ERROR', label: '🔒 Kirish / Bot cheklovi' },
                  { value: 'DOWNLOAD_ERROR', label: '📥 Yuklab olish xatosi' },
                  { value: 'TRANSCRIBE_ERROR', label: '🎧 Nutqni aniqlash' },
                  { value: 'TRANSLATE_ERROR', label: '🌐 Tarjima xatosi' },
                  { value: 'SYNTHESIS_ERROR', label: '🔊 Ovoz sintezi (TTS)' },
                  { value: 'MERGE_ERROR', label: '🎬 Birlashtirish (Merge)' },
                  { value: 'TIMEOUT', label: '⏱ Vaqt tugashi' },
                  { value: 'CONTENT_BLOCKED', label: '🛡 Bloklangan kontent' },
                  { value: 'OTHER', label: '⚠️ Boshqa xatoliklar' },
                ]}
                className="min-w-[165px]"
              />
            )}

            {/* Plan / Tarif Filter Dropdown */}
            <CustomSelect
              value={planFilter}
              onChange={(val) => {
                setPlanFilter(val)
                setPage(1)
              }}
              options={[
                { value: 'ALL', label: 'Barcha tariflar' },
                { value: 'free', label: 'Free (Bepul)' },
                { value: 'standard', label: 'Standard' },
                { value: 'pro', label: 'Pro' },
                { value: 'admin', label: 'Admin hisoblar' },
              ]}
              className="min-w-[135px]"
            />

            {/* Custom Provider Filter Dropdown */}
            <CustomSelect
              value={ttsProviderFilter}
              onChange={(val) => {
                setTtsProviderFilter(val)
                setPage(1)
              }}
              options={[
                { value: 'ALL', label: 'Barcha TTS' },
                { value: 'azure', label: 'Azure' },
                { value: 'edge', label: 'Edge (Bepul)' },
                { value: 'gemini', label: 'Gemini' },
                { value: 'uzbekvoice', label: 'UzbekVoice' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'elevenlabs', label: 'ElevenLabs' },
              ]}
              className="min-w-[125px]"
            />

            {/* Custom Sort Filter Dropdown */}
            <CustomSelect
              value={sortBy}
              onChange={(val) => {
                setSortBy(val)
                setPage(1)
              }}
              options={[
                { value: 'newest', label: 'Eng yangi' },
                { value: 'oldest', label: 'Eng eski' },
                { value: 'duration_desc', label: 'Eng uzun video' },
                { value: 'duration_asc', label: 'Eng qisqa video' },
              ]}
              className="min-w-[135px]"
            />

            <label className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 cursor-pointer hover:bg-white/5 transition text-xs text-gray-300">
              <input
                type="checkbox"
                checked={publicOnly}
                onChange={(e) => {
                  setPublicOnly(e.target.checked)
                  setPage(1)
                }}
                className="rounded border-gray-600 bg-black/40 text-emerald-500 focus:ring-0"
              />
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Faqat ommaviy</span>
            </label>

            {/* Ko'rinish almashtirgichi */}
            <div role="group" aria-label="Ko'rinish" className="flex items-center bg-black/30 border border-white/10 rounded-xl p-0.5">
              {([
                { id: 'table', label: 'Jadval', Icon: List },
                { id: 'grid', label: 'Kartochka', Icon: LayoutGrid },
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => changeViewMode(id)}
                  aria-pressed={viewMode === id}
                  title={label}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    viewMode === id ? 'bg-blue-600 text-white' : 'text-ui-muted hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Retry Feedback Banner */}
      {retryMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2 font-medium border ${
            retryMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {retryMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{retryMessage.text}</span>
        </div>
      )}


      {/* Data Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {viewMode === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-ui-muted text-xs font-semibold ">
                <th className="py-3 px-4">Video & ID</th>
                <th className="py-3 px-4">Foydalanuvchi</th>
                <th className="py-3 px-4 whitespace-nowrap">Tarif & Balans</th>
                <th className="py-3 px-4 whitespace-nowrap">Uringan vaqti</th>
                <th className="py-3 px-4">Status & Bosqich</th>
                <th className="py-3 px-4">Modellar</th>
                <th className="py-3 px-4 text-right">Unit Economics (Xarajat)</th>
                <th className="py-3 px-4 text-center">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                    <span>Yuklanmoqda...</span>
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    Hech qanday dublyaj jobi topilmadi.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const isNoSpeech = job.error_code === 'NO_SPEECH_FOUND' || Boolean(job.error_code?.includes('NO_SPEECH'))
                  const nonRetryable = isNonRetryable(job.error_code)
                  const statusInfo = getStatusBadge(job.status, job.error_code)
                  const isUpload = Boolean(
                    job.youtube_url?.startsWith('upload://') ||
                    job.youtube_video_id?.startsWith('upload_') ||
                    job.video_title?.includes('.mp4') ||
                    job.video_title?.includes('.m4a')
                  )
                  const jobLink = job.subtitle_only ? `/subtitles/${job.id}` : `/video/${job.id}`

                  return (
                    <tr
                      key={job.id}
                      className="hover:bg-white/[0.03] transition group"
                    >
                      {/* Video & ID */}
                      <td className="py-3.5 px-4 min-w-[240px] max-w-[320px]">
                        <div className="flex items-start gap-3">
                          {/* Thumbnail */}
                          <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-black/50 border border-white/10 shrink-0">
                            {job.video_thumbnail ? (
                              <img
                                src={job.video_thumbnail}
                                alt={job.video_title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-600">
                                <Play className="w-4 h-4" />
                              </div>
                            )}
                            <span className="absolute bottom-0.5 right-0.5 text-xs bg-black/80 font-mono text-gray-200 px-1 rounded">
                              {formatDurationBadge(job.video_duration)}
                            </span>
                          </div>

                          {/* Title & Links */}
                          <div className="min-w-0 flex-1">
                            <p
                              className="font-medium text-white truncate text-xs hover:text-blue-400 transition cursor-pointer"
                              title={job.video_title}
                              onClick={() => setSelectedJob(job)}
                            >
                              {job.video_title}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {/* Full link to video */}
                              <a
                                href={jobLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-2 py-0.5 rounded font-mono font-medium transition"
                                title={`To'liq havola: ${jobLink}`}
                              >
                                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate max-w-[130px]">{jobLink}</span>
                              </a>

                              {/* Copy Full URL button */}
                              <button
                                onClick={() => {
                                  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${jobLink}` : jobLink
                                  copyToClipboard(fullUrl, job.id)
                                }}
                                title="To'liq havolani nusxalash (Copy URL)"
                                className="text-ui-muted hover:text-white flex items-center gap-0.5 bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded text-xs transition"
                              >
                                {copiedId === job.id ? (
                                  <>
                                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                                    <span className="text-emerald-400 text-xs">Nusxalandi</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-2.5 h-2.5" />
                                    <span className="text-xs">URL</span>
                                  </>
                                )}
                              </button>

                              {/* YouTube link */}
                              {job.youtube_url && !isUpload && (
                                <a
                                  href={job.youtube_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-ui-muted hover:text-red-400 flex items-center gap-0.5 bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded transition"
                                  title="YouTube original videosini ochish"
                                >
                                  <span>YT</span>
                                </a>
                              )}

                              {/* Direct MP4 for uploaded file */}
                              {isUpload && (
                                <a
                                  href={`/outputs/${job.id}/video/dubbed_final.mp4`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono transition"
                                  title="To'g'ridan-to'g'ri MP4 faylni ochish"
                                >
                                  <span>MP4</span>
                                </a>
                              )}

                              {job.subtitle_only && (
                                <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1 rounded">
                                  Subtitr
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* User */}
                      <td className="py-3.5 px-4 min-w-[150px]">
                        <div>
                          <p className="font-medium text-white text-xs truncate">
                            {job.user.name || 'Mehmon (Anonim)'}
                          </p>
                          <p className="text-xs text-ui-muted truncate">
                            {job.user.email || job.user.phone || '—'}
                          </p>
                          {job.user.is_internal && (
                            <span className="inline-block mt-0.5 text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1 rounded">
                              Dasturchi / Test
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tarif & Balans */}
                      <td className="py-3.5 px-4 min-w-[125px] whitespace-nowrap">
                        <div className="space-y-1">
                          <div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                job.user.plan?.toLowerCase() === 'pro'
                                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                  : job.user.plan?.toLowerCase() === 'standard' || job.user.plan?.toLowerCase() === 'standart'
                                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                  : 'bg-white/5 text-ui-muted border-white/10'
                              }`}
                            >
                              {job.user.plan || 'Bepul'}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-gray-300 flex items-center gap-1">
                            <span className="text-gray-500">Balans:</span>
                            <span className="font-semibold text-emerald-400">
                              {typeof job.user.balance_minutes === 'number'
                                ? job.user.balance_minutes.toFixed(1)
                                : '—'}
                            </span>
                            <span className="text-xs text-gray-500">daq</span>
                          </div>
                        </div>
                      </td>

                      {/* Created At / Attempt Time */}
                      <td className="py-3.5 px-4 min-w-[140px] whitespace-nowrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-white">
                            <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                            <span>{formatDateTime(job.created_at).date}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-ui-muted font-mono">
                            <Clock className="w-2.5 h-2.5 text-gray-500 shrink-0" />
                            <span>{formatDateTime(job.created_at).time}</span>
                            {getRelativeTime(job.created_at) && (
                              <span className="text-xs text-blue-400/90 bg-blue-500/10 px-1 rounded ml-1 font-sans">
                                {getRelativeTime(job.created_at)}
                              </span>
                            )}
                          </div>
                          {job.completed_at && (
                            <div className="text-xs text-emerald-400/90 font-mono flex items-center gap-1" title="Tugallangan vaqti">
                              <span>✓</span>
                              <span>{formatDateTime(job.completed_at).time}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status & Pipeline Stage */}
                      <td className="py-3.5 px-4 min-w-[170px]">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${statusInfo.color}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                            <span>{statusInfo.label}</span>
                          </span>

                          {job.processing_seconds !== null && (
                            <p className="text-xs text-ui-muted flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{formatSeconds(job.processing_seconds)}</span>
                            </p>
                          )}

                          {job.error_code && (
                            <p
                              className={`text-xs font-mono truncate max-w-[150px] ${
                                isNoSpeech ? 'text-amber-400 font-semibold' : 'text-rose-400'
                              }`}
                              title={job.error_message || ''}
                            >
                              {job.error_code}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Models */}
                      <td className="py-3.5 px-4 min-w-[160px]">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-500 text-xs">TTS:</span>
                            <span className="font-medium text-cyan-400 text-xs bg-cyan-500/10 px-1 rounded border border-cyan-500/20">
                              {job.models.tts_provider}
                            </span>
                            {job.models.voice_name && (
                              <span className="text-ui-muted text-xs truncate max-w-[80px]" title={job.models.voice_name}>
                                {job.models.voice_name.replace('uz-UZ-', '')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-gray-500">STT:</span>
                            <span
                              className="text-gray-300 font-mono text-xs truncate max-w-[120px]"
                              title={job.models.stt_display || job.models.stt_model || 'whisper-1'}
                            >
                              {job.models.is_groq ? 'Groq Whisper' : (job.models.stt_display || job.models.stt_model?.replace('gemini-', 'gem-') || 'whisper-1')}
                            </span>
                          </div>
                          <div className="pt-0.5">
                            {job.models.gemini_key_tier === 'paid' ? (
                              <span
                                className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                title={job.models.gemini_key_used ? `Gemini kaliti: ${job.models.gemini_key_used}` : 'Gemini pullik kalit'}
                              >
                                <span>💎</span>
                                <span>Gemini: Pullik</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300/80 border border-blue-500/20"
                                title={job.models.gemini_key_used ? `Gemini kaliti: ${job.models.gemini_key_used}` : 'Gemini bepul kalit hovuzi'}
                              >
                                <span>🆓</span>
                                <span>Gemini: Bepul</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Unit Economics (Costs) */}
                      <td className="py-3.5 px-4 text-right min-w-[180px]">
                        <div>
                          {/* Total UZS & USD */}
                          <div className="text-sm font-semibold font-mono text-emerald-400">
                            {(job.costs?.total_cost_uzs ?? 0).toLocaleString()} <span className="text-xs text-ui-muted font-normal">UZS</span>
                          </div>
                          <div className="text-xs font-mono text-ui-muted">
                            ${job.costs?.total_cost_usd ?? 0} USD
                          </div>

                          {/* Breakdown pills */}
                          <div className="flex items-center justify-end gap-1.5 mt-1 text-xs text-ui-muted font-mono">
                            <span title="TTS xarajati" className={(job.costs?.tts_cost_usd ?? 0) === 0 ? "text-emerald-400 font-medium" : ""}>
                              TTS: {(job.costs?.tts_cost_usd ?? 0) === 0 ? "$0 (Bepul)" : `$${job.costs?.tts_cost_usd ?? 0}`}
                            </span>
                            <span>•</span>
                            <span title="STT xarajati" className={(job.costs?.stt_cost_usd ?? 0) === 0 ? "text-emerald-400 font-medium" : ""}>
                              STT: {(job.costs?.stt_cost_usd ?? 0) === 0 ? "$0 (Bepul)" : `$${job.costs?.stt_cost_usd}`}
                            </span>
                            <span>•</span>
                            <span title="LLM xarajati">LLM: ${job.costs?.llm_cost_usd ?? 0}</span>
                          </div>

                          {/* Payment badge if paid */}
                          {job.payment.has_payment && (
                            <div className="mt-1 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 inline-flex items-center gap-1">
                              <span>Tushum: +{job.payment.revenue_uzs.toLocaleString()} UZS</span>
                              {job.payment.margin_pct !== null && (
                                <span className="font-semibold">({job.payment.margin_pct}%)</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {['DOWNLOADING', 'TRANSCRIBING', 'TRANSLATING', 'SYNTHESIZING', 'SYNCING', 'MERGING', 'PENDING'].includes(job.status) && (
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              disabled={cancellingId === job.id}
                              title="Jarayonni to'xtatish (Bekor qilish)"
                              className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>To‘xtatish</span>
                            </button>
                          )}
                          {job.status === 'FAILED' && !nonRetryable && (
                            <button
                              onClick={() => openRetryModal(job)}
                              disabled={retryingId === job.id}
                              title="Qayta ishga tushirish (Retry)"
                              className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${retryingId === job.id ? 'animate-spin' : ''}`} />
                              <span>Qayta urinish</span>
                            </button>
                          )}
                          {job.status === 'COMPLETED' && (
                            <button
                              onClick={() => openRetryModal(job)}
                              disabled={retryingId === job.id}
                              title="Admin: Ushbu tayyor videoni yangi ovoz yoki modellar bilan qayta tayyorlash"
                              className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 hover:border-indigo-400 text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50 shadow-sm "
                            >
                              <RefreshCw className={`w-3 h-3 ${retryingId === job.id ? 'animate-spin' : ''}`} />
                              <span>Qayta tayyorlash</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedJob(job)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 hover:text-blue-300 text-xs font-medium transition border border-white/10"
                          >
                            Batafsil
                          </button>
                        </div>
                      </td>

                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        ) : (
          /* YouTube uslubidagi kartochkalar */
          <div className="p-4">
            {loading && gridJobs.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                <span>Yuklanmoqda...</span>
              </div>
            ) : gridJobs.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs">Hech qanday dublyaj jobi topilmadi.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
                {gridJobs.map((job) => {
                  const statusInfo = getStatusBadge(job.status, job.error_code)
                  const canPublish = job.status === 'COMPLETED' && !job.subtitle_only && !job.is_preview
                  const isBlocked = job.user.is_active === false
                  const jobLink = job.subtitle_only ? `/subtitles/${job.id}` : `/video/${job.id}`
                  const relative = getRelativeTime(job.created_at)
                  return (
                    <div key={job.id} className="group min-w-0">
                      <a
                        href={jobLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative block aspect-video rounded-xl overflow-hidden bg-black/50 border border-white/10"
                        title="Dublaj qilingan videoni ochish"
                      >
                        {job.video_thumbnail ? (
                          <img
                            src={job.video_thumbnail}
                            alt={job.video_title}
                            loading="lazy"
                            className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">
                            <Play className="w-8 h-8" />
                          </div>
                        )}
                        {/* To'q fon: badge rangi yarim shaffof, yorug' rasm ustida o'qilmay qolardi */}
                        <span className="absolute top-2 left-2 rounded-full bg-black/80">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                            <span>{statusInfo.label}</span>
                          </span>
                        </span>
                        <span className="absolute top-2 right-2 flex gap-1">
                          {job.is_public && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-600/90 text-white px-1.5 py-0.5 rounded">
                              <Globe className="w-3 h-3" />
                              Ommaviy
                            </span>
                          )}
                          {job.subtitle_only && (
                            <span className="text-xs bg-purple-600/80 text-white px-1.5 py-0.5 rounded">
                              Subtitr
                            </span>
                          )}
                        </span>
                        <span className="absolute bottom-1.5 right-1.5 text-xs bg-black/80 font-mono text-gray-100 px-1.5 py-0.5 rounded">
                          {formatDurationBadge(job.video_duration)}
                        </span>
                      </a>

                      <div className="mt-2.5">
                        <button
                          type="button"
                          onClick={() => setSelectedJob(job)}
                          title={job.video_title}
                          className="text-left text-sm font-semibold text-white leading-snug line-clamp-2 hover:text-blue-400 transition"
                        >
                          {job.video_title}
                        </button>
                        <p className="mt-1 text-xs text-gray-300 truncate">
                          {isBlocked && (
                            <span className="mr-1.5 text-xs font-semibold text-rose-400">Bloklangan</span>
                          )}
                          {job.user.name || 'Mehmon (Anonim)'}
                          {job.user.plan && job.user.plan.toLowerCase() !== 'free' && (
                            <span className="ml-1.5 text-xs font-semibold text-purple-300">{job.user.plan}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{job.user.email || job.user.phone || '—'}</p>
                        <p className="mt-0.5 text-xs text-ui-muted">
                          {relative && `${relative} · `}
                          {formatDateTime(job.created_at).date} {formatDateTime(job.created_at).time}
                        </p>
                        {job.error_code && (
                          <p className="mt-0.5 text-xs font-mono text-rose-400 truncate" title={job.error_message || ''}>
                            {job.error_code}
                          </p>
                        )}

                        {/* Admin amallari */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {canPublish && (
                            <button
                              type="button"
                              onClick={() => handleToggleVisibility(job)}
                              disabled={busyAction !== null}
                              title={job.is_public ? "Ommaviy videolardan olib tashlash" : "Saytdagi \"Ommaviy videolar\" bo'limiga chiqarish"}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${
                                job.is_public
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                                  : 'bg-white/5 text-gray-300 border-white/10 hover:text-white hover:bg-white/10'
                              }`}
                            >
                              <Globe className="w-3 h-3" />
                              <span>{job.is_public ? 'Ommaviyda' : 'Ommaviy qilish'}</span>
                            </button>
                          )}
                          {job.user.id && (
                            <button
                              type="button"
                              onClick={() => handleToggleBlockUser(job)}
                              disabled={busyAction !== null}
                              title={isBlocked ? 'Foydalanuvchini blokdan chiqarish' : 'Foydalanuvchini bloklash'}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${
                                isBlocked
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                                  : 'bg-white/5 text-gray-300 border-white/10 hover:text-rose-300 hover:bg-rose-500/10'
                              }`}
                            >
                              {isBlocked ? <UserCheck className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                              <span>{isBlocked ? 'Blokdan chiqarish' : 'Bloklash'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteJob(job)}
                            disabled={busyAction !== null}
                            title="Videoni butunlay o'chirish"
                            aria-label="Videoni o'chirish"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/30 transition disabled:opacity-50"
                          >
                            <Trash2 className={`w-3 h-3 ${busyAction === `del:${job.id}` ? 'animate-pulse' : ''}`} />
                            <span>O‘chirish</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Cheksiz yuklash: shu element ko'rinishga yaqinlashganda keyingi sahifa so'raladi */}
            <div ref={loadMoreRef} aria-hidden className="h-px" />
            {gridJobs.length > 0 && (
              <div className="pt-6 pb-2 text-center text-xs text-gray-500">
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    Yuklanmoqda...
                  </span>
                ) : page < totalPages ? (
                  <button type="button" onClick={() => setPage((p) => p + 1)} className="text-blue-400 hover:text-blue-300">
                    Yana ko‘rsatish
                  </button>
                ) : (
                  <span>Hammasi ko‘rsatildi — jami {pagination?.total_items ?? gridJobs.length} ta video</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pagination footer (faqat jadvalda; kartochkalar cheksiz aylantiriladi) */}
        {viewMode === 'table' && pagination && pagination.total_pages > 1 && (
          <div className="p-4 border-t border-white/10 bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ui-muted">
            <div>
              Jami <span className="font-semibold text-white">{pagination.total_items}</span> ta job,{' '}
              sahifa <span className="font-semibold text-white">{pagination.page}</span> / {pagination.total_pages}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition border border-white/10"
              >
                <ChevronLeft className="w-4 h-4 text-gray-300" />
              </button>

              <span className="px-3 py-1 font-mono font-medium text-white bg-white/5 rounded-lg border border-white/10">
                {page}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={page >= pagination.total_pages}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition border border-white/10"
              >
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Slide-over / Modal for Selected Job */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-in fade-in duration-200">
          <div className="bg-[#12141a] border border-white/20 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#12141a] z-10">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <FileText className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-white">Job Tafsilotlari & Xarajatlar</h3>
                  <p className="text-xs font-mono text-ui-muted">{selectedJob.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-ui-muted hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-5">
              {/* Video Info Preview */}
              <div className="flex flex-col sm:flex-row gap-4 p-3 bg-white/5 border border-white/10 rounded-xl">
                {selectedJob.video_thumbnail && (
                  <img
                    src={selectedJob.video_thumbnail}
                    alt={selectedJob.video_title}
                    className="w-full sm:w-36 h-20 object-cover rounded-lg border border-white/10"
                  />
                )}
                <div className="space-y-1.5 min-w-0 flex-1">
                  <h4 className="font-semibold text-white text-sm line-clamp-2">{selectedJob.video_title}</h4>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ui-muted">
                    <span>Davomiyligi: <strong className="text-gray-200">{formatDurationBadge(selectedJob.video_duration)}</strong></span>
                    <span>Qayta ishlash: <strong className="text-gray-200">{formatSeconds(selectedJob.processing_seconds)}</strong></span>
                    <span>Uringan vaqti: <strong className="text-white font-mono">{formatDateTime(selectedJob.created_at).full}</strong></span>
                    {selectedJob.completed_at && (
                      <span>Tugallandi: <strong className="text-emerald-400 font-mono">{formatDateTime(selectedJob.completed_at).full}</strong></span>
                    )}
                  </div>
                  {selectedJob.youtube_url && (
                    <a
                      href={selectedJob.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium mt-1"
                    >
                      <span>YouTube'da ochish</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Status & Error Section */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ui-muted ">Holat & Bosqich</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusBadge(selectedJob.status).color}`}>
                    {getStatusBadge(selectedJob.status).label} ({Math.round(selectedJob.progress)}%)
                  </span>
                </div>
                {selectedJob.status_message && (
                  <p className="text-xs text-gray-300">{selectedJob.status_message}</p>
                )}
                {selectedJob.error_message && (
                  <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
                      <ShieldAlert className="w-4 h-4" />
                      <span>Xatolik: {selectedJob.error_code || 'NOMAʼLUM'}</span>
                    </div>
                    <p className="text-rose-300 font-mono text-xs whitespace-pre-wrap break-all">
                      {selectedJob.error_message}
                    </p>
                  </div>
                )}
              </div>

              {/* Unit Economics Breakdown Card */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>Unit Economics (Xarajatlar Tafsiloti)</span>
                  </span>
                  <div className="text-right">
                    <div className="text-base font-semibold font-mono text-emerald-400">
                      {(selectedJob.costs?.total_cost_uzs ?? 0).toLocaleString()} UZS
                    </div>
                    <div className="text-xs text-ui-muted font-mono">
                      ${selectedJob.costs?.total_cost_usd ?? 0} USD
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* TTS */}
                  <div className="p-3 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between text-xs text-ui-muted mb-1">
                      <span>TTS (Ovoz)</span>
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="text-sm font-semibold text-white font-mono">
                      ${selectedJob.costs?.tts_cost_usd ?? 0} USD
                    </div>
                    <div className="text-xs text-ui-muted mt-1">
                      {(selectedJob.costs?.tts_characters ?? 0).toLocaleString()} ta belgi
                    </div>
                    {(selectedJob.costs?.cache_hits_count ?? 0) > 0 && (
                      <div className="text-xs text-emerald-400 mt-0.5">
                        Kesh: +${selectedJob.costs?.cache_saved_usd ?? 0} tejandi
                      </div>
                    )}
                  </div>

                  {/* STT */}
                  <div className="p-3 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between text-xs text-ui-muted mb-1">
                      <span>STT (Nutq)</span>
                      <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <div className="text-sm font-semibold font-mono flex items-center gap-1.5">
                      <span className={(selectedJob.costs?.stt_cost_usd ?? 0) === 0 ? "text-emerald-400" : "text-white"}>
                        ${selectedJob.costs?.stt_cost_usd ?? 0} USD
                      </span>
                      {(selectedJob.costs?.stt_cost_usd ?? 0) === 0 && (
                        <span className="text-xs font-sans font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          Bepul
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ui-muted mt-1">
                      Model: {selectedJob.models.stt_model || 'Whisper'}
                    </div>
                  </div>

                  {/* LLM */}
                  <div className="p-3 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between text-xs text-ui-muted mb-1">
                      <span>Tarjima (LLM)</span>
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <div className="text-sm font-semibold text-white font-mono">
                      ${selectedJob.costs?.llm_cost_usd ?? 0} USD
                    </div>
                    <div className="text-xs text-ui-muted mt-1">
                      Model: {selectedJob.models.translation_model || 'Gemini'}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-ui-muted">
                  <span>1 daqiqa dublyaj narxi:</span>
                  <span className="font-semibold text-white font-mono">
                    {(selectedJob.costs?.cost_per_minute_uzs ?? 0).toLocaleString()} UZS / daqiqa
                  </span>
                </div>

                {/* AI Key Tier Status */}
                <div className="p-2.5 bg-black/25 rounded-lg border border-white/5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-ui-muted text-xs">Gemini kalit toifasi:</span>
                    {selectedJob.models.gemini_key_tier === 'paid' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <span>💎</span>
                        <span>Pullik (Balansli) kalit</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                        <span>🆓</span>
                        <span>Bepul kalit (30+ hovuz)</span>
                      </span>
                    )}
                  </div>
                  {selectedJob.models.gemini_key_used && (
                    <span className="font-mono text-xs text-ui-muted bg-white/5 px-1.5 py-0.5 rounded">
                      {selectedJob.models.gemini_key_used}
                    </span>
                  )}
                </div>

                {/* Payment Margin if paid */}
                {selectedJob.payment.has_payment && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-emerald-400">Mijoz to‘lovi mavjud ({selectedJob.payment.provider})</p>
                      <p className="text-gray-300 text-xs mt-0.5">
                        Tushum: {selectedJob.payment.revenue_uzs.toLocaleString()} UZS
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold font-mono text-emerald-300 text-sm">
                        +{selectedJob.payment.profit_uzs?.toLocaleString()} UZS
                      </p>
                      <p className="text-xs text-emerald-400">
                        Marja: {selectedJob.payment.margin_pct}%
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* QA Summary */}
              {selectedJob.qa_summary && (
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
                  <span className="text-xs font-semibold text-ui-muted ">
                    Audio QA Avtomatik Tekshiruvi
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                    <div className="p-2 bg-black/30 rounded border border-white/5">
                      <div className="text-ui-muted text-xs">Segmentlar</div>
                      <div className="font-semibold text-white font-mono mt-0.5">{selectedJob.qa_summary.total_segments}</div>
                    </div>
                    <div className="p-2 bg-black/30 rounded border border-white/5">
                      <div className="text-ui-muted text-xs">Muvaffaqiyatli</div>
                      <div className="font-semibold text-emerald-400 font-mono mt-0.5">{selectedJob.qa_summary.passed_segments}</div>
                    </div>
                    <div className="p-2 bg-black/30 rounded border border-white/5">
                      <div className="text-ui-muted text-xs">O‘rtacha Ball</div>
                      <div className="font-semibold text-cyan-400 font-mono mt-0.5">{selectedJob.qa_summary.avg_score || '—'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {['DOWNLOADING', 'TRANSCRIBING', 'TRANSLATING', 'SYNTHESIZING', 'SYNCING', 'MERGING', 'PENDING'].includes(selectedJob.status) && (
                  <button
                    onClick={() => {
                      const id = selectedJob.id
                      setSelectedJob(null)
                      handleCancelJob(id)
                    }}
                    disabled={cancellingId === selectedJob.id}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Jarayonni to‘xtatish</span>
                  </button>
                )}
                {selectedJob.status === 'FAILED' && !isNonRetryable(selectedJob.error_code) && (
                  <button
                    onClick={() => {
                      const target = selectedJob
                      setSelectedJob(null)
                      openRetryModal(target)
                    }}
                    disabled={retryingId === selectedJob.id}
                    className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retryingId === selectedJob.id ? 'animate-spin' : ''}`} />
                    <span>Qayta ishga tushirish (Retry)</span>
                  </button>
                )}
                {selectedJob.status === 'COMPLETED' && (
                  <button
                    onClick={() => {
                      const target = selectedJob
                      setSelectedJob(null)
                      openRetryModal(target)
                    }}
                    disabled={retryingId === selectedJob.id}
                    className="px-3.5 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm "
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retryingId === selectedJob.id ? 'animate-spin' : ''}`} />
                    <span>Qayta tayyorlash (Regenerate)</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition"
              >
                Yopish
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Granular Retry Modal: TTS, STT, LLM individual model selection & live unit economics */}
      {retryModalJob && (() => {
        const durSec = retryModalJob.video_duration || 60
        const durMin = Math.max(0.1, durSec / 60)
        // Videoning haqiqiy belgilari mavjud bo'lsa, o'shani olamiz.
        // Agar realChars video davomiyligiga nisbatan asossiz kichik bo'lsa (masalan job yiqilib faqat 1 ta segment yozilgan bo'lsa), video davomiyligiga mos to'liq belgi sonini olamiz:
        const realChars = retryModalJob.costs?.tts_characters || 0
        const minExpectedChars = Math.round(durMin * 600)
        const estChars = (realChars >= minExpectedChars) ? realChars : Math.round(durMin * 1100)

        // TTS Cost:
        // Foydalanuvchi talabi: TTS da Gemini pullik narxini doim chiqaraver!
        let estTTSUsd = 0
        if (retryTtsOption === 'gemini_paid' || retryTtsOption === 'gemini_free') {
          estTTSUsd = (estChars / 1000) * 0.017
        } else if (retryTtsOption === 'azure') {
          estTTSUsd = (estChars / 1000) * 0.016
        } else {
          estTTSUsd = 0 // edge
        }

        // STT Cost:
        let estSTTUsd = 0
        if (retrySttOption === 'existing' || retrySttOption === 'groq' || retrySttOption === 'gemini_free') {
          estSTTUsd = 0
        } else if (retrySttOption === 'gemini_paid') {
          estSTTUsd = durMin * 0.002
        } else if (retrySttOption === 'openai') {
          estSTTUsd = durMin * 0.006
        }

        // LLM Cost:
        let estLLMUsd = 0
        if (retryLlmOption === 'existing' || retryLlmOption === 'gemini_free' || retryLlmOption === 'groq') {
          estLLMUsd = 0
        } else if (retryLlmOption === 'gemini_paid') {
          estLLMUsd = (estChars / 1000) * 0.0005
        } else if (retryLlmOption === 'openai') {
          estLLMUsd = (estChars / 1000) * 0.001
        }

        const estTotalUsd = estTTSUsd + estSTTUsd + estLLMUsd
        const estTotalUzs = Math.round(estTotalUsd * 12800)

        const estTTSUzs = Math.round(estTTSUsd * 12800)
        const estSTTUzs = Math.round(estSTTUsd * 12800)
        const estLLMUzs = Math.round(estLLMUsd * 12800)

        const onConfirmRetry = () => {
          let ttsProv = 'gemini'
          if (retryTtsOption === 'edge') ttsProv = 'edge'
          else if (retryTtsOption === 'azure') ttsProv = 'azure'
          else ttsProv = 'gemini'

          let sttProv = 'groq'
          if (retrySttOption === 'gemini_paid' || retrySttOption === 'gemini_free') sttProv = 'gemini-3.8-flash'
          else if (retrySttOption === 'openai') sttProv = 'whisper-1'
          else sttProv = 'groq'

          let transModel = 'gemini-3.8-flash'
          if (retryLlmOption === 'openai') transModel = 'gpt-4o-mini'
          else if (retryLlmOption === 'groq') transModel = 'qwen/qwen3.8-27b'
          else transModel = 'gemini-3.8-flash'

          const geminiTier =
            retryTtsOption === 'gemini_paid' || retrySttOption === 'gemini_paid' || retryLlmOption === 'gemini_paid'
              ? 'paid'
              : 'free'

          handleRetryJob(retryModalJob.id, {
            tts_provider: ttsProv,
            gemini_key_tier: geminiTier,
            stt_provider: sttProv,
            translation_model: transModel,
            reuse_transcript: retrySttOption === 'existing',
            reuse_translation: retryLlmOption === 'existing',
          })
        }

        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-[#11141f] border border-white/10 rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#11141f]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-white">Qayta ishga tushirish (AI Modellar)</h3>
                    <p className="text-xs text-ui-muted line-clamp-1 max-w-[320px] sm:max-w-[400px]">
                      {retryModalJob.video_title}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setRetryModalJob(null)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-ui-muted hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
                {/* Video Info pill */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-ui-muted">
                    <span>Davomiyligi:</span>
                    <strong className="text-white font-mono">
                      {Math.floor(retryModalJob.video_duration / 60)} daq {retryModalJob.video_duration % 60} soniya
                    </strong>
                  </div>
                  {retryModalJob.error_code && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-ui-muted">Oxirgi xatolik:</span>
                      <span className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                        {retryModalJob.error_code}
                      </span>
                    </div>
                  )}
                </div>

                {/* 1. TTS OVOZ SINTEZI */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>TTS Ovoz Sintezi (Ovoz yaratish):</span>
                    </label>
                    <span className="text-xs text-cyan-300 font-mono">
                      {estTTSUzs > 0 ? `~${estTTSUzs.toLocaleString()} UZS` : '0 UZS'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {/* Gemini Paid */}
                    <div
                      onClick={() => setRetryTtsOption('gemini_paid')}
                      className={`cursor-pointer rounded-xl p-3 border transition-all ${
                        retryTtsOption === 'gemini_paid'
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-md '
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="retry_tts"
                            checked={retryTtsOption === 'gemini_paid'}
                            onChange={() => setRetryTtsOption('gemini_paid')}
                            className="accent-amber-500"
                          />
                          <span className="text-xs font-semibold text-white flex items-center gap-1">
                            <span>💎</span>
                            <span>Gemini: Pullik API (Tavsiya etiladi)</span>
                          </span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                          ~{estTTSUzs.toLocaleString()} UZS (~${estTTSUsd.toFixed(3)})
                        </span>
                      </div>
                      <p className="text-xs text-ui-muted mt-1 pl-5">
                        Balansli pullik Gemini kaliti orqali yuqori sifatli va cheklovlarsiz sintez.
                      </p>
                    </div>

                    {/* Edge TTS */}
                    <div
                      onClick={() => setRetryTtsOption('edge')}
                      className={`cursor-pointer rounded-xl p-3 border transition-all ${
                        retryTtsOption === 'edge'
                          ? 'bg-emerald-500/10 border-emerald-500/50 shadow-md '
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="retry_tts"
                            checked={retryTtsOption === 'edge'}
                            onChange={() => setRetryTtsOption('edge')}
                            className="accent-emerald-500"
                          />
                          <span className="text-xs font-semibold text-white flex items-center gap-1">
                            <span>⚡</span>
                            <span>Microsoft Edge Neural: Bepul</span>
                          </span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          0 UZS ($0.00)
                        </span>
                      </div>
                      <p className="text-xs text-ui-muted mt-1 pl-5">
                        Madina / Sardor ovozlari orqali 100% bepul sintez (Zaxirada Azure/Gemini himoyasi).
                      </p>
                    </div>

                    {/* Azure TTS */}
                    <div
                      onClick={() => setRetryTtsOption('azure')}
                      className={`cursor-pointer rounded-xl p-3 border transition-all ${
                        retryTtsOption === 'azure'
                          ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md '
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="retry_tts"
                            checked={retryTtsOption === 'azure'}
                            onChange={() => setRetryTtsOption('azure')}
                            className="accent-cyan-500"
                          />
                          <span className="text-xs font-semibold text-white flex items-center gap-1">
                            <span>☁️</span>
                            <span>Microsoft Azure Speech (Rasmiy API)</span>
                          </span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                          ~{Math.round((estChars / 1000) * 0.016 * 12800).toLocaleString()} UZS (~$0.016/1k)
                        </span>
                      </div>
                      <p className="text-xs text-ui-muted mt-1 pl-5">
                        Azure Cognitive Services rasmiy kaliti orqali tezkor va ishonchli sintez (500k bepul limiti mavjud).
                      </p>
                    </div>

                    {/* Gemini Free (Locked when in cooldown) */}
                    <div
                      onClick={() => {
                        if (!isFreeKeysInCooldown) setRetryTtsOption('gemini_free')
                      }}
                      className={`rounded-xl p-3 border transition-all ${
                        isFreeKeysInCooldown
                          ? 'opacity-60 cursor-not-allowed bg-rose-500/5 border-rose-500/30'
                          : retryTtsOption === 'gemini_free'
                          ? 'bg-blue-500/10 border-blue-500/50 cursor-pointer'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="retry_tts"
                            checked={retryTtsOption === 'gemini_free'}
                            onChange={() => {
                              if (!isFreeKeysInCooldown) setRetryTtsOption('gemini_free')
                            }}
                            disabled={isFreeKeysInCooldown}
                            className="accent-blue-500"
                          />
                          <span className="text-xs font-medium text-gray-300 flex items-center gap-1">
                            <span>🆓</span>
                            <span>Gemini: Bepul kalit hovuzi</span>
                          </span>
                        </div>
                        {isFreeKeysInCooldown ? (
                          <span className="text-xs font-mono font-semibold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40">
                            🔒 BLOKLANGAN (429 Limit)
                          </span>
                        ) : (
                          <span className="text-xs font-mono font-semibold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                            ~{estTTSUzs.toLocaleString()} UZS (~${estTTSUsd.toFixed(3)})
                          </span>
                        )}
                      </div>
                      {isFreeKeysInCooldown ? (
                        <p className="text-xs text-rose-400 font-medium mt-1 pl-5">
                          ⛔ Barcha bepul kalitlar 429 limitda! Tiklanishiga aniq: <strong>{exactCooldownText}</strong> qoldi. Iltimos, Pullik API yoki 100% bepul Microsoft Edge tanlang.
                        </p>
                      ) : (
                        <p className="text-xs text-amber-400/90 mt-1 pl-5">
                          ⚠️ Google bepul kalitlarida TTS kvotasi past va ko‘pincha 429 xatosi beradi. Real stavka: ~${estTTSUsd.toFixed(3)}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. STT TRANSKRIPSIYA */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-purple-400" />
                      <span>STT Transkripsiya (Nutqni aniqlash):</span>
                    </label>
                    <span className="text-xs text-purple-300 font-mono">
                      {estSTTUzs > 0 ? `~${estSTTUzs.toLocaleString()} UZS` : '0 UZS'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Existing text reuse */}
                    {retryModalJob.models.has_transcript && (
                      <div
                        onClick={() => setRetrySttOption('existing')}
                        className={`sm:col-span-2 cursor-pointer rounded-xl p-2.5 border transition-all ${
                          retrySttOption === 'existing'
                            ? 'bg-purple-500/15 border-purple-500/50 text-white'
                            : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <label className="flex items-center gap-2 cursor-pointer font-medium">
                            <input
                              type="radio"
                              name="retry_stt"
                              checked={retrySttOption === 'existing'}
                              onChange={() => setRetrySttOption('existing')}
                              className="accent-purple-500"
                            />
                            <span>✅ Saqlangan transkript (Kesh, 0 UZS)</span>
                          </label>
                          <span className="text-xs font-mono text-purple-300">Vaqt tejaladi</span>
                        </div>
                      </div>
                    )}

                    {/* Groq Whisper */}
                    <div
                      onClick={() => setRetrySttOption('groq')}
                      className={`cursor-pointer rounded-xl p-2.5 border transition-all ${
                        retrySttOption === 'groq'
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                          : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="retry_stt"
                            checked={retrySttOption === 'groq'}
                            onChange={() => setRetrySttOption('groq')}
                            className="accent-emerald-500"
                          />
                          <span>⚡ Groq Whisper (Bepul)</span>
                        </label>
                        <span className="text-xs font-mono text-emerald-400">0 UZS</span>
                      </div>
                    </div>

                    {/* Gemini Free STT */}
                    <div
                      onClick={() => {
                        if (!isFreeKeysInCooldown) setRetrySttOption('gemini_free')
                      }}
                      className={`rounded-xl p-2.5 border transition-all ${
                        isFreeKeysInCooldown
                          ? 'opacity-50 cursor-not-allowed bg-rose-500/5 border-rose-500/20'
                          : retrySttOption === 'gemini_free'
                          ? 'bg-blue-500/15 border-blue-500/50 text-white cursor-pointer'
                          : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 font-medium">
                          <input
                            type="radio"
                            name="retry_stt"
                            checked={retrySttOption === 'gemini_free'}
                            onChange={() => {
                              if (!isFreeKeysInCooldown) setRetrySttOption('gemini_free')
                            }}
                            disabled={isFreeKeysInCooldown}
                            className="accent-blue-500"
                          />
                          <span>🆓 Gemini Flash (Bepul)</span>
                        </label>
                        {isFreeKeysInCooldown ? (
                          <span className="text-xs font-mono text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded">
                            429 ({exactCooldownText})
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-blue-300">0 UZS ($0)</span>
                        )}
                      </div>
                    </div>

                    {/* Gemini Paid STT */}
                    <div
                      onClick={() => setRetrySttOption('gemini_paid')}
                      className={`cursor-pointer rounded-xl p-2.5 border transition-all ${
                        retrySttOption === 'gemini_paid'
                          ? 'bg-amber-500/15 border-amber-500/50 text-white'
                          : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="retry_stt"
                            checked={retrySttOption === 'gemini_paid'}
                            onChange={() => setRetrySttOption('gemini_paid')}
                            className="accent-amber-500"
                          />
                          <span>💎 Gemini Flash (Pullik)</span>
                        </label>
                        <span className="text-xs font-mono text-amber-300">
                          ~{Math.round(durMin * 0.002 * 12800).toLocaleString()} UZS
                        </span>
                      </div>
                    </div>

                    {/* OpenAI Whisper */}
                    <div
                      onClick={() => setRetrySttOption('openai')}
                      className={`cursor-pointer rounded-xl p-2.5 border transition-all ${
                        retrySttOption === 'openai'
                          ? 'bg-white/15 border-white/40 text-white'
                          : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="retry_stt"
                            checked={retrySttOption === 'openai'}
                            onChange={() => setRetrySttOption('openai')}
                            className="accent-gray-400"
                          />
                          <span>🤖 OpenAI Whisper</span>
                        </label>
                        <span className="text-xs font-mono text-gray-300">
                          ~{Math.round(durMin * 0.006 * 12800).toLocaleString()} UZS
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. LLM TARJIMA */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>LLM Tarjima (O‘zbek tiliga o‘girish):</span>
                    </label>
                    <span className="text-xs text-indigo-300 font-mono">
                      {estLLMUzs > 0 ? `~${estLLMUzs.toLocaleString()} UZS` : '0 UZS'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Existing translation reuse */}
                    {retryModalJob.models.has_translation && (
                      <div
                        onClick={() => setRetryLlmOption('existing')}
                        className={`sm:col-span-2 cursor-pointer rounded-xl p-2.5 border transition-all ${
                          retryLlmOption === 'existing'
                            ? 'bg-indigo-500/15 border-indigo-500/50 text-white'
                            : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <label className="flex items-center gap-2 cursor-pointer font-medium">
                            <input
                              type="radio"
                              name="retry_llm"
                              checked={retryLlmOption === 'existing'}
                              onChange={() => setRetryLlmOption('existing')}
                              className="accent-indigo-500"
                            />
                            <span>✅ Saqlangan tarjima (Kesh, 0 UZS)</span>
                          </label>
                          <span className="text-xs font-mono text-indigo-300">Mavjud matn</span>
                        </div>
                      </div>
                    )}

                    {/* Gemini Free Translation */}
                    <div
                      onClick={() => {
                        if (!isFreeKeysInCooldown) setRetryLlmOption('gemini_free')
                      }}
                      className={`rounded-xl p-2.5 border transition-all ${
                        isFreeKeysInCooldown
                          ? 'opacity-50 cursor-not-allowed bg-rose-500/5 border-rose-500/20'
                          : retryLlmOption === 'gemini_free'
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-white cursor-pointer'
                          : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 font-medium">
                          <input
                            type="radio"
                            name="retry_llm"
                            checked={retryLlmOption === 'gemini_free'}
                            onChange={() => {
                              if (!isFreeKeysInCooldown) setRetryLlmOption('gemini_free')
                            }}
                            disabled={isFreeKeysInCooldown}
                            className="accent-emerald-500"
                          />
                          <span>🆓 Gemini 3.8 (Bepul pool)</span>
                        </label>
                        {isFreeKeysInCooldown ? (
                          <span className="text-xs font-mono text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded">
                            429 ({exactCooldownText})
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-emerald-400">0 UZS</span>
                        )}
                      </div>
                    </div>

                    {/* Groq Cloud LPU (100% Free Translation) */}
                    <div
                      onClick={() => setRetryLlmOption('groq')}
                      className={`cursor-pointer rounded-xl p-2.5 border transition-all ${
                        retryLlmOption === 'groq'
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                          : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="retry_llm"
                            checked={retryLlmOption === 'groq'}
                            onChange={() => setRetryLlmOption('groq')}
                            className="accent-emerald-500"
                          />
                          <span>⚡ Groq Cloud LPU (Bepul, 0 UZS)</span>
                        </label>
                        <span className="text-xs font-mono text-emerald-400">0 UZS (LPU tezkor)</span>
                      </div>
                    </div>

                    {/* Gemini Paid Translation */}
                    <div
                      onClick={() => setRetryLlmOption('gemini_paid')}
                      className={`cursor-pointer rounded-xl p-2.5 border transition-all ${
                        retryLlmOption === 'gemini_paid'
                          ? 'bg-amber-500/15 border-amber-500/50 text-white'
                          : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="retry_llm"
                            checked={retryLlmOption === 'gemini_paid'}
                            onChange={() => setRetryLlmOption('gemini_paid')}
                            className="accent-amber-500"
                          />
                          <span>💎 Gemini 3.8 (Pullik API)</span>
                        </label>
                        <span className="text-xs font-mono text-amber-300">
                          ~{Math.round((estChars / 1000) * 0.0005 * 12800).toLocaleString()} UZS
                        </span>
                      </div>
                    </div>

                    {/* GPT-4o Mini */}
                    <div
                      onClick={() => setRetryLlmOption('openai')}
                      className={`cursor-pointer rounded-xl p-2.5 border transition-all ${
                        retryLlmOption === 'openai'
                          ? 'bg-white/15 border-white/40 text-white'
                          : 'bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="retry_llm"
                            checked={retryLlmOption === 'openai'}
                            onChange={() => setRetryLlmOption('openai')}
                            className="accent-gray-400"
                          />
                          <span>🤖 GPT-4o Mini</span>
                        </label>
                        <span className="text-xs font-mono text-gray-300">
                          ~{Math.round((estChars / 1000) * 0.001 * 12800).toLocaleString()} UZS
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COST BREAKDOWN CARD */}
                <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between text-ui-muted text-xs">
                    <span>TTS Ovoz sintezi:</span>
                    <span className={estTTSUzs > 0 ? 'text-amber-300 font-semibold' : 'text-emerald-400'}>
                      {estTTSUzs > 0 ? `~${estTTSUzs.toLocaleString()} UZS (~$${estTTSUsd.toFixed(3)})` : '0 UZS (Bepul)'}
                    </span>
                  </div>
                  <div className="flex justify-between text-ui-muted text-xs">
                    <span>STT Transkripsiya:</span>
                    <span className={estSTTUzs > 0 ? 'text-amber-300 font-semibold' : 'text-emerald-400'}>
                      {estSTTUzs > 0 ? `~${estSTTUzs.toLocaleString()} UZS (~$${estSTTUsd.toFixed(3)})` : '0 UZS (Bepul)'}
                    </span>
                  </div>
                  <div className="flex justify-between text-ui-muted text-xs">
                    <span>LLM Tarjima:</span>
                    <span className={estLLMUzs > 0 ? 'text-amber-300 font-semibold' : 'text-emerald-400'}>
                      {estLLMUzs > 0 ? `~${estLLMUzs.toLocaleString()} UZS (~$${estLLMUsd.toFixed(4)})` : '0 UZS (Bepul)'}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-xs pt-2 border-t border-white/10">
                    <span className="text-white font-sans">Jami kutilayotgan xarajat:</span>
                    <span className={estTotalUzs > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                      ~{estTotalUzs.toLocaleString()} UZS {estTotalUsd > 0 && `(~$${estTotalUsd.toFixed(3)})`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/[0.01] border-t border-white/10 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setRetryModalJob(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-ui-muted hover:text-white hover:bg-white/5 transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={onConfirmRetry}
                  disabled={
                    retryingId === retryModalJob.id ||
                    (isFreeKeysInCooldown &&
                      (retryTtsOption === 'gemini_free' ||
                        retrySttOption === 'gemini_free' ||
                        retryLlmOption === 'gemini_free'))
                  }
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    estTotalUzs > 0
                      ? 'bg-amber-600 hover:bg-amber-500 text-white '
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white '
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retryingId === retryModalJob.id ? 'animate-spin' : ''}`} />
                  <span>
                    {isFreeKeysInCooldown &&
                    (retryTtsOption === 'gemini_free' ||
                      retrySttOption === 'gemini_free' ||
                      retryLlmOption === 'gemini_free')
                      ? 'Bepul kalitlar 429 limitda'
                      : estTotalUzs > 0
                      ? `Ishga tushirish (~${estTotalUzs.toLocaleString()} UZS)`
                      : 'Bepul ishga tushirish (0 UZS)'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
