'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  Database,
  Server,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Cookie,
} from 'lucide-react'
import { apiAdminSystemHealth, SystemHealthResponse } from '@/lib/admin'
import { formatTashkentDateTime } from '@/lib/timestamp'

interface AdminSystemHealthManagerProps {
  token: string
}

export default function AdminSystemHealthManager({ token }: AdminSystemHealthManagerProps) {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHealth = useCallback(async () => {
    if (!token) return
    try {
      setError(null)
      const data = await apiAdminSystemHealth(token)
      setHealth(data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Tizim salomatligini tekshirib bo‘lmadi')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    loadHealth()
    const timer = setInterval(() => {
      loadHealth()
    }, 30000) // Har 30 soniyada avto-yangilanish
    return () => clearInterval(timer)
  }, [loadHealth])

  const handleManualRefresh = () => {
    setRefreshing(true)
    loadHealth()
  }

  if (loading && !health) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-ui-muted font-medium">Tizim holati tekshirilmoqda...</p>
      </div>
    )
  }

  const comp = health?.components
  const isHealthy = health?.status === 'healthy'
  const isDegraded = health?.status === 'degraded'

  return (
    <div className="space-y-6">
      {/* Top Banner: Global Status & Last Updated */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
              isHealthy
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : isDegraded
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}
          >
            {isHealthy ? (
              <CheckCircle2 className="w-6 h-6 animate-pulse" />
            ) : isDegraded ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <XCircle className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">
                {isHealthy
                  ? 'Barcha tizimlar barqaror ishlamoqda'
                  : isDegraded
                  ? 'Tizimda eʼtibor talab ko‘rsatkichlar mavjud'
                  : 'Tizimda xatolik aniqlandi'}
              </h2>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  isHealthy
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : isDegraded
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-red-500/10 text-red-300 border-red-500/30'
                }`}
              >
                {health?.status || 'Unknown'}
              </span>
            </div>
            <p className="text-xs text-ui-muted mt-0.5">
              GapirAI infratuzilmasi, sunʼiy intellekt provayderlari va qayta ishlash navbatlari
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs font-mono text-ui-muted flex items-center gap-1 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            {health?.timestamp ? formatTashkentDateTime(health.timestamp) : '—'}
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs font-semibold transition disabled:opacity-50"
            title="Qayta tekshirish"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Yangilash</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Core Infrastructure Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Database */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                comp?.database?.status === 'healthy'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {comp?.database?.status === 'healthy' ? 'FAOL' : 'XATO'}
            </span>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-ui-muted ">PostgreSQL Bazasi</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-xl font-semibold text-white">
                {comp?.database?.latency_ms !== undefined ? `${comp.database.latency_ms} ms` : '—'}
              </p>
              <span className="text-xs text-gray-500 font-mono">javob vaqti</span>
            </div>
          </div>
        </div>

        {/* Redis */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                comp?.redis?.status === 'healthy'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {comp?.redis?.status === 'healthy' ? 'FAOL' : 'XATO'}
            </span>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-ui-muted ">Redis Kesh & Broker</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-xl font-semibold text-white">
                {comp?.redis?.latency_ms !== undefined ? `${comp.redis.latency_ms} ms` : '—'}
              </p>
              <span className="text-xs text-gray-500 font-mono">ping latency</span>
            </div>
          </div>
        </div>

        {/* Disk Space */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                comp?.disk?.status === 'healthy'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : comp?.disk?.status === 'warning'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {comp?.disk?.used_percent !== undefined ? `${comp.disk.used_percent}% band` : '—'}
            </span>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-ui-muted ">Disk Xotirasi</h3>
            <p className="text-xl font-semibold text-white mt-1">
              {comp?.disk?.free_gb !== undefined ? `${comp.disk.free_gb} GB` : '—'}
              <span className="text-xs font-normal text-ui-muted ml-1">bo‘sh</span>
            </p>
            {/* Usage Progress Bar */}
            <div className="w-full bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (comp?.disk?.used_percent || 0) > 90
                    ? 'bg-red-500'
                    : (comp?.disk?.used_percent || 0) > 75
                    ? 'bg-amber-500'
                    : 'bg-purple-500'
                }`}
                style={{ width: `${Math.min(100, comp?.disk?.used_percent || 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Celery Workers */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                comp?.celery?.status === 'healthy'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              {comp?.celery?.worker_count ? `${comp.celery.worker_count} TA WORKER` : 'OGOHLANTIRISH'}
            </span>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-ui-muted ">Celery Ishchi Jarayonlar</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-xl font-semibold text-white">
                {comp?.celery?.worker_count ?? 0}
              </p>
              <span className="text-xs text-gray-500 font-mono">faol konteyner</span>
            </div>
          </div>
        </div>
      </div>

      {/* Queues & Processing Pipeline Status */}
      {comp?.queues && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-semibold text-gray-200 ">
                Video Ishlov Berish Navbatlari (Redis Queues)
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
              Jami navbatda: {comp.queues.total_queued} ta
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-ui-muted font-mono ">video_processing</span>
                <p className="text-xs text-gray-300 mt-0.5">Asosiy dublyaj navbati</p>
              </div>
              <span className="text-lg font-semibold font-mono text-white bg-white/5 px-2.5 py-1 rounded-lg">
                {comp.queues.video_processing}
              </span>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-ui-muted font-mono ">local_upload</span>
                <p className="text-xs text-gray-300 mt-0.5">Lokal yuklangan videolar</p>
              </div>
              <span className="text-lg font-semibold font-mono text-white bg-white/5 px-2.5 py-1 rounded-lg">
                {comp.queues.local_upload}
              </span>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-ui-muted font-mono ">celery</span>
                <p className="text-xs text-gray-300 mt-0.5">Yordamchi/default vazifalar</p>
              </div>
              <span className="text-lg font-semibold font-mono text-white bg-white/5 px-2.5 py-1 rounded-lg">
                {comp.queues.celery}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* AI Providers Grid */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-semibold text-gray-200 ">
            Sunʼiy Intellekt Provayderlari Holati
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gemini */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">Google Gemini</h4>
                  <span className="text-xs font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                    ASOSIY ENGINE
                  </span>
                </div>
                <p className="text-xs text-ui-muted mt-1">
                  STT (transkript), O‘zbekcha tarjima va Ovoz sintezi (Gemini TTS)
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                FAOL ✅
              </span>
            </div>
            <div className="text-xs font-mono text-gray-300 bg-white/5 p-2 rounded-lg space-y-1">
              <div>Asosiy model: <span className="text-blue-300">{comp?.ai_providers?.gemini?.models?.general || 'gemini-3.8-flash'}</span></div>
              <div>STT / TTS: <span className="text-amber-300">{comp?.ai_providers?.gemini?.models?.stt || 'gemini-3.8-flash'}</span> / <span className="text-amber-300">{comp?.ai_providers?.gemini?.models?.tts || 'gemini-3.8-flash'}</span></div>
            </div>
          </div>

          {/* Azure Speech */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">Microsoft Azure Speech</h4>
                  <span className="text-xs font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                    HIGH-FIDELITY TTS
                  </span>
                </div>
                <p className="text-xs text-ui-muted mt-1">
                  Ko‘p tilli tabiiy ovoz sintezi va zaxira transkripsiya
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                FAOL ✅
              </span>
            </div>
            <div className="text-xs font-mono text-gray-300 bg-white/5 p-2 rounded-lg space-y-1">
              <div>Region: <span className="text-cyan-300">{comp?.ai_providers?.azure?.region || 'eastus'}</span></div>
              <div>Ovozlar: <span className="text-gray-300">Sardor, Madina (Multilingual Neural)</span></div>
            </div>
          </div>

          {/* OpenAI */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-300">OpenAI (GPT-4o & Whisper)</h4>
                  <span className="text-xs font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                    BALANS 0
                  </span>
                </div>
                <p className="text-xs text-ui-muted mt-1">
                  Vaqtinchalik o‘chirilgan. Ishlar to‘xtamasligi uchun Gemini va Azure'ga yo‘naltirilgan.
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                NOFAOL ⏸️
              </span>
            </div>
            <div className="text-xs font-mono text-ui-muted bg-white/5 p-2 rounded-lg">
              Holat: <span className="text-amber-400 font-semibold">Balans 0 bo‘lgani uchun xatoliksiz Gemini/Azure'ga o‘tmoqda</span>
            </div>
          </div>

          {/* Edge TTS */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">Edge TTS</h4>
                  <span className="text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    BEPUL ZAXIRA
                  </span>
                </div>
                <p className="text-xs text-ui-muted mt-1">
                  Favqulodda vaziyatlar uchun bepul zaxira ovoz moduli
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                FAOL ✅
              </span>
            </div>
            <div className="text-xs font-mono text-gray-300 bg-white/5 p-2 rounded-lg">
              Cheklovsiz, yuqori tezlikdagi zaxira ovoz yaratish
            </div>
          </div>
        </div>
      </div>

      {/* Cookies & YouTube Downloader Health */}
      {comp?.youtube_cookies && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-gray-200 ">
                  YouTube Cookies & Signature Bypass
                </h4>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    comp.youtube_cookies.exists && comp.youtube_cookies.is_fresh
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {comp.youtube_cookies.exists ? 'YUKLANGAN' : 'STANDART PROVAYDER'}
                </span>
              </div>
              <p className="text-xs text-ui-muted mt-0.5">
                {comp.youtube_cookies.message || 'YouTube yuklab olish komponentlari barqaror holatda'}
              </p>
            </div>
          </div>
          {comp.youtube_cookies.exists && (
            <span className="text-xs font-mono text-gray-300 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 self-start sm:self-auto">
              Qolgan muddat: {comp.youtube_cookies.days_remaining} kun
            </span>
          )}
        </div>
      )}
    </div>
  )
}
