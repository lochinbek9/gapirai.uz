'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Send,
  Mail,
  MessageSquare,
  Globe,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Info,
  ShieldCheck,
} from 'lucide-react'
import {
  BroadcastCampaignItem,
  BroadcastAudience,
  apiGetBroadcastAudience,
  apiSendBroadcastTest,
  apiCreateBroadcast,
  apiListBroadcasts,
} from '@/lib/admin'

interface Props {
  token: string
}

export default function AdminBroadcastManager({ token }: Props) {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create')

  // Form states
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState<'both' | 'telegram' | 'email'>('both')
  const [targetFilter, setTargetFilter] = useState<'all' | 'telegram_users' | 'email_users' | 'paid_users' | 'free_users'>('all')
  const [buttonText, setButtonText] = useState('')
  const [buttonUrl, setButtonUrl] = useState('')
  const [showButton, setShowButton] = useState(false)

  // Audience preview state
  const [audience, setAudience] = useState<BroadcastAudience | null>(null)
  const [loadingAudience, setLoadingAudience] = useState(false)

  // Test send state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Submit broadcast state
  const [sending, setSending] = useState(false)
  const [confirmModal, setConfirmModal] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  // History state
  const [campaigns, setCampaigns] = useState<BroadcastCampaignItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Fetch audience estimate
  const fetchAudience = useCallback(async () => {
    if (!token) return
    setLoadingAudience(true)
    try {
      const data = await apiGetBroadcastAudience(token, channel, targetFilter)
      setAudience(data)
    } catch {
      // ignore
    } finally {
      setLoadingAudience(false)
    }
  }, [token, channel, targetFilter])

  // Fetch campaigns history
  const fetchCampaigns = useCallback(async () => {
    if (!token) return
    setLoadingHistory(true)
    try {
      const data = await apiListBroadcasts(token, 20)
      setCampaigns(data.campaigns)
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false)
    }
  }, [token])

  useEffect(() => {
    fetchAudience()
  }, [fetchAudience])

  useEffect(() => {
    if (activeTab === 'history') {
      fetchCampaigns()
    }
  }, [activeTab, fetchCampaigns])

  // Auto-refresh history if any campaign is currently sending
  useEffect(() => {
    if (activeTab !== 'history') return
    const hasActive = campaigns.some((c) => c.status === 'sending' || c.status === 'pending')
    if (!hasActive) return

    const interval = setInterval(() => {
      fetchCampaigns()
    }, 4000)
    return () => clearInterval(interval)
  }, [activeTab, campaigns, fetchCampaigns])

  // Handle single test send to admin
  const handleTestSend = async () => {
    if (!title.trim() || !message.trim()) {
      setTestResult({ success: false, message: 'Iltimos, sarlavha va xabar matnini kiriting.' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiSendBroadcastTest(token, {
        title: title.trim(),
        message: message.trim(),
        channel,
        button_text: showButton && buttonText.trim() ? buttonText.trim() : undefined,
        button_url: showButton && buttonUrl.trim() ? buttonUrl.trim() : undefined,
      })

      if (res.success) {
        const parts: string[] = []
        if (res.email_sent) parts.push(`Email (${res.target_email || 'admin'})`)
        if (res.telegram_sent) parts.push(`Telegram (${res.target_telegram || 'admin'})`)
        setTestResult({
          success: true,
          message: `Sinov xabari muvaffaqiyatli yetkazildi: ${parts.join(', ')}`,
        })
      } else {
        setTestResult({
          success: false,
          message: res.errors?.join(' ') || 'Sinov xabarini yuborib bo\'lmadi.',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xatolik yuz berdi'
      setTestResult({ success: false, message: msg })
    } finally {
      setTesting(false)
    }
  }

  // Handle launch full broadcast
  const handleStartBroadcast = async () => {
    setConfirmModal(false)
    setSending(true)
    setSendSuccess(null)
    setSendError(null)

    try {
      const res = await apiCreateBroadcast(token, {
        title: title.trim(),
        message: message.trim(),
        channel,
        target_filter: targetFilter,
        button_text: showButton && buttonText.trim() ? buttonText.trim() : undefined,
        button_url: showButton && buttonUrl.trim() ? buttonUrl.trim() : undefined,
      })

      if (res.success) {
        setSendSuccess('Xabarnoma fon rejimida yuborila boshladi! Tarix bo\'limida jarayonni kuzatishingiz mumkin.')
        setTitle('')
        setMessage('')
        setButtonText('')
        setButtonUrl('')
        setShowButton(false)
        setActiveTab('history')
        fetchCampaigns()
      } else {
        setSendError('Xabarnoma yaratishda xatolik yuz berdi.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xatolik yuz berdi'
      setSendError(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Send className="w-4 h-4 text-violet-400" />
            Ommaviy Xabarnoma (Broadcast)
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Barcha yoki tanlangan foydalanuvchilarga Email va Telegram bot orqali xabar yuborish
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 p-1 rounded-xl shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'create'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Yangi xabar
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Yuborilganlar tarixi
            {campaigns.some((c) => c.status === 'sending') && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {sendSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{sendSuccess}</span>
        </div>
      )}

      {sendError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{sendError}</span>
        </div>
      )}

      {activeTab === 'create' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Main Form (8 cols) */}
          <div className="lg:col-span-8 bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            {/* 1. Kanal tanlash */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                1. Yuborish usuli (Kanal)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setChannel('both')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col items-start gap-1 ${
                    channel === 'both'
                      ? 'bg-violet-500/15 border-violet-500 text-white ring-1 ring-violet-500'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 text-violet-400 font-bold text-xs">
                    <Globe className="w-4 h-4" />
                    <span>Ikkalasi</span>
                  </div>
                  <span className="text-[11px] text-gray-400 leading-tight">Email + Telegram Bot</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChannel('email')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col items-start gap-1 ${
                    channel === 'email'
                      ? 'bg-blue-500/15 border-blue-500 text-white ring-1 ring-blue-500'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-xs">
                    <Mail className="w-4 h-4" />
                    <span>Faqat Email</span>
                  </div>
                  <span className="text-[11px] text-gray-400 leading-tight">Resend orqali pochtaga</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChannel('telegram')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col items-start gap-1 ${
                    channel === 'telegram'
                      ? 'bg-sky-500/15 border-sky-500 text-white ring-1 ring-sky-500'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
                    <MessageSquare className="w-4 h-4" />
                    <span>Faqat Bot</span>
                  </div>
                  <span className="text-[11px] text-gray-400 leading-tight">Telegram bot chatiga</span>
                </button>
              </div>
            </div>

            {/* 2. Auditoriya filtri */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                2. Qabul qiluvchilar (Auditoriya)
              </label>
              <select
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value as typeof targetFilter)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition"
              >
                <option value="all">Barcha faol foydalanuvchilar (hammasi)</option>
                <option value="email_users">Faqat Email pochtasi borlar</option>
                <option value="telegram_users">Faqat Telegram boti ulanganlar</option>
                <option value="paid_users">Faqat pullik obunachilar (PREMIUM / PRO)</option>
                <option value="free_users">Faqat bepul (FREE) tarifdagi foydalanuvchilar</option>
              </select>
            </div>

            {/* 3. Xabar mavzusi va matni */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  3. Xabar mavzusi / Sarlavhasi
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Yangi imkoniyat — video fayllarni dublaj qilish qo'shildi! 🚀"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Xabar matni
                  </label>
                  <span className="text-[11px] text-gray-500">{message.length} belgi</span>
                </div>
                <textarea
                  rows={6}
                  placeholder="Xabaringizni bu yerga yozing. Yangiliklar, chegirmalar, aksiyalar yoki foydali ko'rsatmalar..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition resize-y"
                />
              </div>
            </div>

            {/* 4. Tugma / Havola qo'shish */}
            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300 font-semibold mb-2">
                <input
                  type="checkbox"
                  checked={showButton}
                  onChange={(e) => setShowButton(e.target.checked)}
                  className="w-4 h-4 rounded text-violet-600 bg-white/5 border-white/20 focus:ring-0"
                />
                Xabar ostiga havola tugmasi qo'shish (ixtiyoriy)
              </label>

              {showButton && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-black/30 border border-white/10 rounded-xl">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1">Tugma matni</label>
                    <input
                      type="text"
                      placeholder="Saytga o'tish"
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1">Tugma havolasi (URL)</label>
                    <input
                      type="url"
                      placeholder="https://gapirai.uz"
                      value={buttonUrl}
                      onChange={(e) => setButtonUrl(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test result alert */}
            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10">
              <button
                type="button"
                onClick={handleTestSend}
                disabled={testing || !title.trim() || !message.trim()}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
                O'zimga sinov xabari yuborish (Test)
              </button>

              <button
                type="button"
                onClick={() => setConfirmModal(true)}
                disabled={sending || !title.trim() || !message.trim()}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-extrabold shadow-lg shadow-violet-600/25 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Hamma foydalanuvchilarga yuborish
              </button>
            </div>
          </div>

          {/* Right Sidebar: Audience Counter & Live Preview (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Audience Card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  Qamrov (Auditoriya)
                </span>
                <button
                  type="button"
                  onClick={fetchAudience}
                  disabled={loadingAudience}
                  className="text-gray-400 hover:text-white transition"
                  title="Yangilash"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAudience ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingAudience ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  <span>Hisoblanmoqda...</span>
                </div>
              ) : audience ? (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5">
                    <span className="text-xs text-gray-300">Mos kelganlar:</span>
                    <span className="text-sm font-extrabold text-white">{audience.total_matched.toLocaleString()} ta</span>
                  </div>

                  {channel !== 'telegram' && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <span className="text-xs text-blue-300 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        Email qabul qiluvchilar:
                      </span>
                      <span className="text-sm font-extrabold text-blue-200">
                        {audience.email_recipients.toLocaleString()} ta
                      </span>
                    </div>
                  )}

                  {channel !== 'email' && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                      <span className="text-xs text-sky-300 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Telegram qabul qiluvchilar:
                      </span>
                      <span className="text-sm font-extrabold text-sky-200">
                        {audience.telegram_recipients.toLocaleString()} ta
                      </span>
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400 pt-1 leading-normal">
                    Xabarlar oraliq tanaffus bilan fon rejimida navbat asosida xavfsiz yetkaziladi.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Live Preview Card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2.5">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-violet-400" />
                Jonli Ko'rinish (Preview)
              </span>

              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-violet-300">
                    GapirAI<span className="text-white">.uz</span>
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white leading-snug">
                  {title.trim() || 'Xabar sarlavhasi'}
                </h4>
                <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {message.trim() || 'Xabar matni bu yerda ko\'rinadi...'}
                </p>
                {showButton && buttonText.trim() && (
                  <div className="pt-2">
                    <span className="inline-block px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold shadow">
                      {buttonText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Oxirgi yuborilgan kampaniyalar ro'yxati
            </span>
            <button
              onClick={fetchCampaigns}
              disabled={loadingHistory}
              className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              Yangilash
            </button>
          </div>

          {loadingHistory && campaigns.length === 0 ? (
            <div className="py-12 flex justify-center items-center text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
              <span className="text-xs">Tarix yuklanmoqda...</span>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-xs">
              Hali ommaviy xabarnomalar yuborilmagan.
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((camp) => {
                const isRunning = camp.status === 'sending' || camp.status === 'pending'
                return (
                  <div
                    key={camp.id}
                    className="p-4 rounded-xl bg-black/30 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white truncate max-w-md">{camp.title}</span>
                        {camp.status === 'completed' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Yetkazildi
                          </span>
                        )}
                        {isRunning && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            Yuborilmoqda...
                          </span>
                        )}
                        {camp.status === 'failed' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Xatolik
                          </span>
                        )}
                        <span className="text-[11px] text-gray-500 uppercase px-2 py-0.5 rounded bg-white/5">
                          {camp.channel === 'both' ? 'Email + Bot' : camp.channel === 'email' ? 'Faqat Email' : 'Faqat Bot'}
                        </span>
                      </div>

                      <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed">
                        {camp.message}
                      </p>

                      <div className="flex items-center gap-4 text-[11px] text-gray-500 pt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {camp.created_at ? new Date(camp.created_at).toLocaleString('uz-UZ') : ''}
                        </span>
                        <span>Admin: {camp.admin?.name || 'Admin'}</span>
                        {camp.button_url && (
                          <a
                            href={camp.button_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-violet-400 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            {camp.button_text || 'Havola'}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Stats pill on right */}
                    <div className="flex items-center gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Jami qabul qiluvchi:</div>
                        <div className="text-sm font-extrabold text-white">{camp.total_recipients} ta</div>
                      </div>

                      <div className="h-8 w-px bg-white/10 hidden md:block" />

                      <div className="text-right">
                        <div className="text-xs text-emerald-400">Muvaffaqiyatli:</div>
                        <div className="text-sm font-extrabold text-emerald-400">
                          {camp.email_sent + camp.telegram_sent} ta
                        </div>
                      </div>

                      {(camp.email_failed > 0 || camp.telegram_failed > 0) && (
                        <div className="text-right">
                          <div className="text-xs text-rose-400">Yetib bormadi:</div>
                          <div className="text-sm font-extrabold text-rose-400">
                            {camp.email_failed + camp.telegram_failed} ta
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Xabarnomani barchaga yuborishni tasdiqlaysizmi?</h3>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                Ushbu xabar tanlangan kanal bo'yicha{' '}
                <strong className="text-white">
                  {audience ? audience.total_matched.toLocaleString() : 'barcha'}
                </strong>{' '}
                ta foydalanuvchiga fon rejimida yuboriladi.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-xs font-bold text-white truncate">{title}</div>
              <div className="text-[11px] text-gray-400 line-clamp-2">{message}</div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 transition"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleStartBroadcast}
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-bold text-white shadow-lg shadow-violet-600/30 transition flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Ha, yuborishni boshlash
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
