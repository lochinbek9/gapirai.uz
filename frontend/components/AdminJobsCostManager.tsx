'use client'

import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import {
  apiAdminJobsCost,
  AdminJobsCostResponse,
  AdminJobCostItem,
} from '@/lib/admin'

interface AdminJobsCostManagerProps {
  token: string
}

export default function AdminJobsCostManager({ token }: AdminJobsCostManagerProps) {
  const [data, setData] = useState<AdminJobsCostResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters state
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [ttsProviderFilter, setTtsProviderFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [includeInternal, setIncludeInternal] = useState(false)

  // Detail Modal State
  const [selectedJob, setSelectedJob] = useState<AdminJobCostItem | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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
      const res = await apiAdminJobsCost(
        token,
        page,
        pageSize,
        statusFilter === 'ALL' ? undefined : statusFilter,
        debouncedSearch || undefined,
        ttsProviderFilter === 'ALL' ? undefined : ttsProviderFilter,
        includeInternal,
        sortBy
      )
      setData(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Maʼlumotlarni yuklab bo‘lmadi')
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, statusFilter, debouncedSearch, ttsProviderFilter, includeInternal, sortBy])

  useEffect(() => {
    loadData()
  }, [loadData])

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return {
          label: 'Tayyor',
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-400',
        }
      case 'FAILED':
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
          color: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
          dot: 'bg-gray-400',
        }
    }
  }

  const summary = data?.summary
  const jobs = data?.jobs || []
  const pagination = data?.pagination

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-gradient-to-r from-blue-900/30 via-purple-900/20 to-black border border-white/10 rounded-2xl p-5 sm:p-6 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Layers className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Dublyaj Joblari va Xarajatlar Tahlili
                </h2>
                <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
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
                className="rounded border-gray-600 bg-black/40 text-blue-500 focus:ring-0"
              />
              <span>Dasturchi / Test hisoblarni ham ko‘rsatish</span>
            </label>

            {/* Refresh button */}
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-lg shadow-blue-500/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Yangilash</span>
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
            {/* Card 1: Total & Success */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Jami Dublyajlar</span>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {summary.success_rate_pct}% muvaffaqiyat
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white font-mono">
                {summary.total_jobs.toLocaleString()}
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                <span className="text-emerald-400">✓ {summary.completed_jobs} tayyor</span>
                <span className="text-rose-400">✗ {summary.failed_jobs} xatolik</span>
                {summary.processing_jobs > 0 && (
                  <span className="text-amber-400 animate-pulse">● {summary.processing_jobs} jarayonda</span>
                )}
              </div>
            </div>

            {/* Card 2: Cost Summary */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Sahifa Xarajati</span>
                <span className="text-[11px] font-mono text-blue-400">
                  ${summary.page_total_cost_usd} USD
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono">
                {summary.page_total_cost_uzs.toLocaleString()} <span className="text-xs text-gray-400 font-normal">UZS</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-2">
                1 ta video o‘rtacha: <span className="text-gray-200 font-medium">{summary.page_avg_job_cost_uzs.toLocaleString()} UZS</span>
              </div>
            </div>

            {/* Card 3: Total Audio Duration */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Muvaffaqiyatli Dublyaj Vaqti</span>
                <Clock className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white font-mono">
                {summary.total_completed_duration_min.toLocaleString()} <span className="text-xs text-gray-400 font-normal">daqiqa</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-2">
                Taxminan: <span className="text-gray-200 font-medium">{Math.round(summary.total_completed_duration_min / 60)} soat</span> video
              </div>
            </div>

            {/* Card 4: Providers Breakdown */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1.5 flex items-center justify-between">
                <span>TTS Provayderlar</span>
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto pr-1">
                {Object.entries(summary.providers).map(([prov, count]) => (
                  <span
                    key={prov}
                    className="inline-flex items-center gap-1 text-[11px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-300 font-mono"
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
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                  statusFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-black/20 text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search, Provider, Sorting */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[200px] sm:min-w-[260px] flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Provider Filter */}
            <select
              value={ttsProviderFilter}
              onChange={(e) => {
                setTtsProviderFilter(e.target.value)
                setPage(1)
              }}
              className="bg-black/30 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Barcha TTS</option>
              <option value="azure">Azure</option>
              <option value="edge">Edge (Bepul)</option>
              <option value="gemini">Gemini</option>
              <option value="uzbekvoice">UzbekVoice</option>
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="bg-black/30 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="newest">Eng yangi</option>
              <option value="oldest">Eng eski</option>
              <option value="duration_desc">Eng uzun video (yuqori xarajat)</option>
              <option value="duration_asc">Eng qisqa video</option>
            </select>
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

      {/* Data Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-gray-400 text-[11px] font-semibold tracking-wider uppercase">
                <th className="py-3 px-4">Video & ID</th>
                <th className="py-3 px-4">Foydalanuvchi</th>
                <th className="py-3 px-4">Status & Bosqich</th>
                <th className="py-3 px-4">Modellar</th>
                <th className="py-3 px-4 text-right">Unit Economics (Xarajat)</th>
                <th className="py-3 px-4 text-center">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                    <span>Yuklanmoqda...</span>
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Hech qanday dublyaj jobi topilmadi.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const statusInfo = getStatusBadge(job.status)
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
                            <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-black/80 font-mono text-gray-200 px-1 rounded">
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
                            <div className="flex items-center gap-2 mt-1">
                              {/* UUID button */}
                              <button
                                onClick={() => copyToClipboard(job.id, job.id)}
                                title="ID nusxalash"
                                className="font-mono text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded"
                              >
                                {copiedId === job.id ? (
                                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-2.5 h-2.5" />
                                )}
                                <span>{job.id.substring(0, 8)}...</span>
                              </button>

                              {/* YouTube link */}
                              {job.youtube_url && (
                                <a
                                  href={job.youtube_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-0.5 transition"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  <span>YT</span>
                                </a>
                              )}

                              {job.subtitle_only && (
                                <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1 rounded">
                                  Faqat subtitr
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
                          <p className="text-[11px] text-gray-400 truncate">
                            {job.user.email || job.user.phone || '—'}
                          </p>
                          {job.user.is_internal && (
                            <span className="inline-block mt-0.5 text-[9px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1 rounded">
                              Dasturchi / Test
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status & Pipeline Stage */}
                      <td className="py-3.5 px-4 min-w-[170px]">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusInfo.color}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                            <span>{statusInfo.label}</span>
                          </span>

                          {job.processing_seconds !== null && (
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{formatSeconds(job.processing_seconds)}</span>
                            </p>
                          )}

                          {job.error_code && (
                            <p className="text-[10px] font-mono text-rose-400 truncate max-w-[150px]" title={job.error_message || ''}>
                              {job.error_code}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Models */}
                      <td className="py-3.5 px-4 min-w-[160px]">
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-500 text-[10px]">TTS:</span>
                            <span className="font-medium text-cyan-400 uppercase text-[10px] bg-cyan-500/10 px-1 rounded border border-cyan-500/20">
                              {job.models.tts_provider}
                            </span>
                            {job.models.voice_name && (
                              <span className="text-gray-400 text-[10px] truncate max-w-[80px]" title={job.models.voice_name}>
                                {job.models.voice_name.replace('uz-UZ-', '')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <span>STT:</span>
                            <span className="text-gray-300 font-mono text-[9px]">
                              {job.models.stt_model?.replace('gemini-', 'gem-') || 'whisper-1'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Unit Economics (Costs) */}
                      <td className="py-3.5 px-4 text-right min-w-[180px]">
                        <div>
                          {/* Total UZS & USD */}
                          <div className="text-sm font-bold font-mono text-emerald-400">
                            {job.costs.total_cost_uzs.toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">UZS</span>
                          </div>
                          <div className="text-[10px] font-mono text-gray-400">
                            ${job.costs.total_cost_usd} USD
                          </div>

                          {/* Breakdown pills */}
                          <div className="flex items-center justify-end gap-1.5 mt-1 text-[9px] text-gray-400 font-mono">
                            <span title="TTS xarajati">TTS: ${job.costs.tts_cost_usd}</span>
                            <span>•</span>
                            <span title="STT xarajati">STT: ${job.costs.stt_cost_usd}</span>
                            <span>•</span>
                            <span title="LLM xarajati">LLM: ${job.costs.llm_cost_usd}</span>
                          </div>

                          {/* Payment badge if paid */}
                          {job.payment.has_payment && (
                            <div className="mt-1 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 inline-flex items-center gap-1">
                              <span>Tushum: +{job.payment.revenue_uzs.toLocaleString()} UZS</span>
                              {job.payment.margin_pct !== null && (
                                <span className="font-bold">({job.payment.margin_pct}%)</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 hover:text-blue-300 text-xs font-medium transition border border-white/10"
                        >
                          Batafsil
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {pagination && pagination.total_pages > 1 && (
          <div className="p-4 border-t border-white/10 bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12141a] border border-white/20 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#12141a] z-10">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <FileText className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Job Tafsilotlari & Xarajatlar</h3>
                  <p className="text-[11px] font-mono text-gray-400">{selectedJob.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition"
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
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span>Davomiyligi: <strong className="text-gray-200">{formatDurationBadge(selectedJob.video_duration)}</strong></span>
                    <span>Qayta ishlash: <strong className="text-gray-200">{formatSeconds(selectedJob.processing_seconds)}</strong></span>
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
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Holat & Bosqich</span>
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
                    <p className="text-rose-300 font-mono text-[11px] whitespace-pre-wrap break-all">
                      {selectedJob.error_message}
                    </p>
                  </div>
                )}
              </div>

              {/* Unit Economics Breakdown Card */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>Unit Economics (Xarajatlar Tafsiloti)</span>
                  </span>
                  <div className="text-right">
                    <div className="text-base font-bold font-mono text-emerald-400">
                      {selectedJob.costs.total_cost_uzs.toLocaleString()} UZS
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">
                      ${selectedJob.costs.total_cost_usd} USD
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* TTS */}
                  <div className="p-3 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>TTS (Ovoz)</span>
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="text-sm font-bold text-white font-mono">
                      ${selectedJob.costs.tts_cost_usd} USD
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      {selectedJob.costs.tts_characters.toLocaleString()} ta belgi
                    </div>
                    {selectedJob.costs.cache_hits_count > 0 && (
                      <div className="text-[10px] text-emerald-400 mt-0.5">
                        Kesh: +${selectedJob.costs.cache_saved_usd} tejandi
                      </div>
                    )}
                  </div>

                  {/* STT */}
                  <div className="p-3 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>STT (Nutq)</span>
                      <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <div className="text-sm font-bold text-white font-mono">
                      ${selectedJob.costs.stt_cost_usd} USD
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      Model: {selectedJob.models.stt_model || 'Whisper'}
                    </div>
                  </div>

                  {/* LLM */}
                  <div className="p-3 bg-black/30 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Tarjima (LLM)</span>
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <div className="text-sm font-bold text-white font-mono">
                      ${selectedJob.costs.llm_cost_usd} USD
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      Model: {selectedJob.models.translation_model || 'Gemini'}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                  <span>1 daqiqa dublyaj narxi:</span>
                  <span className="font-bold text-white font-mono">
                    {selectedJob.costs.cost_per_minute_uzs.toLocaleString()} UZS / daqiqa
                  </span>
                </div>

                {/* Payment Margin if paid */}
                {selectedJob.payment.has_payment && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-emerald-400">Mijoz to‘lovi mavjud ({selectedJob.payment.provider})</p>
                      <p className="text-gray-300 text-[11px] mt-0.5">
                        Tushum: {selectedJob.payment.revenue_uzs.toLocaleString()} UZS
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold font-mono text-emerald-300 text-sm">
                        +{selectedJob.payment.profit_uzs?.toLocaleString()} UZS
                      </p>
                      <p className="text-[10px] text-emerald-400">
                        Marja: {selectedJob.payment.margin_pct}%
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* QA Summary */}
              {selectedJob.qa_summary && (
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Audio QA Avtomatik Tekshiruvi
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                    <div className="p-2 bg-black/30 rounded border border-white/5">
                      <div className="text-gray-400 text-[10px]">Segmentlar</div>
                      <div className="font-bold text-white font-mono mt-0.5">{selectedJob.qa_summary.total_segments}</div>
                    </div>
                    <div className="p-2 bg-black/30 rounded border border-white/5">
                      <div className="text-gray-400 text-[10px]">Muvaffaqiyatli</div>
                      <div className="font-bold text-emerald-400 font-mono mt-0.5">{selectedJob.qa_summary.passed_segments}</div>
                    </div>
                    <div className="p-2 bg-black/30 rounded border border-white/5">
                      <div className="text-gray-400 text-[10px]">O‘rtacha Ball</div>
                      <div className="font-bold text-cyan-400 font-mono mt-0.5">{selectedJob.qa_summary.avg_score || '—'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 flex justify-end">
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
    </div>
  )
}
