'use client'
import { useEffect, useState } from 'react'
import { Loader2, Users, Video, Wallet, LogOut, RefreshCw } from 'lucide-react'
import { AdminStats, apiAdminLogin, apiAdminStats, getAdminKey, setAdminKey, clearAdminKey } from '@/lib/admin'

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Navbatda",
  AWAITING_PAYMENT: "To'lov kutilmoqda",
  DOWNLOADING: "Yuklab olinmoqda",
  TRANSCRIBING: "Matnga o'girilmoqda",
  TRANSLATING: "Tarjima qilinmoqda",
  SYNTHESIZING: "Ovoz yaratilmoqda",
  SYNCING: "Sinxronlanmoqda",
  MERGING: "Birlashtirilmoqda",
  COMPLETED: "Tayyor",
  FAILED: "Xatolik",
}

function Card({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 min-w-0">
      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-widest break-words leading-tight">{label}</p>
        <p className="text-xl sm:text-2xl font-extrabold text-white mt-1 break-words">{value}</p>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [statsError, setStatsError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function loadStats(key: string) {
    try {
      const data = await apiAdminStats(key)
      setStats(data)
      setStatsError('')
      setAuthed(true)
    } catch (err: any) {
      clearAdminKey()
      setAuthed(false)
      setStatsError(err?.response?.data?.detail || 'Statistikani yuklashda xatolik')
    }
  }

  useEffect(() => {
    const key = getAdminKey()
    if (key) {
      loadStats(key).finally(() => setChecking(false))
    } else {
      setChecking(false)
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      await apiAdminLogin(password)
      setAdminKey(password)
      await loadStats(password)
    } catch (err: any) {
      setLoginError(err?.response?.data?.detail || "Parol noto'g'ri")
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleRefresh() {
    const key = getAdminKey()
    if (!key) return
    setRefreshing(true)
    await loadStats(key)
    setRefreshing(false)
  }

  function handleLogout() {
    clearAdminKey()
    setAuthed(false)
    setStats(null)
    setPassword('')
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  if (!authed || !stats) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-lg font-extrabold text-white">Admin panel</h1>
            <p className="text-xs text-gray-400">GapirAI.uz statistikasi</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin paroli"
            required
            autoFocus
            className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
          />
          {(loginError || statsError) && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-3 text-red-400 text-xs font-semibold">
              {loginError || statsError}
            </div>
          )}
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-extrabold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Kirish
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-10">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-white">Admin panel</h1>
            <p className="text-xs text-gray-400 mt-1">GapirAI.uz statistikasi</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition disabled:opacity-50"
              aria-label="Yangilash"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition"
              aria-label="Chiqish"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Users */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Foydalanuvchilar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card label="Jami ro'yxatdan o'tgan" value={stats.users.total} icon={<Users className="w-5 h-5" />} />
            <Card label="Tasdiqlangan" value={stats.users.verified} icon={<Users className="w-5 h-5" />} />
            <Card label="So'nggi 7 kun" value={stats.users.last_7d} icon={<Users className="w-5 h-5" />} />
            <Card label="So'nggi 24 soat" value={stats.users.last_24h} icon={<Users className="w-5 h-5" />} />
          </div>
        </section>

        {/* Jobs */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dublyaj (foydalanish)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card label="Jami video" value={stats.jobs.total} icon={<Video className="w-5 h-5" />} />
            <Card label="Ro'yxatdan o'tganlardan" value={stats.jobs.with_registered_user} icon={<Video className="w-5 h-5" />} />
            <Card label="Anonim" value={stats.jobs.anonymous} icon={<Video className="w-5 h-5" />} />
            <Card label="So'nggi 24 soat" value={stats.jobs.last_24h} icon={<Video className="w-5 h-5" />} />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Holat bo'yicha</p>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {Object.entries(stats.jobs.by_status).map(([status, count]) => (
                <div key={status} className="bg-black/20 border border-white/10 rounded-xl px-3 sm:px-4 py-2 flex items-center gap-2">
                  <span className="text-xs text-gray-400">{STATUS_LABELS[status] || status}</span>
                  <span className="text-sm font-bold text-white">{count}</span>
                </div>
              ))}
              {Object.keys(stats.jobs.by_status).length === 0 && (
                <span className="text-xs text-gray-500">Hali video yo'q</span>
              )}
            </div>
          </div>
        </section>

        {/* Payments */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">To'lovlar</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card label="Tasdiqlangan to'lovlar" value={stats.payments.approved_count} icon={<Wallet className="w-5 h-5" />} />
            <Card label="Jami tushum" value={`${stats.payments.revenue_total_uzs.toLocaleString('uz-UZ')} UZS`} icon={<Wallet className="w-5 h-5" />} />
          </div>
        </section>

        {/* Recent users */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">So'nggi ro'yxatdan o'tganlar</h2>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 sm:px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Email</th>
                  <th className="px-4 sm:px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Sana</th>
                  <th className="px-4 sm:px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Holat</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_users.map((u, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-4 sm:px-5 py-3 text-gray-200 whitespace-nowrap">{u.email}</td>
                    <td className="px-4 sm:px-5 py-3 text-gray-400 whitespace-nowrap">
                      {u.created_at ? new Date(u.created_at).toLocaleString('uz-UZ') : '—'}
                    </td>
                    <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                      {u.is_verified ? (
                        <span className="text-emerald-400 font-semibold">Tasdiqlangan</span>
                      ) : (
                        <span className="text-gray-500">Tasdiqlanmagan</span>
                      )}
                    </td>
                  </tr>
                ))}
                {stats.recent_users.length === 0 && (
                  <tr><td colSpan={3} className="px-4 sm:px-5 py-6 text-center text-gray-500">Hali user yo'q</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
