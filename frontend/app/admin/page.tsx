'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useTransition } from 'react'
import Link from 'next/link'
import {
  Loader2,
  Users,
  Video,
  Wallet,
  LogOut,
  RefreshCw,
  ShieldAlert,
  LogIn,
  Ban,
  ArrowUp,
  Activity,
  Layers,
  Sparkles,
  BarChart3,
  CreditCard,
  Bell,
  Clock,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Key,
  XCircle,
} from 'lucide-react'
import {
  AdminStats,
  apiAdminStats,
  BlockedUsersReport,
  apiAdminBlockedUsers,
  RefundsNeededReport,
  apiAdminRefundsNeeded,
  apiAdminRetryJob,
  apiAdminCancelJob,
} from '@/lib/admin'
import { getToken } from '@/lib/auth'
import { useAuth } from '@/hooks/useAuth'
import AdminUsersManager from '@/components/AdminUsersManager'
import AdminUnactivatedUsersManager from '@/components/AdminUnactivatedUsersManager'
import AdminJobsCostManager from '@/components/AdminJobsCostManager'
import AdminGeminiKeysManager from '@/components/AdminGeminiKeysManager'
import AdminFunnelManager from '@/components/AdminFunnelManager'
import AdminCohortsManager from '@/components/AdminCohortsManager'
import AdminRetentionManager from '@/components/AdminRetentionManager'
import AdminBroadcastManager from '@/components/AdminBroadcastManager'
import AdminSystemHealthManager from '@/components/AdminSystemHealthManager'
import { formatTashkentDateTime } from '@/lib/timestamp'

const CATEGORY_LABELS: Record<string, string> = {
  sexual_explicit: 'Pornografik / 18+ kontent',
  sexual_minors: 'Voyaga yetmaganlar ishtirokidagi jinsiy kontent',
  sexual_violence: "Zo'rlash yoki jinsiy zo'ravonlik",
  terrorism_extremism: "Terroristik / ekstremistik targ'ibot",
  graphic_violence: "Haddan tashqari grafik zo'ravonlik",
  hate_violent_extremism: "Nafrat yoki zo'ravonlikni qo'zg'atish",
  self_harm: "O'ziga zarar yetkazishni targ'ib qilish",
  illegal_activity: "Noqonuniy faoliyatni targ'ib qilish/o'rgatish",
  religious_content: 'Diniy kontent',
  policy_violation: 'Kontent siyosatini buzish',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Navbatda',
  AWAITING_PAYMENT: "To'lov kutilmoqda",
  DOWNLOADING: 'Yuklab olinmoqda',
  TRANSCRIBING: "Matnga o'girilmoqda",
  TRANSLATING: 'Tarjima qilinmoqda',
  SYNTHESIZING: 'Ovoz yaratilmoqda',
  SYNCING: 'Sinxronlanmoqda',
  MERGING: 'Birlashtirilmoqda',
  COMPLETED: 'Tayyor',
  FAILED: 'Xatolik',
}

type TabType =
  | 'overview'
  | 'jobs'
  | 'gemini'
  | 'users'
  | 'analytics'
  | 'payments'
  | 'safety'
  | 'health'
  | 'broadcast'

const TABS: { id: TabType; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'overview', label: 'Umumiy', icon: <Activity className="w-4 h-4" /> },
  { id: 'jobs', label: 'Dublyaj & Xarajatlar', icon: <Video className="w-4 h-4" /> },
  { id: 'gemini', label: 'API Kalitlar', icon: <Key className="w-4 h-4 text-amber-400" />, badge: '💎 Gemini + ⚡ Groq' },
  { id: 'users', label: 'Foydalanuvchilar', icon: <Users className="w-4 h-4" /> },
  { id: 'analytics', label: 'Analitika & Voronka', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'payments', label: "To'lovlar & Moliya", icon: <CreditCard className="w-4 h-4" /> },
  { id: 'safety', label: 'Xavfsizlik & Qoidalar', icon: <ShieldAlert className="w-4 h-4" /> },
  { id: 'health', label: 'Tizim Salomatligi & AI', icon: <Sparkles className="w-4 h-4" />, badge: 'Yangi' },
  { id: 'broadcast', label: 'Xabarnomalar', icon: <Bell className="w-4 h-4" /> },
]

function Card({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 min-w-0 shadow-lg">
      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
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
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 min-w-0 shadow-lg">
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

function CenteredMessage({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
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
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [usersSubTab, setUsersSubTab] = useState<'all' | 'unactivated'>('all')
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'funnel' | 'cohorts' | 'retention'>('funnel')

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [blocked, setBlocked] = useState<BlockedUsersReport | null>(null)
  const [refunds, setRefunds] = useState<RefundsNeededReport | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [showTrends, setShowTrends] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [statsLoading, setStatsLoading] = useState(true)
  const [errorKind, setErrorKind] = useState<'unauthorized' | 'forbidden' | 'other' | null>(null)
  const [errorDetail, setErrorDetail] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Clock
  const [currentTime, setCurrentTime] = useState('')

  // Retry state in Overview
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null)
  const [retryToast, setRetryToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Sync tab with URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab') as TabType
      if (tabParam && TABS.some((t) => t.id === tabParam)) {
        setActiveTab(tabParam)
      }
    }
  }, [])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tab)
      window.history.replaceState({}, '', url.toString())
    }
  }

  // Real-time Tashkent Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const timeStr = now.toLocaleTimeString('uz-UZ', {
        timeZone: 'Asia/Tashkent',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      setCurrentTime(timeStr)
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

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
      } catch {}
      try {
        setRefunds(await apiAdminRefundsNeeded(token))
      } catch {}
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

  async function handleOverviewRetry(jobId: string) {
    const token = getToken()
    if (!token) return
    try {
      setRetryingJobId(jobId)
      setRetryToast(null)
      const res = await apiAdminRetryJob(token, jobId)
      setRetryToast({ type: 'success', text: res.message || 'Job qayta navbatga qo‘yildi!' })
      await loadStats()
    } catch (err: any) {
      setRetryToast({
        type: 'error',
        text: err?.response?.data?.detail || err?.message || 'Qayta urinishda xatolik',
      })
    } finally {
      setRetryingJobId(null)
      setTimeout(() => setRetryToast(null), 5000)
    }
  }

  async function handleAdminCancel(jobId: string) {
    const token = getToken()
    if (!token) return
    if (!confirm("Ushbu videoni to'xtatish va bekor qilishni tasdiqlaysizmi?")) return
    try {
      setCancellingJobId(jobId)
      setRetryToast(null)
      const res = await apiAdminCancelJob(token, jobId)
      setRetryToast({ type: 'success', text: res.message || 'Video muvaffaqiyatli bekor qilindi!' })
      await loadStats()
    } catch (err: any) {
      setRetryToast({
        type: 'error',
        text: err?.response?.data?.detail || err?.message || 'Bekor qilishda xatolik',
      })
    } finally {
      setCancellingJobId(null)
      setTimeout(() => setRetryToast(null), 5000)
    }
  }

  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-9 h-9 animate-spin text-blue-400" />
        <p className="text-xs text-gray-400 font-mono">Admin panel yuklanmoqda...</p>
      </div>
    )
  }

  if (errorKind === 'unauthorized' || !isLoggedIn) {
    return (
      <CenteredMessage
        icon={<LogIn className="w-6 h-6" />}
        title="Tizimga kiring"
        message="Admin panelni ko'rish uchun avval administrator hisobingiz bilan tizimga kiring."
        action={
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-extrabold py-3 rounded-2xl transition-all text-sm shadow-xl"
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
        message={`${user?.email || 'Ushbu hisob'} uchun administrator huquqlari berilmagan.`}
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
        message={errorDetail || "Statistikani yuklab bo'lmadi."}
        action={
          <button
            onClick={() => {
              setStatsLoading(true)
              loadStats().finally(() => setStatsLoading(false))
            }}
            className="inline-flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold py-3 rounded-2xl transition-all text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Qayta urinish
          </button>
        }
      />
    )
  }

  const token = getToken() || ''

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Modern Top Header */}
        <header className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">GapirAI Admin Suite</h1>
                <span className="text-[10px] font-bold font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  v2.0 Pro
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                <span>{user?.email}</span>
                <span>•</span>
                <span className="text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Tizim onlayn
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end md:self-auto flex-wrap">
            {/* Live Tashkent Time Badge */}
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-mono text-gray-300 shadow-inner">
              <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="font-bold text-white">{currentTime}</span>
              <span className="text-[10px] text-gray-500">Toshkent (UTC+5)</span>
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition disabled:opacity-50"
              title="Statistikani yangilash"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/30 text-gray-400 hover:text-rose-400 transition"
              title="Chiqish"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Global Retry Toast Banner */}
        {retryToast && (
          <div
            className={`p-4 rounded-2xl text-xs flex items-center gap-2 font-medium border shadow-lg ${
              retryToast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {retryToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>{retryToast.text}</span>
          </div>
        )}

        {/* Primary Tab Navigation */}
        <nav className="bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-1.5 flex items-center gap-1.5 overflow-x-auto shadow-2xl sticky top-2 z-30 scrollbar-none">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 font-bold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* ========================================================= */}
        {/* TAB 1: OVERVIEW & DASHBOARD */}
        {/* ========================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Bugun (Toshkent vaqti) KPIs */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                    Bugun (Toshkent vaqti UTC+5)
                  </h2>
                </div>
                <button
                  onClick={() => setShowTrends(!showTrends)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition"
                >
                  {showTrends ? '▲ Grafikni yashirish' : '▼ 30 kunlik trend grafiklarini ko‘rish'}
                </button>
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

              {showTrends && (
                <div className="space-y-3 pt-3 border-t border-white/5">
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

            {/* Total Metric Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card label="Jami ro'yxatdan o'tganlar" value={stats.users.total} icon={<Users className="w-5 h-5" />} />
              <Card label="Jami yaratilgan videolar" value={stats.jobs.total} icon={<Video className="w-5 h-5" />} />
              <Card label="Tasdiqlangan to'lovlar" value={stats.payments.approved_count} icon={<Wallet className="w-5 h-5" />} />
              <Card
                label="Jami tushum"
                value={`${stats.payments.revenue_total_uzs.toLocaleString('uz-UZ')} UZS`}
                icon={<Wallet className="w-5 h-5" />}
              />
            </div>

            {/* Quick Recent Jobs with 1-Click Retry */}
            <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                      Bugungi dublyaj ishlari (Jonli navbat & holat)
                    </h3>
                    <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                      {stats.recent_jobs.length} ta bugun
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Faqat bugungi videolar (Maksimal 50 ta, xatolik yuz berganlarni shu yerdan qayta urinish mumkin)</p>
                </div>
                <button
                  onClick={() => handleTabChange('jobs')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                >
                  To‘liq xarajatlar tahliliga o‘tish →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.01] text-gray-400 uppercase text-[10px] font-semibold tracking-wider">
                      <th className="py-2.5 px-3">Vaqti</th>
                      <th className="py-2.5 px-3">Video</th>
                      <th className="py-2.5 px-3">Akkaunt</th>
                      <th className="py-2.5 px-3">Modellar</th>
                      <th className="py-2.5 px-3">Holat</th>
                      <th className="py-2.5 px-3 text-center">Amal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_jobs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400 text-xs">
                          Bugun hali yangi dublyaj ishlari yaratilmagan.
                        </td>
                      </tr>
                    ) : (
                      stats.recent_jobs.slice(0, 50).map((j) => {
                      const isNoSpeech = j.error_code === 'NO_SPEECH_FOUND'
                      const isSuccess = j.status === 'COMPLETED'
                      const isFailed = j.status === 'FAILED'
                      return (
                        <tr key={j.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap font-mono text-[11px]">
                            {formatTashkentDateTime(j.created_at) || '—'}
                          </td>
                          <td className="py-2.5 px-3 max-w-[260px] truncate">
                            <a
                              href={j.youtube_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-200 hover:text-blue-400 hover:underline"
                              title={j.video_title || j.youtube_url}
                            >
                              {j.video_title || j.youtube_url}
                            </a>
                          </td>
                          <td className="py-2.5 px-3 max-w-[160px] truncate text-gray-300 font-mono text-[11px]">
                            {j.user_email || 'Anonim'}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] font-mono text-gray-300">
                            <span className="text-amber-300 font-semibold">
                              {j.tts_provider === 'gemini' ? 'Gemini' : j.tts_provider === 'edge' ? 'Edge' : 'Azure'}
                            </span>
                            <span className="text-gray-500 text-[10px] ml-1">({j.voice_name || 'Charon'})</span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {isNoSpeech ? (
                              <span className="text-amber-400 font-semibold text-[11px]">Ovoz topilmadi</span>
                            ) : (
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                  isSuccess
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : isFailed
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    : 'bg-white/5 text-gray-300 border-white/10'
                                }`}
                              >
                                {STATUS_LABELS[j.status] || j.status}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {isFailed && !isNoSpeech && (
                                <button
                                  onClick={() => handleOverviewRetry(j.id)}
                                  disabled={retryingJobId === j.id}
                                  className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-50"
                                  title="Qayta urinish"
                                >
                                  <RefreshCw className={`w-3 h-3 ${retryingJobId === j.id ? 'animate-spin' : ''}`} />
                                  <span>Qayta urinish</span>
                                </button>
                              )}
                              {isSuccess && (
                                <button
                                  onClick={() => handleOverviewRetry(j.id)}
                                  disabled={retryingJobId === j.id}
                                  className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 hover:border-indigo-400 text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-50 shadow-sm shadow-indigo-500/10"
                                  title="Admin: Ushbu tayyor videoni qayta tayyorlash"
                                >
                                  <RefreshCw className={`w-3 h-3 ${retryingJobId === j.id ? 'animate-spin' : ''}`} />
                                  <span>Qayta tayyorlash</span>
                                </button>
                              )}
                              {!isSuccess && !isFailed && (
                                <button
                                  onClick={() => handleAdminCancel(j.id)}
                                  disabled={cancellingJobId === j.id}
                                  className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-50"
                                  title="To'xtatish va bekor qilish"
                                >
                                  {cancellingJobId === j.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <XCircle className="w-3 h-3" />
                                  )}
                                  <span>Bekor qilish</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    }))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: JOBS & COSTS MANAGEMENT */}
        {/* ========================================================= */}
        {activeTab === 'jobs' && (
          <section>
            <AdminJobsCostManager token={token} />
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 2.5: GEMINI API KEYS & QUOTA MANAGEMENT */}
        {/* ========================================================= */}
        {activeTab === 'gemini' && (
          <section>
            <AdminGeminiKeysManager token={token} />
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 3: USERS & CRM */}
        {/* ========================================================= */}
        {activeTab === 'users' && (
          <div className="space-y-5">
            {/* Sub-tab navigation */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <button
                onClick={() => setUsersSubTab('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  usersSubTab === 'all'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                👥 Barcha Foydalanuvchilar ({stats.users.total})
              </button>
              <button
                onClick={() => setUsersSubTab('unactivated')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  usersSubTab === 'unactivated'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                🎯 1-videoda qolib ketganlar (Aktivlashmaganlar)
              </button>
            </div>

            {usersSubTab === 'all' ? (
              <AdminUsersManager />
            ) : (
              <AdminUnactivatedUsersManager token={token} />
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: ANALYTICS, FUNNEL & RETENTION */}
        {/* ========================================================= */}
        {activeTab === 'analytics' && (
          <div className="space-y-5">
            {/* Sub-tab navigation */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <button
                onClick={() => setAnalyticsSubTab('funnel')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  analyticsSubTab === 'funnel'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                📉 Voronka Konversiyasi (Funnel)
              </button>
              <button
                onClick={() => setAnalyticsSubTab('cohorts')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  analyticsSubTab === 'cohorts'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                🧬 Kohort Tahlili (Cohorts)
              </button>
              <button
                onClick={() => setAnalyticsSubTab('retention')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  analyticsSubTab === 'retention'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                📊 Retention & Faollik (Activity)
              </button>
            </div>

            {analyticsSubTab === 'funnel' && <AdminFunnelManager token={token} />}
            {analyticsSubTab === 'cohorts' && <AdminCohortsManager token={token} />}
            {analyticsSubTab === 'retention' && <AdminRetentionManager token={token} />}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: PAYMENTS & FINANCIALS */}
        {/* ========================================================= */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Card
                label="Tasdiqlangan to'lovlar soni"
                value={stats.payments.approved_count}
                icon={<Wallet className="w-5 h-5" />}
              />
              <Card
                label="Jami tushum"
                value={`${stats.payments.revenue_total_uzs.toLocaleString('uz-UZ')} UZS`}
                icon={<Wallet className="w-5 h-5" />}
              />
            </div>

            {/* Real Customers Payments Table */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-5 py-4 bg-white/[0.02] border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                    Haqiqiy to'lov qilgan mijozlar (Top to'lovchilar)
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Sinov va ichki to'lovlar chetlatilgan, sof 12 nafar real mijoz
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
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
                      { name: "Soatmurod Eshpo'latov", email: 'eshpolatovsoatmurod@gmail.com', count: 1, sum: 100000, desc: '+300 daqiqa paketi', prov: 'Uzum' },
                      { name: 'Bitikchi', email: 'bitikchioghlan@gmail.com', count: 2, sum: 64000, desc: 'STANDARD (49k) + 30 daqiqa (15k)', prov: 'Uzum' },
                      { name: 'aziz raxmanov', email: 'azizraxmanov11@gmail.com', count: 2, sum: 60000, desc: '+120 daqiqa (45k) + 30 daqiqa (15k)', prov: 'Payme' },
                      { name: 'Adilet Orazaliev', email: 'aorazaliyev99@gmail.com', count: 1, sum: 49000, desc: 'STANDARD tarif', prov: 'Uzum' },
                      { name: 'Dilshod', email: 'dilshododilov1717@gmail.com', count: 1, sum: 49000, desc: 'STANDARD tarif', prov: 'Uzum' },
                      { name: 'Nodir Mirzayev', email: 'mirzayevnodir130@gmail.com', count: 1, sum: 45000, desc: '+120 daqiqa paketi', prov: 'Uzum' },
                      { name: 'Maks Donka', email: 'maksdonka0@gmail.com', count: 1, sum: 45000, desc: '+120 daqiqa paketi', prov: 'Click' },
                      { name: 'Chinora Boboqulova', email: 'boboqulovachinora739@gmail.com', count: 1, sum: 28500, desc: 'Video dublyaj (+57 daqiqa balans)', prov: 'Payme' },
                      { name: 'Umid Valiyev', email: 'umidvaliyev479@gmail.com', count: 1, sum: 25500, desc: 'Video dublyaj (+51 daqiqa balans)', prov: 'Uzum' },
                      { name: 'G‘ulomjon Eshniyozov', email: 'eshniyazov.g@gmail.com', count: 1, sum: 5000, desc: 'Balans to\'ldirish', prov: 'Click' },
                    ].map((c, i) => (
                      <tr key={c.email} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{i + 1}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-200">{c.name}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{c.email}</td>
                        <td className="px-4 py-2.5 text-xs text-center text-blue-400 font-bold">{c.count}</td>
                        <td className="px-4 py-2.5 text-xs text-right font-mono font-bold text-emerald-400">
                          {c.sum.toLocaleString('uz-UZ')} UZS
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-300">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 font-mono">
                              {c.prov}
                            </span>
                            <span>{c.desc}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Refunds Needed Section */}
            {refunds && refunds.payments.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                    <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Qaytarilishi Kerak Bo‘lgan To‘lovlar
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg">
                    Jami: {refunds.total_amount.toLocaleString('uz-UZ')} UZS
                  </span>
                </div>
                <div className="overflow-x-auto bg-black/30 rounded-xl border border-white/5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-gray-400 text-[10px] uppercase font-semibold">
                        <th className="p-3">Foydalanuvchi</th>
                        <th className="p-3">Aloqa</th>
                        <th className="p-3">Summa</th>
                        <th className="p-3">Video</th>
                        <th className="p-3">Tranzaksiya ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.payments.map((p) => (
                        <tr key={p.payment_id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                          <td className="p-3 font-semibold text-gray-200">{p.user_name || 'Nomsiz'}</td>
                          <td className="p-3 text-gray-400 font-mono">{p.user_email || p.user_phone || '—'}</td>
                          <td className="p-3 font-bold text-amber-400">{p.amount.toLocaleString('uz-UZ')} UZS</td>
                          <td className="p-3 text-gray-300 truncate max-w-[200px]">{p.video_title || '—'}</td>
                          <td className="p-3 font-mono text-gray-400">{p.click_transaction_id || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: SAFETY & VIOLATIONS */}
        {/* ========================================================= */}
        {activeTab === 'safety' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Card
                label="Bloklangan akkauntlar"
                value={blocked?.total_blocked_accounts || 0}
                icon={<Ban className="w-5 h-5" />}
              />
              <Card
                label="Jami qoidabuzarliklar"
                value={blocked?.total_violations || 0}
                icon={<ShieldAlert className="w-5 h-5" />}
              />
            </div>

            {/* Blocked Accounts Table */}
            {blocked && blocked.users.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 shadow-xl">
                <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                  Kontent siyosati orqali cheklangan akkauntlar
                </h3>
                <div className="overflow-x-auto bg-black/20 rounded-xl border border-white/5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-gray-400 text-[10px] uppercase font-semibold">
                        <th className="p-3">Foydalanuvchi</th>
                        <th className="p-3">Aloqa</th>
                        <th className="p-3 text-center">Buzilishlar soni</th>
                        <th className="p-3">Oxirgi buzilish vaqti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blocked.users.map((u) => (
                        <tr key={u.user_id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                          <td className="p-3 font-semibold text-gray-200">{u.name || 'Nomsiz'}</td>
                          <td className="p-3 text-gray-400 font-mono">{u.email || u.phone || '—'}</td>
                          <td className="p-3 text-center font-bold text-red-400">{u.violation_count}</td>
                          <td className="p-3 text-gray-400 font-mono">{formatTashkentDateTime(u.last_violation_at) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent Violations Log */}
            {blocked && blocked.recent_violations.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 shadow-xl">
                <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                  So‘nggi qoidabuzarlik hodisalari jurnali
                </h3>
                <div className="overflow-x-auto bg-black/20 rounded-xl border border-white/5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-gray-400 text-[10px] uppercase font-semibold">
                        <th className="p-3">Vaqt</th>
                        <th className="p-3">Video sarlavhasi</th>
                        <th className="p-3">Aniqlangan bosqich</th>
                        <th className="p-3">Toifa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blocked.recent_violations.map((v) => (
                        <tr key={v.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                          <td className="p-3 font-mono text-gray-400">{formatTashkentDateTime(v.created_at)}</td>
                          <td className="p-3 text-gray-200 font-medium truncate max-w-[300px]">{v.video_title || '—'}</td>
                          <td className="p-3 text-gray-300">
                            {v.stage === 'metadata' ? 'Sarlavha (Metadata)' : 'Transkript (Nutq)'}
                          </td>
                          <td className="p-3 text-red-300 font-semibold">
                            {CATEGORY_LABELS[v.category] || v.category}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: SYSTEM HEALTH & AI PROVIDERS */}
        {/* ========================================================= */}
        {activeTab === 'health' && (
          <section>
            <AdminSystemHealthManager token={token} />
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 8: BROADCAST NOTIFICATIONS */}
        {/* ========================================================= */}
        {activeTab === 'broadcast' && (
          <section>
            <AdminBroadcastManager token={token} />
          </section>
        )}
      </div>

      {/* Floating Scroll To Top Button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 p-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-2xl border border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur"
          aria-label="Yuqoriga qaytish"
          title="Yuqoriga qaytish"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
