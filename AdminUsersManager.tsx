'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  Zap,
  Crown,
  Sparkles,
  RefreshCw,
  Clock,
  X,
  Check,
  Coins,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Calendar,
} from 'lucide-react'
import {
  AdminUserItem,
  apiAdminListUsers,
  apiAdminAddMinutes,
  apiAdminSetPlan,
} from '@/lib/admin'
import { getToken } from '@/lib/auth'

export default function AdminUsersManager() {
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Minute Top-up modal state
  const [minuteModalUser, setMinuteModalUser] = useState<AdminUserItem | null>(null)
  const [amountUzs, setAmountUzs] = useState<string>('')
  const [minutes, setMinutes] = useState<string>('')
  const [ratePerMinute, setRatePerMinute] = useState<number>(500)
  const [actionLoading, setActionLoading] = useState(false)

  // Plan Assignment modal state
  const [planModalUser, setPlanModalUser] = useState<AdminUserItem | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'standard' | 'pro'>('standard')
  const [planDays, setPlanDays] = useState<number>(30)
  const [resetMonthly, setResetMonthly] = useState<boolean>(true)

  const fetchUsers = useCallback(async (query: string = '', p: number = 1) => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiAdminListUsers(token, query, p, 20)
      setUsers(data.users)
      setTotal(data.total)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Foydalanuvchilarni yuklashda xatolik")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers(search, page)
  }, [fetchUsers, page])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchUsers(search, 1)
  }

  // Auto-conversion between Amount (UZS) and Minutes
  const handleAmountChange = (val: string) => {
    setAmountUzs(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0 && ratePerMinute > 0) {
      const calculatedMins = (num / ratePerMinute).toFixed(1)
      setMinutes(calculatedMins.endsWith('.0') ? parseInt(calculatedMins).toString() : calculatedMins)
    } else if (val === '') {
      setMinutes('')
    }
  }

  const handleMinutesChange = (val: string) => {
    setMinutes(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0 && ratePerMinute > 0) {
      setAmountUzs(Math.round(num * ratePerMinute).toString())
    } else if (val === '') {
      setAmountUzs('')
    }
  }

  const applyPreset = (presetAmount: number) => {
    setAmountUzs(presetAmount.toString())
    const calculatedMins = (presetAmount / ratePerMinute).toFixed(1)
    setMinutes(calculatedMins.endsWith('.0') ? parseInt(calculatedMins).toString() : calculatedMins)
  }

  const handleAddMinutes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!minuteModalUser) return
    const token = getToken()
    if (!token) return

    const numMins = parseFloat(minutes)
    const numAmount = parseFloat(amountUzs)

    if ((isNaN(numMins) || numMins <= 0) && (isNaN(numAmount) || numAmount <= 0)) {
      setError("Iltimos, summa yoki daqiqa miqdorini kiriting")
      return
    }

    setActionLoading(true)
    setError(null)
    try {
      const res = await apiAdminAddMinutes(token, minuteModalUser.id, {
        minutes: !isNaN(numMins) && numMins > 0 ? numMins : undefined,
        amount_uzs: !isNaN(numAmount) && numAmount > 0 ? numAmount : undefined,
        rate_per_minute: ratePerMinute,
      })
      setSuccessMsg(res.message || "Daqiqalar muvaffaqiyatli qo'shildi!")
      setMinuteModalUser(null)
      setAmountUzs('')
      setMinutes('')
      fetchUsers(search, page)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Daqiqa qo'shishda xatolik yuz berdi")
    } finally {
      setActionLoading(false)
    }
  }

  const handleSetPlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!planModalUser) return
    const token = getToken()
    if (!token) return

    setActionLoading(true)
    setError(null)
    try {
      const res = await apiAdminSetPlan(token, planModalUser.id, {
        plan: selectedPlan,
        days: planDays,
        reset_monthly: resetMonthly,
      })
      setSuccessMsg(res.message || "Tarif muvaffaqiyatli biriktirildi!")
      setPlanModalUser(null)
      fetchUsers(search, page)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Tarifni o'zgartirishda xatolik yuz berdi")
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400" />
            Foydalanuvchilar va Tariflarni boshqarish
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Foydalanuvchilarga tarif yoqish, daqiqa qo'shish yoki so'm summasi orqali hisoblash
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email, ism yoki telefon..."
              className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-52 sm:w-64 transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  fetchUsers('', 1)
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition"
          >
            Qidirish
          </button>
          <button
            type="button"
            onClick={() => fetchUsers(search, page)}
            disabled={loading}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition disabled:opacity-50"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </form>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2 text-emerald-300 text-xs">
          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Foydalanuvchi</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Tarif</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Daqiqa Balansi</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Amal qilish muddati</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Harakatlar</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400 mb-2" />
                  Yuklanmoqda...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  Foydalanuvchi topilmadi
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const planKey = (u.plan || 'free').toLowerCase()
                return (
                  <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                          {u.email[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white font-medium text-xs flex items-center gap-1.5">
                            {u.email}
                            {u.is_verified && (
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" title="Tasdiqlangan" />
                            )}
                          </div>
                          {(u.name || u.phone) && (
                            <div className="text-[11px] text-gray-400">
                              {[u.name, u.phone].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {planKey === 'pro' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                          PRO
                        </span>
                      ) : planKey === 'standard' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                          <Zap className="w-3.5 h-3.5 text-blue-400" />
                          STANDART
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 text-gray-400 border border-white/10">
                          <Sparkles className="w-3.5 h-3.5 text-gray-400" />
                          BEPUL
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-white">
                        <span className="font-extrabold text-blue-400">{u.balance.total_available}</span> daqiqa
                      </div>
                      <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
                        <span>Oylik: {u.balance.monthly_remaining}/{u.balance.monthly_cap} daq</span>
                        {u.balance.purchased > 0 && (
                          <span className="text-emerald-400 font-semibold">+{u.balance.purchased} kuymas</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">
                      {u.expires_at ? (
                        <span className="flex items-center gap-1 text-gray-300">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {new Date(u.expires_at).toLocaleDateString('uz-UZ')}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setMinuteModalUser(u)
                            setAmountUzs('')
                            setMinutes('')
                            setError(null)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold text-xs flex items-center gap-1 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Daqiqa / Summa
                        </button>

                        <button
                          onClick={() => {
                            setPlanModalUser(u)
                            setSelectedPlan(
                              planKey === 'pro' ? 'pro' : planKey === 'standard' ? 'standard' : 'standard'
                            )
                            setPlanDays(30)
                            setError(null)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 font-semibold text-xs flex items-center gap-1 transition"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Tarif yoqish
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

      {/* Pagination summary */}
      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <span>Jami topildi: <strong className="text-white">{total}</strong> ta foydalanuvchi</span>
        {total > 20 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10"
            >
              Oldingi
            </button>
            <span>Sahifa {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= total || loading}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10"
            >
              Keyingi
            </button>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD MINUTES / SUMMA MODAL */}
      {minuteModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Coins className="w-5 h-5 text-emerald-400" />
                  Daqiqa yoki Summa qo'shish
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">
                  {minuteModalUser.email}
                </p>
              </div>
              <button
                onClick={() => setMinuteModalUser(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs flex justify-between items-center">
              <span className="text-gray-400">Joriy balans:</span>
              <span className="text-emerald-400 font-bold">
                {minuteModalUser.balance.total_available} daqiqa (kuymas: {minuteModalUser.balance.purchased} daq)
              </span>
            </div>

            {/* Quick presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                Tezkor summalar:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { amount: 2000, label: "2 000 so'm (4 daq)" },
                  { amount: 5000, label: "5 000 so'm (10 daq)" },
                  { amount: 15000, label: "15 000 so'm (30 daq)" },
                  { amount: 31000, label: "31 000 so'm (62 daq)" },
                  { amount: 50000, label: "50 000 so'm (100 daq)" },
                  { amount: 100000, label: "100 000 so'm (200 daq)" },
                ].map((p) => (
                  <button
                    key={p.amount}
                    type="button"
                    onClick={() => applyPreset(p.amount)}
                    className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-gray-200 hover:border-emerald-500/50 transition text-center"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddMinutes} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">
                    Summa (so'mda):
                  </label>
                  <input
                    type="number"
                    value={amountUzs}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="Masalan: 5000"
                    min="0"
                    step="500"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">
                    Daqiqa miqdori:
                  </label>
                  <input
                    type="number"
                    value={minutes}
                    onChange={(e) => handleMinutesChange(e.target.value)}
                    placeholder="Masalan: 10"
                    min="0.1"
                    step="0.5"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400 bg-black/20 p-2.5 rounded-xl border border-white/5">
                <span>1 daqiqa kursi:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={ratePerMinute}
                    onChange={(e) => setRatePerMinute(Math.max(1, parseFloat(e.target.value) || 500))}
                    className="w-16 bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-center text-white"
                  />
                  <span>so'm</span>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                ℹ️ Qo'shilgan daqiqalar foydalanuvchining <span className="text-emerald-400 font-semibold">kuymaydigan balansi</span>ga yoziladi va oylik obuna tugasa ham saqlanib qoladi.
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMinuteModalUser(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || (!minutes && !amountUzs)}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Balansga qo'shish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SET PLAN MODAL */}
      {planModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-400" />
                  Tarif rejasini biriktirish
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">
                  {planModalUser.email}
                </p>
              </div>
              <button
                onClick={() => setPlanModalUser(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSetPlan} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300">
                  Tarifni tanlang:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'free', label: 'BEPUL', desc: '5 daq/oy, 360p', icon: Sparkles },
                    { id: 'standard', label: 'STANDART', desc: '300 daq/oy, 720p', icon: Zap },
                    { id: 'pro', label: 'PRO', desc: '400 daq/oy, Azure TTS, 1080p', icon: Crown },
                  ].map((p) => {
                    const Icon = p.icon
                    const isSelected = selectedPlan === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlan(p.id as any)}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition ${
                          isSelected
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`} />
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white">{p.label}</div>
                          <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{p.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedPlan !== 'free' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    Amal qilish muddati (kun):
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[
                      { days: 30, label: '30 kun (1 oy)' },
                      { days: 60, label: '60 kun (2 oy)' },
                      { days: 90, label: '90 kun (3 oy)' },
                      { days: 365, label: '1 yil' },
                    ].map((d) => (
                      <button
                        key={d.days}
                        type="button"
                        onClick={() => setPlanDays(d.days)}
                        className={`py-1.5 rounded-lg border text-xs font-medium transition ${
                          planDays === d.days
                            ? 'bg-blue-500/20 border-blue-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={planDays}
                    onChange={(e) => setPlanDays(Math.max(1, parseInt(e.target.value) || 30))}
                    min="1"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                    placeholder="Boshqa kun soni..."
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={resetMonthly}
                  onChange={(e) => setResetMonthly(e.target.checked)}
                  className="rounded bg-white/5 border-white/10 text-blue-500 focus:ring-0"
                />
                <span>Oylik sarflangan daqiqalarni 0 ga tushirish (yangi davr boshlash)</span>
              </label>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanModalUser(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Tarifni faollashtirish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
