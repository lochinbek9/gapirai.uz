'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Key,
  Shield,
  Zap,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  TrendingUp,
  Sliders,
  Info,
  Edit2,
  Check,
  X,
  ExternalLink,
  Cpu,
  Layers,
  Sparkles,
  Server,
  Activity,
} from 'lucide-react'
import {
  apiAdminGeminiKeysOverview,
  apiAdminSetGeminiAdminMode,
  apiAdminSetGeminiInitialBalance,
  apiAdminResetGeminiCooldown,
  apiAdminResetGroqCooldown,
  GeminiKeysOverviewResponse,
  GeminiKeyItem,
  GroqKeysOverviewResponse,
  GroqKeyItem,
} from '@/lib/admin'

interface Props {
  token: string
}

export default function AdminGeminiKeysManager({ token }: Props) {
  const [data, setData] = useState<GeminiKeysOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Provider Tab: 'gemini' or 'groq' — strict separation!
  const [providerTab, setProviderTab] = useState<'gemini' | 'groq'>('gemini')

  // Search & filter for Gemini keys
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COOLDOWN'>('ALL')

  // Search & filter for Groq keys
  const [groqSearchTerm, setGroqSearchTerm] = useState('')

  // Edit balance modal/state
  const [editingBalance, setEditingBalance] = useState(false)
  const [newBalance, setNewBalance] = useState('')
  const [savingBalance, setSavingBalance] = useState(false)

  // Mode change state
  const [switchingMode, setSwitchingMode] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Reset cooldown state
  const [resettingKey, setResettingKey] = useState<string | null>(null)

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ type, text })
    setTimeout(() => setFeedbackMsg(null), 5000)
  }

  const loadData = useCallback(async (isRefresh = false) => {
    if (!token) return
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      const res = await apiAdminGeminiKeysOverview(token)
      setData(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Kalitlar ma‘lumotini yuklashda xatolik yuz berdi.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleModeSwitch = async (newMode: 'free' | 'paid') => {
    if (!token || switchingMode) return
    try {
      setSwitchingMode(true)
      await apiAdminSetGeminiAdminMode(token, newMode)
      showFeedback(`Admin rejimi muvaffaqiyatli '${newMode === 'free' ? 'Bepul kalitlar hovuzi' : 'Pullik kalit'}'ga o'tkazildi!`)
      await loadData(true)
    } catch (err: any) {
      showFeedback(err?.response?.data?.detail || 'Rejimni o‘zgartirishda xatolik', 'error')
    } finally {
      setSwitchingMode(false)
    }
  }

  const handleSaveBalance = async () => {
    if (!token || savingBalance) return
    const num = parseFloat(newBalance)
    if (isNaN(num) || num < 0) {
      alert("Iltimos, to'g'ri musbat dollar miqdorini kiriting (masalan: 30.0)")
      return
    }
    try {
      setSavingBalance(true)
      await apiAdminSetGeminiInitialBalance(token, num)
      showFeedback(`Boshlang'ich balans $${num.toFixed(2)} qilib belgilandi!`)
      setEditingBalance(false)
      await loadData(true)
    } catch (err: any) {
      showFeedback(err?.response?.data?.detail || 'Balansni saqlashda xatolik', 'error')
    } finally {
      setSavingBalance(false)
    }
  }

  const handleResetCooldown = async (maskedKey: string) => {
    if (!token || resettingKey) return
    try {
      setResettingKey(maskedKey)
      await apiAdminResetGeminiCooldown(token, maskedKey)
      showFeedback(`${maskedKey} kaliti uchun cooldown muvaffaqiyatli tozalandi!`)
      await loadData(true)
    } catch (err: any) {
      showFeedback(err?.response?.data?.detail || 'Cooldownni tozalashda xatolik', 'error')
    } finally {
      setResettingKey(null)
    }
  }

  const handleResetGroqCooldown = async (maskedKey: string) => {
    if (!token || resettingKey) return
    try {
      setResettingKey(maskedKey)
      await apiAdminResetGroqCooldown(token, maskedKey)
      showFeedback(`Groq: ${maskedKey} kaliti uchun cooldown muvaffaqiyatli tozalandi!`)
      await loadData(true)
    } catch (err: any) {
      showFeedback(err?.response?.data?.detail || 'Groq cooldownni tozalashda xatolik', 'error')
    } finally {
      setResettingKey(null)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm font-medium">API kalitlari va kvota statistikasi yuklanmoqda...</p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-8 text-center bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 space-y-3">
        <AlertTriangle className="w-8 h-8 mx-auto" />
        <p className="font-semibold">{error}</p>
        <button
          onClick={() => loadData()}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white text-xs font-semibold transition"
        >
          Qayta urinish
        </button>
      </div>
    )
  }

  const paidKey = data?.paid_key
  const freeKeys = (data?.free_keys || []).filter((k) => {
    if (searchTerm && !k.key_masked.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    if (statusFilter === 'ACTIVE' && k.status !== 'active') return false
    if (statusFilter === 'COOLDOWN' && k.status !== 'cooldown') return false
    return true
  })

  const groqData: GroqKeysOverviewResponse | undefined = data?.groq
  const groqKeys = (groqData?.keys || []).filter((k) => {
    if (groqSearchTerm && !k.key_masked.toLowerCase().includes(groqSearchTerm.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between shadow-xl transition-all duration-300 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/20 border border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="p-1 hover:bg-white/10 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header Summary Bar */}
      <div className="bg-[#12141a] border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>AI Modellari & API Kalitlar Markazi</span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Google Gemini (Ovoz/Matn) va Groq Cloud (Ultra-tezkor STT/Qwen) mustaqil hovuzlari
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Yangilash</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 🧭 STRICT PROVIDER NAVIGATION TABS (HECH QACHON ARALASHTIRILMAYDI) */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 bg-[#0f1117] border border-white/10 rounded-2xl">
        <button
          onClick={() => setProviderTab('gemini')}
          className={`flex items-center justify-between p-3.5 rounded-xl transition text-left ${
            providerTab === 'gemini'
              ? 'bg-gradient-to-r from-amber-500/20 to-blue-500/10 border border-amber-500/40 text-white shadow-lg'
              : 'hover:bg-white/5 text-gray-400 hover:text-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              💎
            </span>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-1.5">
                <span>Google Gemini Kalitlari</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                1 pullik ($30.00) + {data?.summary.total_free_keys || 35} ta bepul kalit • Ovoz & Matn
              </p>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-bold ${
            providerTab === 'gemini'
              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
              : 'bg-white/5 text-gray-500'
          }`}>
            {data?.summary.total_keys || 36} kalit
          </span>
        </button>

        <button
          onClick={() => setProviderTab('groq')}
          className={`flex items-center justify-between p-3.5 rounded-xl transition text-left ${
            providerTab === 'groq'
              ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border border-emerald-500/40 text-white shadow-lg'
              : 'hover:bg-white/5 text-gray-400 hover:text-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              ⚡
            </span>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-1.5">
                <span>Groq Cloud Kalitlari</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  $0.00 (BEPUL)
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Whisper STT & Qwen 27B • Ultra-tezkor LPU • 0 xarajat (0 UZS)
              </p>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-bold ${
            providerTab === 'groq'
              ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
              : 'bg-white/5 text-gray-500'
          }`}>
            {groqData?.summary.total_keys || 2} kalit
          </span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* ⚡ TAB B: GROQ CLOUD DEDICATED PANEL (ARALASHTIRILMAGAN)        */}
      {/* ============================================================== */}
      {providerTab === 'groq' && (
        <div className="space-y-6">
          {/* Groq Overview Hero Banner */}
          <div className="bg-gradient-to-br from-emerald-500/[0.08] via-[#12161f] to-teal-950/[0.05] border border-emerald-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/20 pb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-inner">
                    ⚡
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                        Groq Cloud LPU Infratuzilmasi
                      </h3>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        0 XARAJAT • BEPUL TIER
                      </span>
                    </div>
                    <p className="text-xs text-emerald-200/80 font-mono mt-0.5">
                      Whisper Large v3 Turbo (STT) + Qwen 2.5 32B/Qwen 27B (LLM) • Tezlik: ~0.4s
                    </p>
                  </div>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300 font-mono">
                    Real xarajat: $0.00 (0 UZS)
                  </span>
                </div>
              </div>

              {/* Stat Cards for Groq */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-black/30 border border-emerald-500/20 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    Umumiy Xarajat
                  </p>
                  <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 font-mono">
                    $0.00
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    0 UZS (Mutlaqo bepul)
                  </p>
                </div>

                <div className="bg-black/30 border border-emerald-500/20 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Inference Tezligi
                  </p>
                  <p className="text-xl sm:text-2xl font-black text-amber-300 mt-1 font-mono">
                    ~0.4 soniya
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    LPU chip (serverga 0% yuk)
                  </p>
                </div>

                <div className="bg-black/30 border border-emerald-500/20 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-blue-400" />
                    Faol Kalitlar
                  </p>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1 font-mono">
                    {groqData?.summary.total_active_keys || 2} / {groqData?.summary.total_keys || 2}
                  </p>
                  <p className="text-[10px] text-emerald-400 mt-0.5 font-mono">
                    Barchasi 100% ishchi holatda
                  </p>
                </div>

                <div className="bg-black/30 border border-emerald-500/20 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    Bajarilgan So'rovlar
                  </p>
                  <p className="text-xl sm:text-2xl font-black text-purple-300 mt-1 font-mono">
                    {groqData?.summary.total_requests_all || 0} ta
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    STT & tahlil so'rovlari
                  </p>
                </div>
              </div>

              {/* Explanatory Notice */}
              <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3.5 text-xs text-emerald-200/90 leading-relaxed flex items-start gap-2.5">
                <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Groq xarajati haqida ma'lumot: </span>
                  Groq Cloud API bepul tarif (Free Tier) asosida ulandi. Undan audio transkripsiya (Whisper Large v3 Turbo) va tezkor sun'iy intellekt tahlili (Qwen 27B) uchun foydalaniladi. XARAJATI: <strong className="text-emerald-300 font-mono">$0.00 / 0 UZS</strong> (mutlaqo bepul). Ushbu kalitlar Gemini bilan aralashtirilmagan va alohida mustaqil zanjir sifatida ishlaydi.
                </div>
              </div>
            </div>
          </div>

          {/* Groq Keys Table Card */}
          <div className="bg-[#12141a] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Faol Groq API Kalitlari Ro'yxati</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    {groqKeys.length} ta
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Har bir Groq kaliti bo'yicha mustaqil limitlar va so'rovlar hisobi
                </p>
              </div>

              <div className="w-full sm:w-64">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
                  <input
                    type="text"
                    value={groqSearchTerm}
                    onChange={(e) => setGroqSearchTerm(e.target.value)}
                    placeholder="Kalitni qidirish..."
                    className="w-full pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-white/5 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.02] text-gray-400 font-semibold uppercase tracking-wider border-b border-white/10 text-[10px]">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">API Kalit</th>
                    <th className="py-3 px-4">Holati</th>
                    <th className="py-3 px-4">Xarajati</th>
                    <th className="py-3 px-4">Biriktirilgan Modellar</th>
                    <th className="py-3 px-4">Rasmiy Limitlar</th>
                    <th className="py-3 px-4 text-center">So'rovlar / 429</th>
                    <th className="py-3 px-4 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {groqKeys.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500 text-xs">
                        Groq kalitlari topilmadi
                      </td>
                    </tr>
                  ) : (
                    groqKeys.map((k, idx) => (
                      <tr key={k.key_masked} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-4 font-mono text-gray-500">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-emerald-300">{k.key_masked}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                              GROQ LPU
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {k.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Faol</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-bold"
                              title={k.cooldown_reason}
                            >
                              <Clock className="w-3 h-3" />
                              <span>{k.remaining_human}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            $0.00 <span className="text-[10px] text-gray-400 font-normal">(0 UZS)</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            <div className="font-mono text-[11px] text-gray-200">whisper-large-v3-turbo (STT)</div>
                            <div className="font-mono text-[10px] text-gray-400">qwen/qwen3.8-27b (LLM)</div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-300 font-mono text-[11px]">{k.limits.label}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-[11px]">
                          <span className="text-emerald-400">{k.success_count}</span>
                          <span className="text-gray-500"> / </span>
                          <span className={k.rate_limit_count > 0 ? 'text-amber-400 font-bold' : 'text-gray-500'}>
                            {k.rate_limit_count}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {k.status === 'cooldown' && (
                            <button
                              onClick={() => handleResetGroqCooldown(k.key_masked)}
                              disabled={resettingKey === k.key_masked}
                              className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold transition disabled:opacity-50"
                            >
                              {resettingKey === k.key_masked ? 'Ochilmoqda...' : 'Ochish ⚡️'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 💎 TAB A: GEMINI DEDICATED PANEL (ARALASHTIRILMAGAN)           */}
      {/* ============================================================== */}
      {providerTab === 'gemini' && (
        <div className="space-y-6">
          {/* 💎 1. PULLIK KALIT ALOHIDA BLOK (SPECIAL DEDICATED SECTION) */}
          <div className="bg-gradient-to-br from-amber-500/[0.08] via-[#151720] to-amber-950/[0.05] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2.5 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-inner">
                    💎
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                        Pullik (Balansli) Gemini API Kaliti
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        BALANSLI ENGINE
                      </span>
                    </div>
                    <p className="text-xs text-amber-200/70 font-mono mt-0.5">
                      Kalit: <span className="text-white font-bold">{paidKey?.key_masked || 'AQ.Ab8...WaETg'}</span> • Faqat Standard/Pro obunachilar va sotib olingan daqiqalar uchun
                    </p>
                  </div>
                </div>

                {/* Admin Key Preference Switcher */}
                <div className="bg-black/40 border border-white/10 rounded-xl p-1.5 flex items-center gap-1 self-start sm:self-auto">
                  <span className="text-[11px] font-bold text-gray-400 px-2">Admin uchun:</span>
                  <button
                    onClick={() => handleModeSwitch('free')}
                    disabled={switchingMode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      data?.admin_mode === 'free'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>Bepul Kalitlar</span>
                  </button>
                  <button
                    onClick={() => handleModeSwitch('paid')}
                    disabled={switchingMode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      data?.admin_mode === 'paid'
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/30'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>Pullik Kalit</span>
                  </button>
                </div>
              </div>

              {/* Balance & Cost Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-black/30 border border-white/10 rounded-xl p-3.5 relative group">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Boshlang'ich Kiritilgan</p>
                    <button
                      onClick={() => {
                        setNewBalance(String(paidKey?.initial_balance_usd || 30.0))
                        setEditingBalance(true)
                      }}
                      className="opacity-60 hover:opacity-100 p-1 hover:bg-white/10 rounded text-gray-300 transition"
                      title="Balansni tahrirlash"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1 font-mono">
                    ${paidKey?.initial_balance_usd ? paidKey.initial_balance_usd.toFixed(2) : '30.00'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    {paidKey?.initial_balance_usd ? (paidKey.initial_balance_usd * 12850).toLocaleString() : '385,500'} UZS
                  </p>
                </div>

                <div className="bg-black/30 border border-emerald-500/20 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Haqiqiy Qoldiq Balans</p>
                  <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 font-mono">
                    ${paidKey?.remaining_balance_usd !== undefined ? paidKey.remaining_balance_usd.toFixed(2) : '30.00'}
                  </p>
                  <p className="text-[10px] text-emerald-200/80 mt-0.5 font-mono">
                    {paidKey?.remaining_balance_uzs ? paidKey.remaining_balance_uzs.toLocaleString() : '385,500'} UZS
                  </p>
                </div>

                <div className="bg-black/30 border border-white/10 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Sarflangan Xarajat</p>
                  <p className="text-xl sm:text-2xl font-black text-amber-300 mt-1 font-mono">
                    ${paidKey?.total_cost_usd !== undefined ? paidKey.total_cost_usd.toFixed(4) : '0.0000'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    {paidKey?.total_cost_uzs ? paidKey.total_cost_uzs.toLocaleString() : '0'} UZS sarflandi
                  </p>
                </div>

                <div className="bg-black/30 border border-white/10 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Bajarilgan Videolar</p>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1 font-mono">
                    {paidKey?.total_jobs || 0} ta
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    Davomiyligi: {paidKey?.total_duration_formatted || '0 son'}
                  </p>
                </div>
              </div>

              {/* Balance edit form */}
              {editingBalance && (
                <div className="p-4 bg-black/60 border border-amber-500/40 rounded-xl flex flex-col sm:flex-row items-center gap-3">
                  <span className="text-xs text-amber-300 font-semibold">Yangi boshlang'ich balans ($):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    className="px-3 py-1.5 bg-black/50 border border-white/20 rounded-lg text-sm text-white font-mono w-32 focus:outline-none focus:border-amber-400"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveBalance}
                      disabled={savingBalance}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-lg transition disabled:opacity-50"
                    >
                      {savingBalance ? 'Saqlanmoqda...' : 'Saqlash'}
                    </button>
                    <button
                      onClick={() => setEditingBalance(false)}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition"
                    >
                      Bekor qilish
                    </button>
                  </div>
                </div>
              )}

              {/* Informative explanation note */}
              <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-3.5 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Google API arxitekturasi va balans hisobi: </span>
                  Google AI Studio faqat AI inferensiya so'rovlari uchun mo'ljallangan va xavfsizlik nuqtai nazaridan bank kartasi/balans ma'lumotlarini ochiq API orqali bermaydi. Shuning uchun GapirAI tizimi Google'ning rasmiy narxlari ($0.002/min audio/matn) asosida har bir so'rovni 1 cent aniqlikda hisoblab boradi.
                </div>
              </div>
            </div>
          </div>

          {/* 💎 2. BEPUL KALITLAR HOVUZI (FREE POOL SECTION) */}
          <div className="bg-[#12141a] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Bepul Gemini Kalitlar Hovuzi</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                      {freeKeys.length} ta
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Bepul foydalanuvchilar va 10 daqiqagacha bo'lgan sinov videolari uchun avtomatik rotatsiya
                </p>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Kalitni qidirish..."
                    className="w-full sm:w-48 pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      statusFilter === 'ALL' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Barchasi
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                      statusFilter === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : 'text-gray-400 hover:text-emerald-400'
                    }`}
                  >
                    Faol
                  </button>
                  <button
                    onClick={() => setStatusFilter('COOLDOWN')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                      statusFilter === 'COOLDOWN' ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400 hover:text-amber-400'
                    }`}
                  >
                    Cooldown
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-white/5 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.02] text-gray-400 font-semibold uppercase tracking-wider border-b border-white/10 text-[10px]">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">API Kalit</th>
                    <th className="py-3 px-4">Holat</th>
                    <th className="py-3 px-4">Rasmiy Limitlar</th>
                    <th className="py-3 px-4 text-center">Success Videolar</th>
                    <th className="py-3 px-4 text-center">Davomiylik</th>
                    <th className="py-3 px-4 text-right">Tannarx (Xarajat)</th>
                    <th className="py-3 px-4 text-center">So'rovlar / 429</th>
                    <th className="py-3 px-4 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {freeKeys.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-500 text-xs">
                        Kalitlar topilmadi
                      </td>
                    </tr>
                  ) : (
                    freeKeys.map((k, idx) => (
                      <tr key={k.key_masked} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-4 font-mono text-gray-500">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-gray-200">{k.key_masked}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
                              BEPUL
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {k.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Faol</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-bold"
                              title={k.cooldown_reason}
                            >
                              <Clock className="w-3 h-3" />
                              <span>{k.remaining_human}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-300 font-mono text-[11px]">{k.limits.label}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono font-bold text-white">{k.total_jobs} ta</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono text-gray-300">{k.total_duration_formatted}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-bold text-emerald-400">
                            {k.total_cost_uzs.toLocaleString()} <span className="text-[9px] text-gray-400 font-normal">UZS</span>
                          </div>
                          <div className="font-mono text-[10px] text-gray-400">
                            ${k.total_cost_usd} USD
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-[11px]">
                          <span className="text-emerald-400">{k.success_count}</span>
                          <span className="text-gray-500"> / </span>
                          <span className={k.rate_limit_count > 0 ? 'text-amber-400 font-bold' : 'text-gray-500'}>
                            {k.rate_limit_count}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {k.status === 'cooldown' && (
                            <button
                              onClick={() => handleResetCooldown(k.key_masked)}
                              disabled={resettingKey === k.key_masked}
                              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold transition disabled:opacity-50"
                            >
                              {resettingKey === k.key_masked ? 'Ochilmoqda...' : 'Ochish ⚡️'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
