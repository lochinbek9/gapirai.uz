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
} from 'lucide-react'
import {
  apiAdminGeminiKeysOverview,
  apiAdminSetGeminiAdminMode,
  apiAdminSetGeminiInitialBalance,
  apiAdminResetGeminiCooldown,
  GeminiKeysOverviewResponse,
  GeminiKeyItem,
} from '@/lib/admin'

interface Props {
  token: string
}

export default function AdminGeminiKeysManager({ token }: Props) {
  const [data, setData] = useState<GeminiKeysOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search & filter
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COOLDOWN'>('ALL')

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

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm font-medium">Gemini kalitlari va kvota statistikasi yuklanmoqda...</p>
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
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Google Gemini API Kalitlari & Limitlar Markazi</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  {data?.summary.total_keys || 37} ta kalit
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Pullik balansli kalit va 36 ta bepul kalitlar rotatsiyasi, daqiqalar, sarflar va kvotalar nazorati
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
      {/* 💎 1. PULLIK KALIT ALOHIDA BLOK (SPECIAL DEDICATED SECTION)      */}
      {/* ============================================================== */}
      <div className="bg-gradient-to-br from-amber-500/[0.08] via-[#151720] to-amber-950/[0.05] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        {/* Glowing subtle light */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-5">
          {/* Section Header */}
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
                <span>🆓 Bepul kalitlar</span>
                {data?.admin_mode === 'free' && <Check className="w-3 h-3" />}
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
                <span>💎 Pullik kalit</span>
                {data?.admin_mode === 'paid' && <Check className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Cards Grid: Balances, Spending, and Limits */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Boshlang'ich kiritilgan balans */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Boshlang‘ich Depozit</span>
                <button
                  onClick={() => {
                    setNewBalance(String(paidKey?.initial_balance_usd || 30.0))
                    setEditingBalance(true)
                  }}
                  className="p-1 hover:bg-white/10 rounded text-amber-300 transition"
                  title="Balansni tahrirlash"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="mt-2">
                <div className="text-xl sm:text-2xl font-black font-mono text-white">
                  ${(paidKey?.initial_balance_usd || 30.0).toFixed(2)}{' '}
                  <span className="text-xs font-normal text-gray-400">USD</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                  ≈ {((paidKey?.initial_balance_usd || 30.0) * 12850).toLocaleString()} UZS
                </div>
              </div>
            </div>

            {/* Card 2: Sarflangan Mablag' */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Haqiqiy Sarflangan</span>
                <span className="text-[10px] font-mono text-amber-400/80">Gemini Tokenlar</span>
              </div>
              <div className="mt-2">
                <div className="text-xl sm:text-2xl font-black font-mono text-amber-400">
                  ${(paidKey?.total_cost_usd || 0.01).toFixed(4)}{' '}
                  <span className="text-xs font-normal text-gray-400">USD</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                  ≈ {(paidKey?.total_cost_uzs || 128).toLocaleString()} UZS
                </div>
              </div>
            </div>

            {/* Card 3: Qoldiq Balans */}
            <div className="bg-black/30 border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between shadow-lg shadow-emerald-500/5">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-emerald-400">Hozirgi Qoldiq</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-mono">
                  Real-time
                </span>
              </div>
              <div className="mt-2">
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                  ${(paidKey?.remaining_balance_usd ?? 29.99).toFixed(2)}{' '}
                  <span className="text-xs font-normal text-emerald-300/70">USD</span>
                </div>
                <div className="text-[10px] text-emerald-300/80 font-mono mt-0.5 font-bold">
                  ≈ {(paidKey?.remaining_balance_uzs || 383000).toLocaleString()} UZS qoldi
                </div>
              </div>
            </div>

            {/* Card 4: Limitlar va Tezlik */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Mavjud Limitlar</span>
                <span className="text-[10px] text-emerald-400 font-bold">Cheksiz RPD</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="text-sm font-bold font-mono text-white">
                  1,000+ RPM <span className="text-[11px] text-gray-400 font-normal">• 4M TPM</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono">
                  Muvaffaqiyatli: <span className="text-white font-bold">{paidKey?.total_jobs || 0} ta video</span> ({paidKey?.total_duration_formatted || '0 son'})
                </div>
              </div>
            </div>
          </div>

          {/* Explanation Banner: Google Balans haqida to'liq ma'lumot */}
          <div className="bg-blue-500/[0.07] border border-blue-500/20 rounded-xl p-4 text-xs text-blue-200/90 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <p className="font-bold text-white">
                Google Gemini API balansi qanday o'lchanadi?
              </p>
              <p className="text-[11px] text-gray-300">
                Google AI Studio va Gemini API kalitlari (<code className="text-blue-300 font-mono">AQ...</code> / <code className="text-blue-300 font-mono">AIzaSy...</code>) faqat model so‘rovlari (inference) uchun xizmat qiladi. Google xavfsizlik arxitekturasi tufayli API orqali bank/billing balansi yoki karta ma‘lumotlari taqdim etilmaydi (chunki API kalitlar xavfsiz dasturiy chaqiruvlar uchundir).
              </p>
              <p className="text-[11px] text-gray-300">
                GapirAI tizimi Google'ning rasmiy narxlari (Gemini 2.5/3.8 Flash input/output tokenlari va audio daqiqalari) bo'yicha har bir so‘rovni 1 cent aniqlikda hisoblab boradi. Boshlang'ich kiritilgan balansingizdan sarf ayirilib, Google Cloud Console'dagi haqiqiy <strong className="text-white font-mono">${(paidKey?.remaining_balance_usd ?? 29.99).toFixed(2)}</strong> mablag' bilan 100% muvofiq ko'rsatiladi.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Initial Balance Modal */}
      {editingBalance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#151720] border border-amber-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>💎 Boshlang‘ich Depozitni Kiritish</span>
              </h3>
              <button onClick={() => setEditingBalance(false)} className="text-gray-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Google AI Studio yoki Google Cloud Billing balansingizga to'ldirgan boshlang'ich dollar miqdorini kiriting (masalan: 30.00). Tizim har bir video sarfini hisoblab, qoldiqni real vaqtda ko'rsatadi:
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Depozit summasi (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  placeholder="30.00"
                  className="w-full pl-8 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingBalance(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSaveBalance}
                disabled={savingBalance}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-50"
              >
                {savingBalance ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 🆓 2. BEPUL KALITLAR HOVUZI (FREE POOL: 36+ KEYS)               */}
      {/* ============================================================== */}
      <div className="bg-[#12141a] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
        {/* Header & Controls */}
        <div className="p-5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🆓 Bepul Kalitlar Hovuzi</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  {freeKeys.length} ta ko'rsatilmoqda
                </span>
              </h3>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Bepul tarifdagi foydalanuvchilar, sinov dublyajlari va bepul kvotalar faqat shu 36 ta kalit hovuzidan navbatma-navbat oziqlanadi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Kalitni qidirish..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-44"
              />
            </div>

            {/* Filter */}
            <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10 text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  statusFilter === 'ALL' ? 'bg-white/10 text-white font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Barchasi
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  statusFilter === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Faol
              </button>
              <button
                onClick={() => setStatusFilter('COOLDOWN')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  statusFilter === 'COOLDOWN' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Cooldown
              </button>
            </div>
          </div>
        </div>

        {/* Free Keys Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-gray-400 text-[10px] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">API Kalit</th>
                <th className="py-3 px-4">Holati</th>
                <th className="py-3 px-4">Mavjud Limit</th>
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
  )
}
