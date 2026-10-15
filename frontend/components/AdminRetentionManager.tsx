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
  Award,
  ChevronDown,
  ChevronUp,
  Flame,
  Shield,
  CreditCard,
  UserCheck,
} from 'lucide-react'
import { RetentionStatsResponse, apiAdminRetentionStats, RetentionUserItem } from '@/lib/admin'

export default function AdminRetentionManager({ token }: { token: string }) {
  const [data, setData] = useState<RetentionStatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<number>(7)
  const [userLimit, setUserLimit] = useState<number>(20)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | '1_day' | '2_3_days' | '4_6_days' | '7_plus'>('all')
  const [planFilter, setPlanFilter] = useState<'all' | 'paid' | 'free'>('all')
  
  // Katta bloklar default yopiq (accordion)
  const [isDailyTableOpen, setIsDailyTableOpen] = useState(false)
  const [isUsersTableOpen, setIsUsersTableOpen] = useState(false)

  const loadRetention = async (days: number = selectedDays, limit: number = userLimit) => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiAdminRetentionStats(token, days, limit, 0)
      setData(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Retention ma\'lumotlarini yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadRetention(selectedDays, userLimit)
  }, [token, selectedDays, userLimit])

  const filteredUsers = (data?.recent_users || []).filter((u: RetentionUserItem) => {
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone.toLowerCase().includes(q) ||
      (u.plan && u.plan.toLowerCase().includes(q)) ||
      (u.streak && `${u.streak}`.includes(q))

    if (!matchesSearch) return false

    // Plan filtri
    if (planFilter === 'paid') {
      if (!u.plan || u.plan.toLowerCase() === 'free') return false
    } else if (planFilter === 'free') {
      if (u.plan && u.plan.toLowerCase() !== 'free') return false
    }

    // Faol kunlar / sodiqlik filtri (+ siz, 1, 3, 6, 7+ kun)
    if (statusFilter === '1_day') return u.active_days === 1
    if (statusFilter === '2_3_days') return u.active_days >= 2 && u.active_days <= 3
    if (statusFilter === '4_6_days') return u.active_days >= 4 && u.active_days <= 6
    if (statusFilter === '7_plus') return u.active_days >= 7

    return true
  })

  const getDaysLabel = (days: number) => {
    if (days === 1) return 'Bugun'
    if (days === 3) return "So'nggi 3 kun"
    if (days === 7) return "So'nggi 7 kun"
    if (days === 14) return "So'nggi 14 kun"
    if (days === 30) return "So'nggi 30 kun"
    if (days === 0) return 'Barchasi (Loyiha boshidan)'
    return `${days} kun`
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              Foydalanuvchilar Qaytishi va Faolligi (Retention)
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Toshkent vaqti
              </span>
            </h2>
            <p className="text-xs text-gray-400">
              Haqiqiy mijozlar qayta kiryaptimi, streak qanday va necha kundan keyin qaytmoqda?
            </p>
          </div>
        </div>

        {/* Davr filtri va yangilash tugmasi */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap bg-white/5 rounded-xl p-0.5 border border-white/10">
            {[
              { days: 1, label: 'Bugun' },
              { days: 3, label: '3 kun' },
              { days: 7, label: '7 kun' },
              { days: 14, label: '14 kun' },
              { days: 30, label: '30 kun' },
              { days: 0, label: 'Barchasi' },
            ].map((item) => (
              <button
                key={item.days}
                onClick={() => setSelectedDays(item.days)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedDays === item.days
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadRetention(selectedDays, userLimit)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-xs font-medium text-purple-300 transition"
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
              <span className="text-xs text-gray-400 font-medium">
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
                {(data.frequency.find((f) => f.label.includes('14'))?.count || 0) +
                  (data.frequency.find((f) => f.label.includes('30'))?.count || 0)} ta
              </span>
              <span className="text-xs text-amber-300/80 font-semibold">
                6+ kun kirgan
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Doimiy va qayta-qayta foydalanuvchilar
            </p>
          </div>
        </div>
      )}

      {/* Sodiqlik Taqsimoti (Frequency Buckets: 1, 3, 6, 14, 30, Barchasi) */}
      {data && (
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            Foydalanuvchilarning Kirish Chastotasi (Sodiqlik taqsimoti)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {data.frequency.map((item, idx) => (
              <div key={idx} className="bg-white/5 rounded-lg p-3 border border-white/5">
                <span className="text-[11px] text-gray-400 block">{item.label}</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-base sm:text-lg font-bold text-white">{item.count} ta</span>
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

      {/* 1. KUNMA-KUN FAOLIK VA QAYTISH JADVALI (DEFAULT YOPIQ / COLLAPSIBLE) */}
      {data && (
        <div className="border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden">
          <button
            onClick={() => setIsDailyTableOpen(!isDailyTableOpen)}
            className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition text-left"
          >
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-gray-200 uppercase tracking-wider block">
                  Kunlik Faollik va Qaytish Ko&apos;rsatkichlari ({getDaysLabel(selectedDays)})
                </span>
                <span className="text-[11px] text-gray-400">
                  {data.daily_stats.length} kunlik tahlil • Qaytganlar: oldingi kunlarda ro&apos;yxatdan o&apos;tib yana kirganlar
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
              <span>{isDailyTableOpen ? "Jadvalni yashirish" : "Jadvalni ko'rish"}</span>
              {isDailyTableOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {isDailyTableOpen && (
            <div className="border-t border-white/10 overflow-x-auto">
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
                        <td className="py-3 px-4 font-mono font-medium text-white whitespace-nowrap">
                          {row.date}
                          {idx === 0 && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-sans font-bold">
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
                            <div className="w-20 sm:w-24 bg-white/10 h-1.5 rounded-full overflow-hidden hidden sm:block">
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
          )}
        </div>
      )}

      {/* 2. OXIRGI FAOL FOYDALANUVCHILAR VA SODIQLIGI (DEFAULT YOPIQ / COLLAPSIBLE) */}
      {data && (
        <div className="border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden">
          <button
            onClick={() => setIsUsersTableOpen(!isUsersTableOpen)}
            className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition text-left"
          >
            <div className="flex items-center gap-2.5">
              <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-gray-200 uppercase tracking-wider block">
                  Oxirgi Faol Foydalanuvchilar, Streak va Tariflar (Barchasi {userLimit})
                </span>
                <span className="text-[11px] text-gray-400">
                  Har bir mijozning uzluksiz streak kunlari, faol kunlari, tarifi va buyurtmalari
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span>{isUsersTableOpen ? "Jadvalni yashirish" : "Foydalanuvchilarni ko'rish"}</span>
              {isUsersTableOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {isUsersTableOpen && (
            <div className="p-4 border-t border-white/10 space-y-4">
              {/* Filtrlash va qidiruv boshqaruvi */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Faol kunlar bo'yicha filter */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-gray-400 font-medium mr-1">Faol kun:</span>
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      statusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    Barchasi ({data.recent_users.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('1_day')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      statusFilter === '1_day' ? 'bg-gray-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    1 kun
                  </button>
                  <button
                    onClick={() => setStatusFilter('2_3_days')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      statusFilter === '2_3_days'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white/5 text-purple-300/80 hover:text-white'
                    }`}
                  >
                    2-3 kun
                  </button>
                  <button
                    onClick={() => setStatusFilter('4_6_days')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      statusFilter === '4_6_days'
                        ? 'bg-amber-600 text-white'
                        : 'bg-white/5 text-amber-300/80 hover:text-white'
                    }`}
                  >
                    4-6 kun
                  </button>
                  <button
                    onClick={() => setStatusFilter('7_plus')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      statusFilter === '7_plus'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white/5 text-emerald-300/80 hover:text-white'
                    }`}
                  >
                    7+ kun
                  </button>
                </div>

                {/* Tarif bo'yicha filter va qidiruv */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10 text-xs">
                    <button
                      onClick={() => setPlanFilter('all')}
                      className={`px-2 py-1 rounded-md transition ${
                        planFilter === 'all' ? 'bg-white/20 text-white font-bold' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Barcha tarif
                    </button>
                    <button
                      onClick={() => setPlanFilter('paid')}
                      className={`px-2 py-1 rounded-md transition ${
                        planFilter === 'paid' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Pullik (Obuna)
                    </button>
                    <button
                      onClick={() => setPlanFilter('free')}
                      className={`px-2 py-1 rounded-md transition ${
                        planFilter === 'free' ? 'bg-white/20 text-white font-bold' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Free
                    </button>
                  </div>

                  <div className="relative min-w-[200px]">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Ism, email, tarif, streak..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Users Table */}
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-gray-400 border-b border-white/10">
                    <tr>
                      <th className="py-2.5 px-4">Foydalanuvchi</th>
                      <th className="py-2.5 px-4 text-center">Tarif</th>
                      <th className="py-2.5 px-4 text-center">Faollik Streak</th>
                      <th className="py-2.5 px-4 text-center">Jami Faol Kun</th>
                      <th className="py-2.5 px-4">Ro&apos;yxatdan O&apos;tgan</th>
                      <th className="py-2.5 px-4">So&apos;nggi Faollik</th>
                      <th className="py-2.5 px-4 text-center">Videolari</th>
                      <th className="py-2.5 px-4 text-right">Holati</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-gray-500">
                          Foydalanuvchi topilmadi
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => {
                        let badgeClass = 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                        if (user.loyalty_status === 'loyal') {
                          badgeClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        } else if (user.loyalty_status === 'returning') {
                          badgeClass = 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        }

                        const isPaidPlan = user.plan && user.plan.toLowerCase() !== 'free'

                        return (
                          <tr key={user.id} className="hover:bg-white/[0.02] transition">
                            <td className="py-3 px-4">
                              <p className="font-semibold text-white">{user.name}</p>
                              <p className="text-[11px] text-gray-400 font-mono">
                                {user.email || user.phone || '—'}
                              </p>
                            </td>

                            {/* Tarif (Plan) */}
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                  isPaidPlan
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-white/10 text-gray-300'
                                }`}
                              >
                                {user.plan || 'Free'}
                              </span>
                            </td>

                            {/* Streak */}
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[11px] ${
                                  user.streak >= 2
                                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                    : 'text-gray-400'
                                }`}
                              >
                                {user.streak >= 2 && <Flame className="w-3 h-3 text-orange-400 fill-orange-400" />}
                                {user.streak} kun
                              </span>
                            </td>

                            {/* Total Active Days */}
                            <td className="py-3 px-4 text-center">
                              <span className="font-bold text-white px-2 py-0.5 rounded bg-white/10">
                                {user.active_days} kun
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono text-gray-400 text-[11px] whitespace-nowrap">
                              {user.created_at || '—'}
                            </td>

                            <td className="py-3 px-4 font-mono text-gray-300 text-[11px] whitespace-nowrap">
                              {user.last_active_at || '—'}
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
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeClass}`}
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

              {/* Ko'proq yuklash (+20) tugmasi */}
              <div className="flex items-center justify-between pt-2 text-xs text-gray-400">
                <span>Ko&apos;rsatilmoqda: {filteredUsers.length} ta foydalanuvchi</span>
                <button
                  onClick={() => setUserLimit((prev) => prev + 20)}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition"
                >
                  Ko&apos;proq ko&apos;rsatish (+20 ta)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
