'use client'
// Admin panel doim yangi holatda ko'rsatilishi kerak — Next.js buni statik
// deb baholab uzoq (s-maxage=1yil) keshlash header'i yuborgan edi, natijada
// yo'ldagi oraliq keshlar (masalan provayder proksisi) eski versiyani
// cheksiz saqlab qolgan (2026-08-13, real holatda tasdiqlangan).
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Users, Video, Wallet, LogOut, RefreshCw, ShieldAlert, LogIn, Ban, ArrowUp } from 'lucide-react'
import { AdminStats, apiAdminStats, BlockedUsersReport, apiAdminBlockedUsers, RefundsNeededReport, apiAdminRefundsNeeded } from '@/lib/admin'
import { getToken } from '@/lib/auth'
import { useAuth } from '@/hooks/useAuth'
import AdminUsersManager from '@/components/AdminUsersManager'
import AdminCookiesManager from '@/components/AdminCookiesManager'
import AdminRetentionManager from '@/components/AdminRetentionManager'
import AdminBroadcastManager from '@/components/AdminBroadcastManager'
import AdminFunnelManager from '@/components/AdminFunnelManager'
import AdminCohortsManager from '@/components/AdminCohortsManager'

const CATEGORY_LABELS: Record<string, string> = {
  sexual_explicit: "Pornografik / 18+ kontent",
  sexual_minors: "Voyaga yetmaganlar ishtirokidagi jinsiy kontent",
  sexual_violence: "Zo'rlash yoki jinsiy zo'ravonlik",
  terrorism_extremism: "Terroristik / ekstremistik targ'ibot",
  graphic_violence: "Haddan tashqari grafik zo'ravonlik",
  hate_violent_extremism: "Nafrat yoki zo'ravonlikni qo'zg'atish",
  self_harm: "O'ziga zarar yetkazishni targ'ib qilish",
  illegal_activity: "Noqonuniy faoliyatni targ'ib qilish/o'rgatish",
  religious_content: "Diniy kontent",
  policy_violation: "Kontent siyosatini buzish",
}

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

const SHORT_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek']

type Granularity = 'daily' | 'monthly' | 'yearly'
const GRANULARITY_CHART_LABEL: Record<Granularity, string> = {
  daily: 'oxirgi 30 kun',
  monthly: 'oxirgi 12 oy',
  yearly: 'oxirgi 5 yil',
}

// Granularity'ga qarab sana kaliti "YYYY-MM-DD" (kunlik), "YYYY-MM" (oylik)
// yoki "YYYY" (yillik) shaklida keladi — har biri o'z formatida ko'rsatiladi.
function formatShortDate(dateStr?: string) {
  if (!dateStr) return ''
  const parts = dateStr.split('-').map(Number)
  if (parts.length === 1) return String(parts[0])
  if (parts.length === 2) return `${SHORT_MONTHS[parts[1] - 1]} ${parts[0]}`
  const [, m, d] = parts
  return `${d}-${SHORT_MONTHS[m - 1]}`
}

function TrendChart({
  data,
  color,
  label,
}: {
  data: { date: string; value: number }[]
  color: string
  label: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const width = 600
  const height = 160
  const padTop = 12
  const padBottom = 22
  const padX = 8
  const plotW = width - padX * 2
  const plotH = height - padTop - padBottom
  const n = data.length
  const maxVal = Math.max(1, ...data.map((d) => d.value))

  const points = data.map((d, i) => ({
    x: padX + (n <= 1 ? 0 : (i / (n - 1)) * plotW),
    y: padTop + plotH - (d.value / maxVal) * plotH,
    ...d,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const areaPath =
    n > 0
      ? `${linePath} L${points[n - 1].x.toFixed(2)},${padTop + plotH} L${points[0].x.toFixed(2)},${padTop + plotH} Z`
      : ''

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * width
    let nearest = 0
    let best = Infinity
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX)
      if (dist < best) {
        best = dist
        nearest = i
      }
    })
    setHoverIdx(nearest)
  }

  const gridLines = [0.25, 0.5, 0.75].map((f) => padTop + plotH * f)
  const labelIdxs = n > 1 ? Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1])) : [0]
  const hp = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold text-gray-300">{label}</span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[160px]"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {gridLines.map((y, i) => (
            <line key={i} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#2c2c2a" strokeWidth={1} />
          ))}
          <line x1={padX} x2={width - padX} y1={padTop + plotH} y2={padTop + plotH} stroke="#383835" strokeWidth={1} />
          {areaPath && <path d={areaPath} fill={color} opacity={0.1} stroke="none" />}
          {linePath && (
            <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {points.length > 0 && (
            <circle cx={points[n - 1].x} cy={points[n - 1].y} r={4} fill={color} stroke="#1a1a19" strokeWidth={2} />
          )}
          {hp && (
            <>
              <line x1={hp.x} x2={hp.x} y1={padTop} y2={padTop + plotH} stroke="#898781" strokeWidth={1} strokeDasharray="2,2" />
              <circle cx={hp.x} cy={hp.y} r={4} fill={color} stroke="#1a1a19" strokeWidth={2} />
            </>
          )}
          {labelIdxs.map((i) => (
            <text
              key={i}
              x={points[i]?.x}
              y={height - 6}
              fontSize={9}
              fill="#898781"
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            >
              {formatShortDate(points[i]?.date)}
            </text>
          ))}
          <rect x={0} y={0} width={width} height={height} fill="transparent" onMouseMove={handleMove} />
        </svg>
        {hp && (
          <div
            className="absolute top-0 bg-black/80 border border-white/10 rounded-lg px-2 py-1 text-[11px] pointer-events-none whitespace-nowrap z-10"
            style={{ left: `${(hp.x / width) * 100}%`, transform: 'translate(-50%, -110%)' }}
          >
            <div className="text-gray-400">{formatShortDate(hp.date)}</div>
            <div className="text-white font-bold">{hp.value}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function DeltaCard({
  label,
  value,
  previousValue,
  previousLabel,
  isCurrency,
}: {
  label: string
  value: number
  previousValue: number
  previousLabel: string
  isCurrency?: boolean
}) {
  const diff = value - previousValue
  const isUp = diff > 0
  const isDown = diff < 0
  const color = isUp ? '#0ca30c' : isDown ? '#e66767' : '#898781'
  const sign = isUp ? '+' : ''

  const formattedVal = isCurrency ? `${value.toLocaleString('uz-UZ')} UZS` : value
  const formattedPrev = isCurrency ? `${previousValue.toLocaleString('uz-UZ')} UZS` : previousValue
  const formattedDiff = isCurrency ? `${sign}${diff.toLocaleString('uz-UZ')} UZS` : `${sign}${diff}`

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 min-w-0">
      <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-widest break-words leading-tight">{label}</p>
      <div className="flex items-end gap-2 mt-1 flex-wrap">
        <p className="text-xl sm:text-2xl font-extrabold text-white">{formattedVal}</p>
        <span className="text-[11px] font-bold mb-1" style={{ color }}>
          {diff !== 0 ? `${formattedDiff} (${previousLabel}: ${formattedPrev})` : `(${previousLabel}: ${formattedPrev})`}
        </span>
      </div>
    </div>
  )
}

function CenteredMessage({ icon, title, message, action }: { icon: React.ReactNode; title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-3xl p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto">
          {icon}
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-extrabold text-white">{title}</h1>
          <p className="text-xs text-gray-400 leading-relaxed">{message}</p>
        </div>
        {action}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const { user, loading: authLoading, isLoggedIn, logout } = useAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [blocked, setBlocked] = useState<BlockedUsersReport | null>(null)
  const [refunds, setRefunds] = useState<RefundsNeededReport | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [showTrends, setShowTrends] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showBlockedTables, setShowBlockedTables] = useState(false)
  const [showPaymentsHistory, setShowPaymentsHistory] = useState(false)
  const [showRecentUsers, setShowRecentUsers] = useState(false)
  const [showRecentJobs, setShowRecentJobs] = useState(false)
  const [statsLoading, setStatsLoading] = useState(true)
  const [errorKind, setErrorKind] = useState<'unauthorized' | 'forbidden' | 'other' | null>(null)
  const [errorDetail, setErrorDetail] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const loadStats = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setErrorKind('unauthorized')
      return
    }
    try {
      const data = await apiAdminStats(token)
      setStats(data)
      setErrorKind(null)
      try {
        setBlocked(await apiAdminBlockedUsers(token))
      } catch {
        // Bloklanganlar hisoboti ixtiyoriy -- xato bo'lsa asosiy panelni to'xtatmaydi.
      }
      try {
        setRefunds(await apiAdminRefundsNeeded(token))
      } catch {
        // Qaytarish hisoboti ixtiyoriy -- xato bo'lsa asosiy panelni to'xtatmaydi.
      }
    } catch (err: any) {
      const httpStatus = err?.response?.status
      if (httpStatus === 401) setErrorKind('unauthorized')
      else if (httpStatus === 403) setErrorKind('forbidden')
      else setErrorKind('other')
      setErrorDetail(err?.response?.data?.detail || 'Statistikani yuklashda xatolik')
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    loadStats().finally(() => setStatsLoading(false))
  }, [authLoading, loadStats])

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await loadStats()
    setRefreshing(false)
  }

  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  if (errorKind === 'unauthorized' || !isLoggedIn) {
    return (
      <CenteredMessage
        icon={<LogIn className="w-6 h-6" />}
        title="Tizimga kiring"
        message="Admin panelni ko'rish uchun avval saytga oddiy hisobingiz bilan kiring."
        action={
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-extrabold py-3 rounded-2xl transition-all text-sm"
          >
            Kirish sahifasiga o'tish
          </Link>
        }
      />
    )
  }

  if (errorKind === 'forbidden') {
    return (
      <CenteredMessage
        icon={<ShieldAlert className="w-6 h-6" />}
        title="Ruxsat yo'q"
        message={`${user?.email || 'Bu hisob'} uchun admin panelga kirish huquqi yo'q.`}
        action={
          <button
            onClick={logout}
            className="inline-flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold py-3 rounded-2xl transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            Chiqish
          </button>
        }
      />
    )
  }

  if (errorKind === 'other' || !stats) {
    return (
      <CenteredMessage
        icon={<ShieldAlert className="w-6 h-6" />}
        title="Xatolik"
        message={errorDetail || 'Statistikani yuklab bo\'lmadi.'}
        action={
          <button
            onClick={() => { setStatsLoading(true); loadStats().finally(() => setStatsLoading(false)) }}
            className="inline-flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold py-3 rounded-2xl transition-all text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Qayta urinish
          </button>
        }
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-10">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-white">Admin panel</h1>
            <p className="text-xs text-gray-400 mt-1">{user?.email}</p>
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
              onClick={logout}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition"
              aria-label="Chiqish"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sticky Tezkor O'tish paneli */}
        <div className="sticky top-2 z-30 bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-1.5 flex items-center gap-1.5 overflow-x-auto shadow-2xl">
          {[
            { id: 'sec-today', label: 'Bugun', icon: '⚡' },
            { id: 'sec-funnel', label: 'Voronka (Funnel)', icon: '📉' },
            { id: 'sec-cohorts', label: 'Kohortlar', icon: '🧬' },
            { id: 'sec-retention', label: 'Retention', icon: '📊' },
            { id: 'sec-users', label: 'Foydalanuvchilar', icon: '👥' },
            { id: 'sec-jobs', label: 'Dublyaj', icon: '🎬' },
            { id: 'sec-payments', label: "To'lovlar", icon: '💳' },
            { id: 'sec-management', label: 'Boshqaruv', icon: '⚙️' },
            { id: 'sec-broadcast', label: 'Xabarnoma', icon: '📢' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                document.getElementById(tab.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap text-gray-300 hover:text-white hover:bg-white/10 transition shrink-0"
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Bugun (Toshkent vaqti) */}
        <section id="sec-today" className="space-y-3 scroll-mt-16">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                Bugun (Toshkent vaqti)
              </h2>
            </div>
            <span className="text-[11px] text-gray-400 font-medium bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              Asia/Tashkent (UTC+5)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DeltaCard
              label="Ro'yxatdan o'tish (bugun)"
              value={stats.trends.today.users}
              previousValue={stats.trends.yesterday.users}
              previousLabel="kecha"
            />
            <DeltaCard
              label="Video dublyaj (bugun)"
              value={stats.trends.today.jobs}
              previousValue={stats.trends.yesterday.jobs}
              previousLabel="kecha"
            />
            <DeltaCard
              label="To'lovlar soni (bugun)"
              value={stats.trends.today.payments || 0}
              previousValue={stats.trends.yesterday.payments || 0}
              previousLabel="kecha"
            />
            <DeltaCard
              label="Tushum (bugun)"
              value={stats.trends.today.revenue_uzs || 0}
              previousValue={stats.trends.yesterday.revenue_uzs || 0}
              previousLabel="kecha"
              isCurrency={true}
            />
          </div>

          <div className="pt-1">
            <button
              onClick={() => setShowTrends(!showTrends)}
              className="text-[11px] text-gray-400 hover:text-blue-400 transition flex items-center gap-1.5 font-medium"
            >
              <span>{showTrends ? "▲ Trend grafiklarini yashirish" : "▼ Oylik / yillik trend grafiklarini ko'rsatish"}</span>
            </button>
          </div>

          {showTrends && (
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                {([
                  ['daily', 'Kunlik'],
                  ['monthly', 'Oylik'],
                  ['yearly', 'Yillik'],
                ] as [Granularity, string][]).map(([g, label]) => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      granularity === g
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TrendChart
                  label={`Ro'yxatdan o'tishlar (${GRANULARITY_CHART_LABEL[granularity]})`}
                  color="#3987e5"
                  data={stats.trends[granularity].map((d) => ({ date: d.date, value: d.users }))}
                />
                <TrendChart
                  label={`Video dublyajlar (${GRANULARITY_CHART_LABEL[granularity]})`}
                  color="#199e70"
                  data={stats.trends[granularity].map((d) => ({ date: d.date, value: d.jobs }))}
                />
              </div>
            </div>
          )}
        </section>

        {/* Users */}
        <section id="sec-users" className="space-y-3 scroll-mt-16">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Foydalanuvchilar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card label="Jami ro'yxatdan o'tgan" value={stats.users.total} icon={<Users className="w-5 h-5" />} />
            <Card label="Tasdiqlangan" value={stats.users.verified} icon={<Users className="w-5 h-5" />} />
            <Card label="So'nggi 7 kun" value={stats.users.last_7d} icon={<Users className="w-5 h-5" />} />
            <Card label="So'nggi 24 soat" value={stats.users.last_24h} icon={<Users className="w-5 h-5" />} />
          </div>
        </section>

        {/* YouTube Cookies Management -- nofaol qilingan (Edge orqali barqaror yuklangan) */}

        {/* Funnel Conversion Analytics */}
        <div id="sec-funnel" className="scroll-mt-16">
          <AdminFunnelManager token={getToken() || ''} />
        </div>

        {/* Activation & Retention Cohorts Analytics */}
        <div id="sec-cohorts" className="scroll-mt-16">
          <AdminCohortsManager token={getToken() || ''} />
        </div>

        {/* User Retention & Activity Analytics */}
        <div id="sec-retention" className="scroll-mt-16">
          <AdminRetentionManager token={getToken() || ''} />
        </div>

        {/* Users & Plans Management */}
        <div id="sec-management" className="scroll-mt-16">
          <AdminUsersManager />
        </div>

        {/* Broadcast Notifications: Email & Telegram */}
        <div id="sec-broadcast" className="scroll-mt-16">
          <AdminBroadcastManager token={getToken() || ''} />
        </div>

        {/* Jobs */}
        <section id="sec-jobs" className="space-y-3 scroll-mt-16">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dublyaj (foydalanish)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card label="Jami video" value={stats.jobs.total} icon={<Video className="w-5 h-5" />} />
            <Card label="Ro'yxatdan o'tganlardan" value={stats.jobs.with_registered_user} icon={<Video className="w-5 h-5" />} />
            <Card label="Tayyor (muvaffaqiyatli)" value={stats.jobs.by_status.COMPLETED || 0} icon={<Video className="w-5 h-5" />} />
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
        <section id="sec-payments" className="space-y-3 scroll-mt-16">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">To'lovlar</h2>
            <button
              onClick={() => setShowPaymentsHistory(!showPaymentsHistory)}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition"
            >
              <span>
                {showPaymentsHistory
                  ? "▲ Haqiqiy to'lovchilar ro'yxatini yashirish"
                  : "▼ Haqiqiy to'lovchilar ro'yxati (12 mijoz, 15 to'lov — 774,000 UZS)"}
              </span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Card label="Tasdiqlangan to'lovlar" value={stats.payments.approved_count} icon={<Wallet className="w-5 h-5" />} />
            <Card label="Jami tushum" value={`${stats.payments.revenue_total_uzs.toLocaleString('uz-UZ')} UZS`} icon={<Wallet className="w-5 h-5" />} />
          </div>

          {/* Collapsible Real Customer Payments Table */}
          {showPaymentsHistory && (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mt-3">
              <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">Haqiqiy to'lov qilgan mijozlar (Top to'lovchilar)</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Sinov va ichki to'lovlar chetlatilgan, sof 12 nafar real mijoz</p>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  Jami: 774,000 UZS
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left bg-white/[0.01]">
                      <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">#</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mijoz</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">To'lovlar</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Jami summa</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sotib olingan xizmat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Tojir watch', email: 'tojirwatch@gmail.com', count: 2, sum: 154000, desc: 'PRO tarif (149k) + Balans (5k)', prov: 'Click' },
                      { name: 'Shahzod', email: 'shahzodbekreyimboyev022@gmail.com', count: 1, sum: 149000, desc: 'PRO tarif', prov: 'Click' },
                      { name: 'Soatmurod Eshpo\'latov', email: 'eshpolatovsoatmurod@gmail.com', count: 1, sum: 100000, desc: '+300 daqiqa paketi', prov: 'Uzum' },
                      { name: 'Bitikchi', email: 'bitikchioghlan@gmail.com', count: 2, sum: 64000, desc: 'STANDARD (49k) + 30 daqiqa (15k)', prov: 'Uzum' },
                      { name: 'aziz raxmanov', email: 'azizraxmanov11@gmail.com', count: 2, sum: 60000, desc: '+120 daqiqa (45k) + 30 daqiqa (15k)', prov: 'Payme' },
                      { name: 'Adilet Orazaliev', email: 'aorazaliyev99@gmail.com', count: 1, sum: 49000, desc: 'STANDARD tarif', prov: 'Uzum' },
                      { name: 'Dilshod', email: 'dilshododilov1717@gmail.com', count: 1, sum: 49000, desc: 'STANDARD tarif', prov: 'Uzum' },
                      { name: 'Nodir Mirzayev', email: 'mirzayevnodir130@gmail.com', count: 1, sum: 45000, desc: '+120 daqiqa paketi', prov: 'Uzum' },
                      { name: 'Maks Donka', email: 'maksdonka0@gmail.com', count: 1, sum: 45000, desc: '+120 daqiqa paketi', prov: 'Click' },
                      { name: 'Chinora Boboqulova', email: 'boboqulovachinora739@gmail.com', count: 1, sum: 28500, desc: 'Video dublyaj (+57 daqiqa balans qo\'shildi)', prov: 'Payme' },
                      { name: 'Umid Valiyev', email: 'umidvaliyev479@gmail.com', count: 1, sum: 25500, desc: 'Video dublyaj (+51 daqiqa balans qo\'shildi)', prov: 'Uzum' },
                      { name: 'G‘ulomjon Eshniyozov', email: 'eshniyazov.g@gmail.com', count: 1, sum: 5000, desc: 'Balans to\'ldirish', prov: 'Click' },
                    ].map((c, i) => (
                      <tr key={c.email} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{i + 1}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-200">{c.name}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{c.email}</td>
                        <td className="px-4 py-2.5 text-xs text-center text-blue-400 font-bold">{c.count}</td>
                        <td className="px-4 py-2.5 text-xs text-right font-mono font-bold text-emerald-400">{c.sum.toLocaleString('uz-UZ')} UZS</td>
                        <td className="px-4 py-2.5 text-xs text-gray-300">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 font-mono">{c.prov}</span>
                            <span>{c.desc}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Bloklangan foydalanuvchilar -- Content Safety Gate (Katta blok ochilib-yopiladigan) */}
        {blocked && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Kontent siyosati -- bloklanganlar</h2>
              {(blocked.total_blocked_accounts > 0 || blocked.recent_violations.length > 0) && (
                <button
                  onClick={() => setShowBlockedTables(!showBlockedTables)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition"
                >
                  <span>
                    {showBlockedTables
                      ? "▲ Bloklanganlar jadvalini yashirish"
                      : `▼ Bloklanganlar va xavfsizlik cheklovlari jadvalini ko'rish (${blocked.recent_violations.length} ta)`}
                  </span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card label="Bloklangan akkauntlar" value={blocked.total_blocked_accounts} icon={<Ban className="w-5 h-5" />} />
              <Card label="Jami bloklanishlar" value={blocked.total_violations} icon={<ShieldAlert className="w-5 h-5" />} />
            </div>
            {showBlockedTables && blocked.total_blocked_accounts > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Foydalanuvchi</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Aloqa</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Necha marta</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">So'nggi marta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocked.users.map((u) => (
                      <tr key={u.user_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-gray-200">{u.name || 'Nomsiz'}</td>
                        <td className="px-4 py-3 text-gray-400">{u.email || u.phone || '—'}</td>
                        <td className="px-4 py-3 text-red-300 font-semibold">{u.violation_count}</td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                          {u.last_violation_at ? new Date(u.last_violation_at).toLocaleString('uz-UZ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {showBlockedTables && blocked.recent_violations.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest w-[150px] whitespace-nowrap">Sana</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Video</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest w-[110px] whitespace-nowrap">Bosqich</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest w-[160px] whitespace-nowrap">Toifa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocked.recent_violations.map((v) => (
                      <tr key={v.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                          {new Date(v.created_at).toLocaleString('uz-UZ')}
                        </td>
                        <td className="px-4 py-3 text-gray-200 truncate max-w-[280px]" title={v.video_title || undefined}>
                          {v.video_title || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                          {v.stage === 'metadata' ? 'Sarlavha' : 'Transkript'}
                        </td>
                        <td className="px-4 py-3 text-red-300 whitespace-nowrap text-xs">
                          {CATEGORY_LABELS[v.category] || v.category}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Qaytarilishi kerak bo'lgan to'lovlar -- 5 marta urinib ham muvaffaqiyatsiz tugagan pullik joblar */}
        {refunds && refunds.payments.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">To'lov qaytarilishi kerak</h2>
            <Card
              label="Jami qaytarilishi kerak"
              value={`${refunds.total_amount.toLocaleString('uz-UZ')} so'm`}
              icon={<Wallet className="w-5 h-5" />}
            />
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Foydalanuvchi</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Aloqa</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Summa</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Video</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Click tranzaksiya</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.payments.map((p) => (
                    <tr key={p.payment_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-gray-200">{p.user_name || 'Nomsiz'}</td>
                      <td className="px-4 py-3 text-gray-400">{p.user_email || p.user_phone || '—'}</td>
                      <td className="px-4 py-3 text-amber-300 font-semibold whitespace-nowrap">{p.amount.toLocaleString('uz-UZ')} so'm</td>
                      <td className="px-4 py-3 text-gray-200 truncate max-w-[260px]" title={p.video_title || undefined}>
                        {p.video_title || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs font-mono">{p.click_transaction_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Recent users (Katta blok ochilib-yopiladigan) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">So'nggi ro'yxatdan o'tganlar</h2>
            <button
              onClick={() => setShowRecentUsers(!showRecentUsers)}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition"
            >
              <span>{showRecentUsers ? "▲ Jadvalni yashirish" : `▼ Ro'yxatni ko'rish (${stats.recent_users.length} ta)`}</span>
            </button>
          </div>
          {showRecentUsers && (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Email</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest w-[160px] whitespace-nowrap">Sana</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest w-[130px] whitespace-nowrap">Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_users.map((u, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-gray-200 truncate max-w-[280px] font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleString('uz-UZ') : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {u.is_verified ? (
                          <span className="text-emerald-400 font-semibold text-xs">Tasdiqlangan</span>
                        ) : (
                          <span className="text-gray-500 text-xs">Tasdiqlanmagan</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {stats.recent_users.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">Hali user yo'q</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent jobs (Katta blok ochilib-yopiladigan, gorizontal scrollsiz) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">So'nggi joblar</h2>
            <button
              onClick={() => setShowRecentJobs(!showRecentJobs)}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition"
            >
              <span>{showRecentJobs ? "▲ Jadvalni yashirish" : `▼ Videolar jadvalini ko'rish (${stats.recent_jobs.length} ta)`}</span>
            </button>
          </div>
          {showRecentJobs && (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="px-3 sm:px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest w-[140px] whitespace-nowrap">Sana</th>
                    <th className="px-3 sm:px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Video</th>
                    <th className="px-3 sm:px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest max-w-[170px]">Akkaunt</th>
                    <th className="px-3 sm:px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">AI Modellar</th>
                    <th className="px-3 sm:px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest w-[120px] whitespace-nowrap">Holat</th>
                    <th className="px-3 sm:px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest max-w-[190px]">Xatolik</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_jobs.map((j) => {
                    const isNoSpeech = j.error_code === 'NO_SPEECH_FOUND'
                    const isSuccess = j.status === 'COMPLETED'
                    return (
                      <tr key={j.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3 sm:px-4 py-3 text-gray-400 whitespace-nowrap text-xs font-mono">
                          {j.created_at ? new Date(j.created_at).toLocaleString('uz-UZ') : '—'}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-gray-200 max-w-[240px] truncate" title={j.video_title || j.youtube_url}>
                          <a href={j.youtube_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 hover:underline">
                            {j.video_title || j.youtube_url}
                          </a>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-gray-200 max-w-[170px] truncate font-mono text-xs" title={j.user_email || ''}>
                          {j.user_email || 'Anonim'}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-xs">
                          <div className="font-mono text-[11px] font-semibold text-amber-300">
                            {j.tts_provider === 'gemini' ? '✨ Gemini' : j.tts_provider === 'edge' ? '⚡ Edge' : '🔷 Azure'}: {j.voice_name || 'Charon'}
                          </div>
                          <div className="text-[10px] text-gray-400 space-x-1 font-mono">
                            <span>STT: {j.stt_model || 'gemini-3.8-flash'}</span>
                            <span>•</span>
                            <span>Tarjima: {j.translation_model || 'gemini-3.8-flash'}</span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                          {isNoSpeech ? (
                            <span className="text-amber-400 font-semibold text-xs">Mijoz xatosi</span>
                          ) : (
                            <span
                              className={`text-xs font-medium ${
                                j.status === 'FAILED' ? 'text-red-400' : isSuccess ? 'text-emerald-400' : 'text-gray-300'
                              }`}
                            >
                              {STATUS_LABELS[j.status] || j.status}
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-3 max-w-[190px] truncate" title={j.error_message || undefined}>
                          {isSuccess ? null : isNoSpeech ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Ovoz topilmadi (Mijoz)
                            </span>
                          ) : (
                            <span className="text-red-300 text-xs font-mono">
                              {j.error_code || j.error_message || ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {stats.recent_jobs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                        Hali job yo'q
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Floating Scroll To Top Button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 p-3.5 bg-blue-600/90 hover:bg-blue-500 text-white rounded-2xl shadow-2xl border border-white/20 transition-all hover:scale-105 active:scale-95 backdrop-blur cursor-pointer"
          aria-label="Yuqoriga qaytish"
          title="Yuqoriga qaytish"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
