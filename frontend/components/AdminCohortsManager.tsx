'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  RefreshCw,
  Users,
  Zap,
  CheckCircle2,
  Clock,
  Sparkles,
  Calendar,
  Layers,
  Award,
  AlertCircle,
  HelpCircle,
  BarChart3,
  Flame,
  ArrowRight,
  Shield,
  ChevronRight,
} from 'lucide-react'
import {
  apiAdminCohorts,
  CohortsResponse,
  RetentionCohortRow,
  ActivationCohortRow,
  CohortPeriodItem,
} from '@/lib/admin'

interface AdminCohortsManagerProps {
  token: string
}

export default function AdminCohortsManager({ token }: { token: string }) {
  const [data, setData] = useState<CohortsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [activeTab, setActiveTab] = useState<'retention' | 'activation' | 'insights'>('retention')
  const [granularity, setGranularity] = useState<'weekly' | 'monthly'>('weekly')
  const [metric, setMetric] = useState<'activity' | 'jobs' | 'paying'>('activity')
  const [periodsCount, setPeriodsCount] = useState<number>(8)
  const [includeInternal, setIncludeInternal] = useState(false)

  // Selected cell hover/click detail
  const [selectedCell, setSelectedCell] = useState<{
    cohortLabel: string
    cohortSize: number
    periodLabel: string
    activeCount: number
    retentionPct: number | null
  } | null>(null)

  const loadData = async () => {
    if (!token) return
    try {
      setLoading(true)
      setError(null)
      const res = await apiAdminCohorts(
        token,
        granularity,
        metric,
        periodsCount,
        includeInternal
      )
      setData(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Kohorta ma'lumotlarini yuklashda xatolik yuz berdi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, granularity, metric, periodsCount, includeInternal])

  // Heatmap color generator
  const getHeatmapColor = (pct: number | null, isFuture: boolean) => {
    if (isFuture || pct === null) {
      return 'bg-white/[0.01] text-gray-600 border-white/[0.03]'
    }
    if (pct === 0) {
      return 'bg-white/[0.02] text-gray-500 border-white/5'
    }
    if (pct < 3) {
      return 'bg-indigo-950/40 text-indigo-300 border-indigo-900/30'
    }
    if (pct < 8) {
      return 'bg-purple-900/40 text-purple-200 border-purple-800/40'
    }
    if (pct < 15) {
      return 'bg-purple-700/50 text-purple-100 border-purple-600/50 font-semibold'
    }
    if (pct < 30) {
      return 'bg-purple-600/70 text-white border-purple-500/70 font-bold shadow-sm shadow-purple-900/40'
    }
    if (pct < 50) {
      return 'bg-emerald-600/70 text-white border-emerald-500/70 font-bold shadow-sm shadow-emerald-900/40'
    }
    return 'bg-emerald-500 text-white border-emerald-400 font-extrabold shadow-md shadow-emerald-900/60'
  }

  const summary = data?.activation_summary

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
      {/* Sarlavha va Asosiy Boshqaruv */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Aktivatsiya va Retention Kohortalari
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Kohorta Tahlili
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Foydalanuvchilar qachon ro&apos;yxatdan o&apos;tgan, birinchi qiymatni qanday olgan va haftalar davomida qanday qaytmoqda?
            </p>
          </div>
        </div>

        {/* Filtrlar va Yangilash */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Haftalik / Oylik */}
          <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/10">
            <button
              onClick={() => setGranularity('weekly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                granularity === 'weekly'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Haftalik
            </button>
            <button
              onClick={() => setGranularity('monthly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                granularity === 'monthly'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Oylik
            </button>
          </div>

          {/* Davrlar soni */}
          <select
            value={periodsCount}
            onChange={(e) => setPeriodsCount(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
          >
            <option value={6} className="bg-slate-900">6 ta davr</option>
            <option value={8} className="bg-slate-900">8 ta davr</option>
            <option value={12} className="bg-slate-900">12 ta davr</option>
          </select>

          {/* Ichki hisoblar toggle */}
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300 cursor-pointer hover:bg-white/10 transition select-none">
            <input
              type="checkbox"
              checked={includeInternal}
              onChange={(e) => setIncludeInternal(e.target.checked)}
              className="rounded bg-black/40 border-white/20 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
            />
            <span className="text-[11px]">Ichki xodimlar</span>
          </label>

          {/* Refresh */}
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-xs font-medium text-indigo-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Highlight Cards (Activation & Retention summary) */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Card 1: D0 Fast Activation */}
          <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/20 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-indigo-300 text-[11px] font-medium">
              <span>D0 (24h) Aktivatsiya</span>
              <Zap className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-white">
                {summary.overall_d0_activation_pct}%
              </span>
              <span className="text-[10px] text-indigo-300/80 font-medium">
                (birinchi 24s)
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Ro&apos;yxatdan o&apos;tgan kunining o&apos;zida harakat
            </p>
          </div>

          {/* Card 2: Aha! Moment */}
          <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-emerald-300 text-[11px] font-medium">
              <span>&ldquo;Aha! Moment&rdquo; Qiymat</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-emerald-400">
                {summary.overall_aha_moment_pct}%
              </span>
              <span className="text-[10px] text-emerald-300/80 font-medium">
                tayyor video
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Kamida 1 ta muvaffaqiyatli natija olgan
            </p>
          </div>

          {/* Card 3: Habit Formation (2+ video) */}
          <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-purple-300 text-[11px] font-medium">
              <span>Odatlanish (Habit)</span>
              <Flame className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-purple-300">
                {summary.overall_habit_pct}%
              </span>
              <span className="text-[10px] text-purple-300/80 font-medium">
                2+ video
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Platformadan ko&apos;p martalik foydalanish
            </p>
          </div>

          {/* Card 4: Median Time-to-Action */}
          <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-amber-300 text-[11px] font-medium">
              <span>Median Harakat Vaqti</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-amber-300">
                {summary.median_time_to_first_action_min}
              </span>
              <span className="text-xs text-amber-400 font-bold">
                daqiqa
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Ro&apos;yxatdan o&apos;tgandan 1-videogacha
            </p>
          </div>

          {/* Card 5: W1 Retention Benchmark */}
          <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-xl p-3.5 space-y-1 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-blue-300 text-[11px] font-medium">
              <span>{granularity === 'weekly' ? 'O\'rtacha W1 Qaytish' : 'O\'rtacha M1 Qaytish'}</span>
              <TrendingUp className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-blue-300">
                {summary.avg_w1_retention_pct !== null ? `${summary.avg_w1_retention_pct}%` : '-'}
              </span>
              <span className="text-[10px] text-blue-300/80 font-medium">
                keyingi davrda
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Yangi kohortaning keyingi haftadagi faolligi
            </p>
          </div>
        </div>
      )}

      {/* Sub-tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('retention')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'retention'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Retention Kohorta Jadvali (Heatmap)
        </button>

        <button
          onClick={() => setActiveTab('activation')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'activation'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Zap className="w-4 h-4" />
          Aktivatsiya Bosqichlari (Funnel & Milestones)
        </button>

        <button
          onClick={() => setActiveTab('insights')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'insights'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Xulosalar va Tavsiyalar
          {data?.insights && data.insights.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-white/20 text-white text-[10px] flex items-center justify-center font-bold">
              {data.insights.length}
            </span>
          )}
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: RETENTION HEATMAP MATRIX */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'retention' && data && (
        <div className="space-y-4">
          {/* Ko'rsatkich turi (Metric Selector) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium">Ko&apos;rsatkich turi:</span>
              <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                <button
                  onClick={() => setMetric('activity')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    metric === 'activity'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  ⚡ Umumiy Faollik (Kirish/Video)
                </button>
                <button
                  onClick={() => setMetric('jobs')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    metric === 'jobs'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🎬 Video/Tahlil Yaratish
                </button>
                <button
                  onClick={() => setMetric('paying')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    metric === 'paying'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  💳 To&apos;lov Qaytishi (Paying)
                </button>
              </div>
            </div>

            {/* Rang intensivligi afsonasi (Legend) */}
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span>0%</span>
              <div className="flex gap-0.5">
                <span className="w-3.5 h-3.5 rounded-sm bg-white/[0.03] border border-white/10" />
                <span className="w-3.5 h-3.5 rounded-sm bg-indigo-950/60 border border-indigo-900/40" />
                <span className="w-3.5 h-3.5 rounded-sm bg-purple-900/50 border border-purple-800/40" />
                <span className="w-3.5 h-3.5 rounded-sm bg-purple-600/70 border border-purple-500/70" />
                <span className="w-3.5 h-3.5 rounded-sm bg-emerald-500 border border-emerald-400" />
              </div>
              <span>50%+</span>
            </div>
          </div>

          {/* Interactive Heatmap Table */}
          <div className="border border-white/10 rounded-xl overflow-x-auto bg-black/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="py-3 px-4 font-bold text-gray-300 sticky left-0 bg-slate-900/95 z-10 whitespace-nowrap min-w-[140px]">
                    Kohorta ({granularity === 'weekly' ? 'Hafta' : 'Oy'})
                  </th>
                  <th className="py-3 px-3 text-center font-bold text-gray-300 whitespace-nowrap min-w-[70px]">
                    Hajmi (N)
                  </th>
                  {Array.from({ length: periodsCount }).map((_, idx) => (
                    <th
                      key={idx}
                      className="py-3 px-2 text-center font-bold text-gray-300 min-w-[58px]"
                    >
                      {granularity === 'weekly' ? `W${idx}` : `M${idx}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.cohorts.map((cohort: RetentionCohortRow, rowIdx: number) => (
                  <tr key={cohort.cohort_id} className="hover:bg-white/[0.02] transition">
                    {/* Kohorta sarlavhasi */}
                    <td className="py-2.5 px-4 font-mono font-medium text-white whitespace-nowrap sticky left-0 bg-slate-900/95 z-10 border-r border-white/5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-200">{cohort.cohort_label}</span>
                        {rowIdx === 0 && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Joriy
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Kohorta hajmi */}
                    <td className="py-2.5 px-3 text-center font-bold text-gray-300 bg-white/[0.01] border-r border-white/5">
                      {cohort.cohort_size}
                    </td>

                    {/* Period katakchalari (Heatmap cells) */}
                    {cohort.periods.map((p: CohortPeriodItem) => {
                      const colorClass = getHeatmapColor(p.retention_pct, p.is_future)
                      const isHovered =
                        selectedCell?.cohortLabel === cohort.cohort_label &&
                        selectedCell?.periodLabel === p.label

                      return (
                        <td
                          key={p.period_index}
                          className="p-1 text-center"
                          onClick={() => {
                            if (!p.is_future) {
                              setSelectedCell({
                                cohortLabel: cohort.cohort_label,
                                cohortSize: cohort.cohort_size,
                                periodLabel: p.label,
                                activeCount: p.active_count,
                                retentionPct: p.retention_pct,
                              })
                            }
                          }}
                        >
                          <div
                            className={`py-2 px-1 rounded-lg border text-[11px] transition duration-150 cursor-pointer ${colorClass} ${
                              isHovered ? 'ring-2 ring-white scale-105 z-20' : ''
                            }`}
                            title={
                              p.is_future
                                ? 'Hali yetib kelmadi'
                                : `${p.active_count} / ${cohort.cohort_size} ta (${p.retention_pct}%)`
                            }
                          >
                            {p.is_future ? (
                              <span className="opacity-30">-</span>
                            ) : (
                              <span>{p.retention_pct}%</span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>

              {/* O'rtacha (Benchmark) Satri */}
              <tfoot>
                <tr className="bg-indigo-950/40 border-t-2 border-indigo-500/30 text-[11px] font-bold">
                  <td className="py-3 px-4 text-indigo-300 sticky left-0 bg-slate-900/95 z-10 border-r border-white/10 uppercase tracking-wider">
                    O&apos;rtacha (Benchmark)
                  </td>
                  <td className="py-3 px-3 text-center text-indigo-200 border-r border-white/10">
                    {Math.round(
                      data.cohorts.reduce((acc, c) => acc + c.cohort_size, 0) /
                        Math.max(1, data.cohorts.length)
                    )}
                  </td>
                  {data.benchmarks.map((b) => (
                    <td key={b.period_index} className="p-1 text-center">
                      <div className="py-2 px-1 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-bold">
                        {b.avg_retention_pct !== null ? `${b.avg_retention_pct}%` : '-'}
                      </div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tanlangan katakcha haqida batafsil ma'lumot */}
          {selectedCell && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">Kohorta:</span>
                <span className="font-bold text-white">{selectedCell.cohortLabel}</span>
                <span className="text-gray-500">•</span>
                <span className="text-gray-400">Davr:</span>
                <span className="font-bold text-indigo-300">{selectedCell.periodLabel}</span>
                <span className="text-gray-500">•</span>
                <span className="text-gray-400">Faollar:</span>
                <span className="font-bold text-emerald-400">
                  {selectedCell.activeCount} ta
                </span>
                <span className="text-gray-400">
                  ({selectedCell.cohortSize} ta umumiy foydalanuvchidan)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white px-2.5 py-1 rounded-lg bg-indigo-600">
                  {selectedCell.retentionPct}% Retention
                </span>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="text-gray-400 hover:text-white text-xs px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: ACTIVATION FUNNEL & MILESTONES */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'activation' && data && (
        <div className="space-y-4">
          <div className="border border-white/10 rounded-xl overflow-x-auto bg-black/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="py-3 px-4 font-bold text-gray-300 sticky left-0 bg-slate-900/95 z-10 whitespace-nowrap min-w-[140px]">
                    Kohorta
                  </th>
                  <th className="py-3 px-3 text-center font-bold text-gray-300 whitespace-nowrap">
                    Ro&apos;yxatdan o&apos;tgan
                  </th>
                  <th className="py-3 px-3 text-center font-bold text-gray-300 whitespace-nowrap">
                    Tasdiqlangan
                  </th>
                  <th className="py-3 px-3 text-center font-bold text-indigo-300 whitespace-nowrap">
                    D0 (24h) Faol
                  </th>
                  <th className="py-3 px-3 text-center font-bold text-indigo-300 whitespace-nowrap">
                    D3 Faol
                  </th>
                  <th className="py-3 px-3 text-center font-bold text-emerald-300 whitespace-nowrap">
                    &ldquo;Aha!&rdquo; (1-tayyor)
                  </th>
                  <th className="py-3 px-3 text-center font-bold text-purple-300 whitespace-nowrap">
                    Odat (2+ video)
                  </th>
                  <th className="py-3 px-3 text-center font-bold text-amber-300 whitespace-nowrap">
                    To&apos;lov (Paid)
                  </th>
                  <th className="py-3 px-4 text-right font-bold text-gray-300 whitespace-nowrap">
                    Median Vaqt (TTFA)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.activation.map((row: ActivationCohortRow, idx: number) => (
                  <tr key={row.cohort_id} className="hover:bg-white/[0.02] transition">
                    {/* Kohorta sarlavhasi */}
                    <td className="py-3 px-4 font-mono font-medium text-white whitespace-nowrap sticky left-0 bg-slate-900/95 z-10 border-r border-white/5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-200">{row.cohort_label}</span>
                        {idx === 0 && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Joriy
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Hajmi */}
                    <td className="py-3 px-3 text-center font-bold text-gray-200">
                      {row.cohort_size} ta
                    </td>

                    {/* Tasdiqlangan */}
                    <td className="py-3 px-3 text-center">
                      <span className="font-semibold text-gray-300">{row.verified_count}</span>
                      <span className="text-[10px] text-gray-500 block">({row.verified_pct}%)</span>
                    </td>

                    {/* D0 Fast Activation */}
                    <td className="py-3 px-3 text-center bg-indigo-950/20">
                      <span className="font-bold text-indigo-300">{row.d0_activated_count}</span>
                      <span className="text-[10px] text-indigo-400 font-semibold block">
                        ({row.d0_activated_pct}%)
                      </span>
                    </td>

                    {/* D3 */}
                    <td className="py-3 px-3 text-center">
                      <span className="font-semibold text-gray-300">{row.d3_activated_count}</span>
                      <span className="text-[10px] text-gray-500 block">({row.d3_activated_pct}%)</span>
                    </td>

                    {/* Aha! Moment */}
                    <td className="py-3 px-3 text-center bg-emerald-950/20">
                      <span className="font-bold text-emerald-300">{row.completed_job_count}</span>
                      <span className="text-[10px] text-emerald-400 font-semibold block">
                        ({row.completed_job_pct}%)
                      </span>
                    </td>

                    {/* Habit (2+ video) */}
                    <td className="py-3 px-3 text-center bg-purple-950/20">
                      <span className="font-bold text-purple-300">{row.habit_2plus_count}</span>
                      <span className="text-[10px] text-purple-400 font-semibold block">
                        ({row.habit_2plus_pct}%)
                      </span>
                    </td>

                    {/* Paid */}
                    <td className="py-3 px-3 text-center bg-amber-950/20">
                      <span className={`font-bold ${row.paid_count > 0 ? 'text-amber-300' : 'text-gray-500'}`}>
                        {row.paid_count}
                      </span>
                      <span className="text-[10px] text-amber-400/80 font-medium block">
                        ({row.paid_pct}%)
                      </span>
                    </td>

                    {/* Median Time to Action */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {row.median_min_to_action > 0 ? (
                        <div className="flex items-center justify-end gap-1.5 font-mono text-xs">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-bold text-white">{row.median_min_to_action}</span>
                          <span className="text-[10px] text-gray-400">daq</span>
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: INSIGHTS & ACTIONABLE RECOMMENDATIONS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'insights' && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.insights.map((insight, idx) => {
              let borderClass = 'border-blue-500/30 bg-blue-500/5'
              let badgeClass = 'text-blue-400 bg-blue-500/10'
              if (insight.type === 'success') {
                borderClass = 'border-emerald-500/30 bg-emerald-500/5'
                badgeClass = 'text-emerald-400 bg-emerald-500/10'
              } else if (insight.type === 'warning') {
                borderClass = 'border-amber-500/30 bg-amber-500/5'
                badgeClass = 'text-amber-400 bg-amber-500/10'
              } else if (insight.type === 'caution') {
                borderClass = 'border-red-500/30 bg-red-500/5'
                badgeClass = 'text-red-400 bg-red-500/10'
              }

              return (
                <div
                  key={idx}
                  className={`border rounded-xl p-4 space-y-2 transition ${borderClass}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      {insight.title}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeClass}`}>
                      {insight.type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {insight.description}
                  </p>
                </div>
              )
            })}
          </div>

          {/* O'sish strategiyasi tavsiyalari (Product Growth Playbook) */}
          <div className="bg-gradient-to-r from-indigo-900/20 via-purple-900/20 to-slate-900/40 border border-white/10 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              SaaS Aktivatsiya va Retention Qoidasi (Playbook)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-300">
              <div className="bg-white/5 rounded-lg p-3 border border-white/5 space-y-1">
                <span className="font-bold text-indigo-300 block">1. 15 daqiqalik qoida</span>
                <p className="text-[11px] text-gray-400">
                  Ro&apos;yxatdan o&apos;tgandan so&apos;ng birinchi 15 daqiqa ichida video yuborgan mijozning keyingi haftada qaytish ehtimoli 4 barobar yuqori bo&apos;ladi.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5 space-y-1">
                <span className="font-bold text-emerald-300 block">2. &ldquo;Aha! moment&rdquo;ni tezlashtirish</span>
                <p className="text-[11px] text-gray-400">
                  Mijoz birinchi videoni yuklaganda unga kuttirmasdan, qisqa (1-3 daqiqali) namunalarni sinab ko&apos;rishni tavsiya qilish tezkor natija beradi.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5 space-y-1">
                <span className="font-bold text-purple-300 block">3. W1 Triggerni yoqish</span>
                <p className="text-[11px] text-gray-400">
                  Foydalanuvchi oxirgi marta kirganidan 3 kun o&apos;tgach Telegram-bot orqali &ldquo;Siz qiziqqan yangi AI videolar tayyor&rdquo; xabarini yuborish retentionni 20%+ ga oshiradi.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
