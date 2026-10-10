'use client'

import { useState, useEffect } from 'react'
import {
  Users,
  Repeat,
  Calendar,
  Sparkles,
  TrendingUp,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  Video,
  UserCheck,
  Award,
  ArrowUpRight,
  Filter,
} from 'lucide-react'
import { RetentionStatsResponse, apiAdminRetentionStats, RetentionUserItem } from '@/lib/admin'

export default function AdminRetentionManager({ token }: { token: string }) {
  const [data, setData] = useState<RetentionStatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<number>(14)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'returning' | 'loyal' | 'one_time'>('all')

  const loadRetention = async (days: number = selectedDays) => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiAdminRetentionStats(token, days)
      setData(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Retention ma\'lumotlarini yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadRetention(selectedDays)
  }, [token, selectedDays])

  const filteredUsers = (data?.recent_users || []).filter((u: RetentionUserItem) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    if (statusFilter === 'returning') return u.active_days >= 2
    if (statusFilter === 'loyal') return u.active_days >= 4
    if (statusFilter === 'one_time') return u.active_days === 1
    return true
  })

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Foydalanuvchilar Qaytishi va Faolligi (Retention)
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Kunlik tahlil
              </span>
            </h2>
            <p className="text-xs text-gray-400">
              Bir marta kirgan foydalanuvchilar qayta kiryaptimi va necha kundan keyin qaytmoqda?
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/10">
            <button
              onClick={() => setSelectedDays(14)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedDays === 14 ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              14 kun
            </button>
            <button
              onClick={() => setSelectedDays(30)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedDays === 30 ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              30 kun
            </button>
          </div>

          <button
            onClick={() => loadRetention(selectedDays)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Jami Qaytganlar */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-gray-400 text-xs">
              <span>Umumiy Qaytish (Retention)</span>
              <Repeat className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">
                {data.summary.overall_retention_pct}%
              </span>
              <span className="text-xs text-gray-400">
                ({data.summary.total_returning_all_time} ta qaytgan)
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Jami {data.summary.total_registered} ta ro&apos;yxatdan o&apos;tgandan
            </p>
          </div>

          {/* Card 2: Bugungi Kirishlar */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-gray-400 text-xs">
              <span>Bugungi Faollik</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400">
                {data.summary.today.total_active} ta
              </span>
              <span className="text-xs text-emerald-300/80 font-semibold">
                {data.summary.today.returning_pct}% qaytgan
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="text-gray-300">Yangi: {data.summary.today.new_users}</span>
              <span>•</span>
              <span className="text-purple-300 font-medium">Qaytgan: {data.summary.today.returning_users}</span>
            </div>
          </div>

          {/* Card 3: Kechagi Kirishlar */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-gray-400 text-xs">
              <span>Kechagi Faollik</span>
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-400">
                {data.summary.yesterday.total_active} ta
              </span>
              <span className="text-xs text-blue-300/80 font-semibold">
                {data.summary.yesterday.returning_pct}% qaytgan
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span>Yangi: {data.summary.yesterday.new_users}</span>
              <span>•</span>
              <span className="text-purple-300 font-medium">Qaytgan: {data.summary.yesterday.returning_users}</span>
            </div>
          </div>

          {/* Card 4: Sodiq Foydalanuvchilar */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-gray-400 text-xs">
              <span>Sodiq Foydalanuvchilar</span>
              <Award className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-400">
                {data.frequency.find((f) => f.label.includes('8+'))?.count || 0} ta
              </span>
              <span className="text-xs text-amber-300/80 font-semibold">
                8+ kun kirgan
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Doimiy va qayta-qayta foydalanuvchilar
            </p>
          </div>
        </div>
      )}

      {/* Sodiqlik Taqsimoti (Frequency Buckets) */}
      {data && (
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            Foydalanuvchilarning Kirish Chastotasi (Sodiqlik taqsimoti)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.frequency.map((item, idx) => (
              <div key={idx} className="bg-white/5 rounded-lg p-3 border border-white/5">
                <span className="text-[11px] text-gray-400 block">{item.label}</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-lg font-bold text-white">{item.count} ta</span>
                  <span className="text-xs font-semibold text-purple-400">{item.pct}%</span>
                </div>
                <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, item.pct * 1.5)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kunma-kun Qaytish Jadvali */}
      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              Kunlik Faollik va Qaytish Ko&apos;rsatkichlari (Oxirgi {selectedDays} kun)
            </h3>
            <span className="text-xs text-gray-500">
              Qaytganlar: ro&apos;yxatdan o&apos;tgan kundan keyin yana kirganlar
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-gray-400 border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-4">Sana</th>
                  <th className="py-2.5 px-4 text-center">Jami Faol</th>
                  <th className="py-2.5 px-4 text-center">Yangi Kirganlar</th>
                  <th className="py-2.5 px-4 text-center">Qaytib Kirganlar</th>
                  <th className="py-2.5 px-4">Qaytish Darajasi (Retention)</th>
                  <th className="py-2.5 px-4 text-right">Yaratilgan Videolar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.daily_stats.map((row, idx) => {
                  const pct = row.returning_pct
                  let badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  let barColor = 'bg-amber-500'
                  if (pct >= 30) {
                    badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    barColor = 'bg-emerald-500'
                  } else if (pct >= 15) {
                    badgeColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                    barColor = 'bg-blue-500'
                  }

                  return (
                    <tr key={idx} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-4 font-mono font-medium text-white">
                        {row.date}
                        {idx === 0 && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            Bugun
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-white">
                        {row.total_active}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-300">
                        {row.new_users}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-purple-300">
                        {row.returning_users}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${badgeColor}`}>
                            {pct}%
                          </span>
                          <div className="w-24 bg-white/10 h-1.5 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className={`h-full rounded-full ${barColor}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-gray-300">
                        {row.jobs_count > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-white/10 text-white font-semibold">
                            {row.jobs_count} ta
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Foydalanuvchilar Ro'yxati (Search va Filter bilan) */}
      {data && (
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Oxirgi Faol Foydalanuvchilar va Ularning Sodiqligi
              </h3>
              <p className="text-xs text-gray-400">
                Har bir foydalanuvchining necha kun qaytib kirgani va umumiy faolligi
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  statusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                Barchasi ({data.recent_users.length})
              </button>
              <button
                onClick={() => setStatusFilter('returning')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  statusFilter === 'returning'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-purple-300/80 hover:text-white'
                }`}
              >
                Qaytganlar (2+ kun)
              </button>
              <button
                onClick={() => setStatusFilter('loyal')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  statusFilter === 'loyal' ? 'bg-amber-600 text-white' : 'bg-white/5 text-amber-300/80 hover:text-white'
                }`}
              >
                Sodiqlar (4+ kun)
              </button>
              <button
                onClick={() => setStatusFilter('one_time')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  statusFilter === 'one_time' ? 'bg-gray-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                1 marta kirgan
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Ism, email yoki telefon bo'yicha qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-gray-400 border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-4">Foydalanuvchi</th>
                  <th className="py-2.5 px-4">Ro&apos;yxatdan O&apos;tgan</th>
                  <th className="py-2.5 px-4">So&apos;nggi Faollik</th>
                  <th className="py-2.5 px-4 text-center">Faol Kunlar</th>
                  <th className="py-2.5 px-4 text-center">Yaratgan Videolari</th>
                  <th className="py-2.5 px-4 text-right">Holati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-500">
                      Foydalanuvchi topilmadi
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    let badgeClass = 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                    if (user.loyalty_status === 'loyal') {
                      badgeClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    } else if (user.loyalty_status === 'returning') {
                      badgeClass = 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                    }

                    return (
                      <tr key={user.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-white">{user.name}</p>
                          <p className="text-[11px] text-gray-400 font-mono">
                            {user.email || user.phone || 'Ma\'lumot yo\'q'}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-400 text-[11px]">
                          {user.created_at || '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-300 text-[11px]">
                          {user.last_active_at || '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-bold text-white px-2 py-0.5 rounded bg-white/10">
                            {user.active_days} kun
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-medium text-gray-300">
                          {user.jobs_count > 0 ? (
                            <span className="text-blue-400 font-bold">{user.jobs_count} ta</span>
                          ) : (
                            <span className="text-gray-500">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badgeClass}`}
                          >
                            {user.loyalty_label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
