'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Users,
  AlertTriangle,
  AlertCircle,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Send,
  Plus,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  Mail,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Filter,
  DollarSign,
  X,
  Check,
  TrendingDown,
  Info,
  Gift,
  Coins,
} from 'lucide-react'
import {
  UnactivatedUserItem,
  UnactivatedUsersResponse,
  apiGetUnactivatedUsers,
  apiAdminAddMinutes,
} from '@/lib/admin'
import { formatTashkentDateTimeObj } from '@/lib/timestamp'
import DateRangePills, { DateRangeValue } from '@/components/DateRangePills'

interface Props {
  token: string
}

export default function AdminUnactivatedUsersManager({ token }: Props) {
  const [data, setData] = useState<UnactivatedUsersResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Date range state (Default: 'today')
  const [dateRange, setDateRange] = useState<DateRangeValue>('today')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Filters state
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('newest')

  // Modals
  const [selectedUser, setSelectedUser] = useState<UnactivatedUserItem | null>(null)
  const [minuteModalUser, setMinuteModalUser] = useState<UnactivatedUserItem | null>(null)
  const [bonusMinutes, setBonusMinutes] = useState('10')
  const [bonusLoading, setBonusLoading] = useState(false)
  const [bonusSuccess, setBonusSuccess] = useState<string | null>(null)

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
      const res = await apiGetUnactivatedUsers(
        token,
        page,
        pageSize,
        filterType,
        debouncedSearch || undefined,
        sortBy,
        dateRange,
        startDate,
        endDate
      )
      setData(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Maʼlumotlarni yuklab bo‘lmadi')
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, filterType, debouncedSearch, sortBy, dateRange, startDate, endDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  const formatDateTime = (dateStr: string | null | undefined) => formatTashkentDateTimeObj(dateStr)

  const formatDuration = (sec: number | null | undefined): string => {
    if (!sec || sec <= 0) return '00:00'
    const totalSec = Math.floor(sec)
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleGiveMinutes = async () => {
    if (!minuteModalUser || !token) return
    const mins = parseFloat(bonusMinutes)
    if (isNaN(mins) || mins <= 0) {
      alert('Iltimos, to‘g‘ri daqiqa kiriting')
      return
    }

    try {
      setBonusLoading(true)
      setBonusSuccess(null)
      // 500 UZS per minute standard
      const amountUzs = Math.round(mins * 500)
      await apiAdminAddMinutes(token, minuteModalUser.id, {
        minutes: mins,
        amount_uzs: amountUzs,
        action: 'add',
        reason: 'Aktivlashmagan foydalanuvchiga bonus daqiqa',
      })
      setBonusSuccess(`${minuteModalUser.name || 'Foydalanuvchi'}ga +${mins} bepul daqiqa berildi!`)
      setTimeout(() => {
        setMinuteModalUser(null)
        setBonusSuccess(null)
      }, 1500)
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Daqiqa berishda xatolik yuz berdi')
    } finally {
      setBonusLoading(false)
    }
  }

  const summary = data?.summary
  const topReasons = data?.top_reasons || []
  const users = data?.users || []
  const pagination = data?.pagination

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-900/30 via-slate-900/40 to-amber-900/20 border border-rose-500/20 rounded-2xl p-5 sm:p-6 backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <TrendingDown className="w-5 h-5" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Foydalanuvchi Tadqiqoti: Birinchi Dublyajni Tugatmaganlar
              </h2>
            </div>
            <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
              Ro‘yxatdan o‘tib, hali birorta ham muvaffaqiyatli dublyaj natijasini ko‘rmagan foydalanuvchilar (Drop-off).
              Qayerda to‘xtab qolganlik sabablarini tahlil qiling va ularga bonus yoki xabar bilan qayta faollashtiring.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            <a
              href="#sec-broadcast"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-lg shadow-violet-500/20 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Broadcast Xabar Yuborish</span>
            </a>
            <DateRangePills
              value={dateRange}
              onChange={(newRange, start, end) => {
                setDateRange(newRange)
                if (start !== undefined) setStartDate(start)
                if (end !== undefined) setEndDate(end)
                setPage(1)
              }}
              onRefresh={loadData}
              loading={loading}
              startDate={startDate}
              endDate={endDate}
            />
          </div>
        </div>
      </div>

      {/* KPI Funnel Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Jami tugatmaganlar */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Jami Tugatmaganlar</span>
              <Users className="w-4 h-4 text-rose-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white font-mono">
                {summary.unactivated_users.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                {summary.unactivated_pct}%
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              {summary.total_users} ta foydalanuvchidan {summary.completed_users} tasi ({summary.completed_pct}%) aktivlashgan
            </p>
          </div>

          {/* Card 2: 0 ta urinish */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Video Kiritmaganlar</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-300 font-mono">
                {summary.never_attempted_users.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                {summary.never_attempted_pct}%
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Akkaunt ochgan, lekin birorta ham havola kiritmagan
            </p>
          </div>

          {/* Card 3: Xatolikka uchraganlar */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Xatolik Olganlar</span>
              <XCircle className="w-4 h-4 text-red-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-red-400 font-mono">
                {summary.failed_attempt_users.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                {summary.failed_attempt_pct}%
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              YT-dlp, cookies yoki tashqi API kvotasi sababli qulagan
            </p>
          </div>

          {/* Card 4: To'lovda to'xtaganlar */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Paywall / To‘lov</span>
              <DollarSign className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-cyan-300 font-mono">
                {summary.awaiting_payment_users.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                {summary.awaiting_payment_pct}%
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              10+ daqiqalik video tashlab, to‘lov devoriga duch kelgan
            </p>
          </div>
        </div>
      )}

      {/* Top Reasons Breakdown */}
      {topReasons.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Eng ko‘p uchragan to‘siqlar va xatoliklar (Nega to‘xtashgan?)</span>
            </span>
            <span className="text-[11px] text-gray-400 font-mono">Urinishlar soni bo‘yicha</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {topReasons.map((r) => (
              <div
                key={r.code}
                className="p-3 bg-black/30 border border-white/5 rounded-xl flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-white truncate">{r.label}</p>
                    <span className="text-[10px] font-mono text-gray-400 bg-white/5 px-1 rounded">
                      {r.code}
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, r.pct * 1.5)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono">
                  <p className="text-sm font-bold text-rose-400">{r.count} ta</p>
                  <p className="text-[10px] text-gray-400">{r.pct}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'Barchasi', count: summary?.unactivated_users },
              { id: 'never_attempted', label: 'Video kiritmaganlar', count: summary?.never_attempted_users },
              { id: 'failed_attempt', label: 'Xatolik olganlar', count: summary?.failed_attempt_users },
              { id: 'awaiting_payment', label: 'To‘lov kutayotganlar', count: summary?.awaiting_payment_users },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilterType(tab.id)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                  filterType === tab.id
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20'
                    : 'bg-black/20 text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/30 text-white/80">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search & Sort */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[200px] sm:min-w-[260px] flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Foydalanuvchini qidirish (Email, Ism, Tel...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 transition"
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

            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="bg-black/30 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-rose-500"
            >
              <option value="newest">Eng yangi ro‘yxatdan o‘tgan</option>
              <option value="oldest">Eng eski</option>
              <option value="most_attempts">Eng ko‘p uringanlar</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-gray-400 text-[11px] font-semibold tracking-wider uppercase">
                <th className="py-3 px-4">Foydalanuvchi & Aloqa</th>
                <th className="py-3 px-4 whitespace-nowrap">Ro‘yxatdan o‘tgan</th>
                <th className="py-3 px-4">Holati & Urinish</th>
                <th className="py-3 px-4">Oxirgi uringan video</th>
                <th className="py-3 px-4">To‘xtagan sababi / Xatolik</th>
                <th className="py-3 px-4 text-center">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-rose-400" />
                    <span>Yuklanmoqda...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Foydalanuvchilar topilmadi.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const regDate = formatDateTime(u.registered_at)
                  return (
                    <tr key={u.id} className="hover:bg-white/[0.03] transition group">
                      {/* User Info */}
                      <td className="py-3.5 px-4 min-w-[190px]">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white text-xs truncate">
                              {u.name || 'Nomsiz foydalanuvchi'}
                            </span>
                            {u.is_verified && (
                              <span title="Tasdiqlangan">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5 font-mono">
                            {u.email || u.phone || '—'}
                          </p>
                          {u.telegram_chat_id && (
                            <span className="inline-flex items-center gap-1 text-[9px] text-sky-400 bg-sky-500/10 px-1 rounded mt-0.5 font-mono">
                              <MessageSquare className="w-2.5 h-2.5" />
                              <span>TG Ulangan</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Registered At */}
                      <td className="py-3.5 px-4 min-w-[130px] whitespace-nowrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-gray-200">
                            <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                            <span>{regDate.date}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-400 font-mono">
                            <Clock className="w-2.5 h-2.5 text-gray-500 shrink-0" />
                            <span>{regDate.time}</span>
                          </div>
                        </div>
                      </td>

                      {/* Category & Attempts */}
                      <td className="py-3.5 px-4 min-w-[150px]">
                        <div className="space-y-1">
                          {u.category === 'never_attempted' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
                              <Clock className="w-2.5 h-2.5" />
                              <span>0 ta urinish</span>
                            </span>
                          ) : u.category === 'awaiting_payment' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                              <DollarSign className="w-2.5 h-2.5" />
                              <span>To‘lov kutilmoqda ({u.attempt_count} ta)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/30">
                              <XCircle className="w-2.5 h-2.5" />
                              <span>Xatolik ({u.attempt_count} ta urinish)</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Last Attempted Video */}
                      <td className="py-3.5 px-4 min-w-[200px] max-w-[280px]">
                        {u.last_job ? (
                          <div className="space-y-1">
                            <p className="font-medium text-white text-xs truncate" title={u.last_job.video_title}>
                              {u.last_job.video_title}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                              {u.last_job.video_duration && (
                                <span className="font-mono bg-white/5 px-1 rounded">
                                  {formatDuration(u.last_job.video_duration)}
                                </span>
                              )}
                              {u.last_job.youtube_url && (
                                <a
                                  href={u.last_job.youtube_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-400 hover:text-red-400 flex items-center gap-0.5 transition"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  <span>YouTube</span>
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs italic">— Hech qanday video yo‘q —</span>
                        )}
                      </td>

                      {/* Reason / Error code */}
                      <td className="py-3.5 px-4 min-w-[170px] max-w-[240px]">
                        {u.last_job ? (
                          <div className="space-y-0.5">
                            <span className="inline-block text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/20">
                              {u.last_job.error_code || u.last_job.status}
                            </span>
                            {u.last_job.error_message && (
                              <p className="text-[11px] text-gray-400 truncate mt-0.5" title={u.last_job.error_message}>
                                {u.last_job.error_message}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[11px]">
                            Platformaga kirgan, sinab ko‘rmagan
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Bonus daqiqa berish */}
                          <button
                            onClick={() => {
                              setMinuteModalUser(u)
                              setBonusMinutes('10')
                              setBonusSuccess(null)
                            }}
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition"
                            title="Bepul daqiqa (bonus) berish"
                          >
                            <Gift className="w-3.5 h-3.5" />
                          </button>

                          {/* Email yozish */}
                          {u.email && (
                            <a
                              href={`mailto:${u.email}?subject=GapirAI - Bepul dublyaj sinovi`}
                              className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition"
                              title="Email yozish"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {/* Batafsil ko'rish */}
                          <button
                            onClick={() => setSelectedUser(u)}
                            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-medium border border-white/10 transition"
                          >
                            Tafsilot
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

        {/* Pagination Footer */}
        {pagination && pagination.total_pages > 1 && (
          <div className="p-4 border-t border-white/10 bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
            <div>
              Jami <span className="font-semibold text-white">{pagination.total_items}</span> ta foydalanuvchi,{' '}
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

      {/* Bonus Minutes Modal */}
      {minuteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12141a] border border-emerald-500/30 rounded-2xl w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Gift className="w-5 h-5" />
                <h3 className="font-bold text-sm text-white">Qayta faollashtirish uchun bonus daqiqa</h3>
              </div>
              <button
                onClick={() => setMinuteModalUser(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-gray-300">
                Foydalanuvchi: <strong className="text-white">{minuteModalUser.name || 'Nomsiz'}</strong> ({minuteModalUser.email || minuteModalUser.phone})
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Qo‘shiladigan bepul daqiqa:
                </label>
                <div className="flex items-center gap-2">
                  {['5', '10', '20', '30'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBonusMinutes(val)}
                      className={`px-3 py-1.5 rounded-xl font-mono text-xs font-semibold border transition ${
                        bonusMinutes === val
                          ? 'bg-emerald-500 text-black border-emerald-400'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      +{val} daq
                    </button>
                  ))}
                  <input
                    type="number"
                    value={bonusMinutes}
                    onChange={(e) => setBonusMinutes(e.target.value)}
                    className="w-20 bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-center text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    placeholder="Boshqa"
                  />
                </div>
              </div>

              {bonusSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-center font-semibold">
                  {bonusSuccess}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setMinuteModalUser(null)}
                disabled={bonusLoading}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleGiveMinutes}
                disabled={bonusLoading}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5"
              >
                {bonusLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
                <span>Daqiqa berish</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12141a] border border-white/20 rounded-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                  <TrendingDown className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-white">Foydalanuvchi Drop-off Tafsiloti</h3>
                  <p className="text-[11px] font-mono text-gray-400">{selectedUser.id}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-3 bg-white/5 rounded-xl space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-400">Ism:</span>
                  <span className="text-white font-semibold">{selectedUser.name || 'Nomsiz'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Email:</span>
                  <span className="text-white font-mono">{selectedUser.email || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Telefon:</span>
                  <span className="text-white font-mono">{selectedUser.phone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ro‘yxatdan o‘tgan:</span>
                  <span className="text-white font-mono">{formatDateTime(selectedUser.registered_at).full}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Akkaunt holati:</span>
                  <span className={selectedUser.is_verified ? 'text-emerald-400 font-semibold' : 'text-gray-400'}>
                    {selectedUser.is_verified ? '✓ Tasdiqlangan' : 'Tasdiqlanmagan'}
                  </span>
                </div>
              </div>

              {selectedUser.last_job ? (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2">
                  <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                    Oxirgi urinish ma’lumoti
                  </p>
                  <p className="font-medium text-white">{selectedUser.last_job.video_title}</p>
                  <div className="flex items-center gap-3 text-gray-400 text-[11px]">
                    <span>Davomiyligi: <strong className="text-white">{formatDuration(selectedUser.last_job.video_duration)}</strong></span>
                    <span>Status: <strong className="text-rose-400 font-mono">{selectedUser.last_job.status}</strong></span>
                  </div>
                  {selectedUser.last_job.youtube_url && (
                    <a
                      href={selectedUser.last_job.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium"
                    >
                      <span>YouTube'da ko‘rish</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {selectedUser.last_job.error_message && (
                    <div className="mt-2 p-2.5 bg-black/40 rounded-lg border border-white/5">
                      <p className="text-[10px] text-gray-400 font-mono">Xatolik kodi: {selectedUser.last_job.error_code || 'Yo‘q'}</p>
                      <p className="text-[11px] text-rose-300 font-mono mt-1 whitespace-pre-wrap break-all">
                        {selectedUser.last_job.error_message}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-white/5 rounded-xl text-center text-gray-400">
                  Bu foydalanuvchi hali birorta ham video havolasi kiritmagan.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
