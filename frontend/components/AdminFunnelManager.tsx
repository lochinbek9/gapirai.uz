'use client'

import { useState, useEffect } from 'react'
import {
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Users,
  UserCheck,
  Video,
  CheckCircle2,
  Zap,
  CreditCard,
  Award,
  Wallet,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowRight,
  Filter,
} from 'lucide-react'
import {
  FunnelStatsResponse,
  apiAdminFunnel,
  FunnelStageItem,
  FunnelRecentConversion,
} from '@/lib/admin'

const STAGE_ICONS: Record<string, any> = {
  UserPlus: Users,
  UserCheck: UserCheck,
  Video: Video,
  CheckCircle2: CheckCircle2,
  Zap: Zap,
  CreditCard: CreditCard,
  Award: Award,
}

export default function AdminFunnelManager({ token }: { token: string }) {
  const [data, setData] = useState<FunnelStatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<number>(30)
  const [isRecentTableOpen, setIsRecentTableOpen] = useState(false)

  const loadFunnel = async (days: number = selectedDays) => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiAdminFunnel(token, days, false)
      setData(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Voronka ma'lumotlarini yuklab bo'lmadi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadFunnel(selectedDays)
  }, [token, selectedDays])

  const getDaysLabel = (days: number) => {
    if (days === 1) return 'Bugun'
    if (days === 7) return "So'nggi 7 kun"
    if (days === 14) return "So'nggi 14 kun"
    if (days === 30) return "So'nggi 30 kun"
    if (days === 90) return "So'nggi 3 oy"
    if (days === 0) return 'Barchasi (Loyiha boshidan)'
    return `${days} kun`
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
              Ro'yxatdan To'lovgacha Konversiya Voronkasi
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-medium">
                Funnel Analytics
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Foydalanuvchilarning ro'yxatdan o'tishidan boshlab muvaffaqiyatli to'lovgacha bo'lgan to'liq yo'li
            </p>
          </div>
        </div>

        {/* Filtr va Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-black/20 border border-white/10 rounded-xl p-0.5 text-xs">
            {[1, 7, 14, 30, 90, 0].map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDays(d)}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition ${
                  selectedDays === d
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {d === 1 ? 'Bugun' : d === 0 ? 'Barchasi' : `${d}k`}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadFunnel(selectedDays)}
            disabled={loading}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 transition"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Asosiy KPI Kartalari */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-black/20 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Ro'yxatdan o'tgan</span>
              <Users className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-xl sm:text-2xl font-semibold text-white">
              {data.stages[0]?.count ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {getDaysLabel(selectedDays)} davrida
            </div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>To'lov qilganlar</span>
              <Award className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-semibold text-emerald-400">
              {data.stages[data.stages.length - 1]?.count ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Haqiqiy xaridorlar
            </div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Umumiy Konversiya</span>
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl sm:text-2xl font-semibold text-amber-400">
              {data.metrics.overall_conversion_pct}%
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Ro'yxatdan $\rightarrow$ To'lovgacha
            </div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Jami Tushum</span>
              <Wallet className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl sm:text-2xl font-semibold text-white truncate">
              {data.metrics.total_revenue_uzs.toLocaleString('uz-UZ')} UZS
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {data.metrics.approved_transactions_count} ta to'lov (o'rt. chek: {data.metrics.average_order_value_uzs.toLocaleString('uz-UZ')} UZS)
            </div>
          </div>
        </div>
      )}

      {/* Vizual Voronka Grafigi (Interactive Visual Funnel) */}
      {data && (
        <div className="space-y-3 bg-black/20 border border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-semibold text-white">Voronka bosqichlari (Funnel Steps)</h3>
            <span className="text-xs text-slate-400">
              {data.timeframe.since_date} — {data.timeframe.today}
            </span>
          </div>

          <div className="space-y-3 pt-2">
            {data.stages.map((stage: FunnelStageItem, index: number) => {
              const IconComp = STAGE_ICONS[stage.icon] || Users
              // Agar 0 bo'lsa bo'yalmasligi kerak (0% bo'sh qoladi)
              const widthPct = stage.pct_of_top > 0 ? Math.max(stage.pct_of_top, 1.5) : 0

              return (
                <div key={stage.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-white/10 text-xs font-semibold flex items-center justify-center text-slate-400">
                        {index + 1}
                      </span>
                      <IconComp className="w-4 h-4 text-violet-400" />
                      <span className="font-medium text-white">{stage.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-white">{stage.count.toLocaleString()}</span>
                      <span className="text-slate-400 font-mono w-14 text-right">
                        {stage.pct_of_top}%
                      </span>
                    </div>
                  </div>

                  {/* Bar: 0% bo'lsa bo'yalmaydi */}
                  <div className="h-3.5 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                    {widthPct > 0 ? (
                      <div
                        className="h-full rounded-full bg-violet-600 transition-all duration-700 shadow-sm"
                        style={{ width: `${widthPct}%` }}
                      />
                    ) : (
                      <div className="h-full w-0" />
                    )}
                  </div>

                  {/* Connector between steps: markazlashtirilgan chiroyli ko'rsatkich, sonlarning tepasida turib xalaqit bermaydi */}
                  {index < data.stages.length - 1 && (
                    <div className="flex items-center justify-center gap-2.5 py-1 text-xs">
                      <div className="h-px bg-white/5 flex-1" />
                      <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 px-3 py-0.5 rounded-full font-mono text-xs">
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                          <ArrowRight className="w-2.5 h-2.5" />
                          {data.stages[index + 1].conversion_from_prev}% o'tish
                        </span>
                        {data.stages[index + 1].drop_pct > 0 && (
                          <>
                            <span className="text-gray-600">•</span>
                            <span className="text-rose-400 font-semibold">
                              -{data.stages[index + 1].drop_pct}% uzilish
                            </span>
                          </>
                        )}
                      </div>
                      <div className="h-px bg-white/5 flex-1" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Avtomatik Tahlil & Xulosalar (Insights) */}
      {data && data.insights && data.insights.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            Tizimning Avtomatik Xulosalari va Tavsiyalari
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.insights.map((ins, i) => (
              <div
                key={i}
                className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                  ins.type === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    : ins.type === 'caution'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                    : ins.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  {ins.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  {ins.type === 'caution' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  {ins.type === 'success' && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {ins.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  <span>{ins.title}</span>
                </div>
                <p className="text-slate-300 leading-relaxed">{ins.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moliyaviy Taqsimot: Mahsulotlar & Provayderlar */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Obunalar va Daqiqa Paketlari */}
          <div className="bg-black/20 border border-white/10 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400">
              Xarid turlari bo'yicha tushum
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                  <span>Daqiqa paketlari (Minute packs)</span>
                </div>
                <span className="font-semibold text-white">
                  {data.metrics.minute_packs_revenue_uzs.toLocaleString('uz-UZ')} UZS
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                  <span>Obuna tariflari (Subscriptions)</span>
                </div>
                <span className="font-semibold text-white">
                  {data.metrics.subscription_revenue_uzs.toLocaleString('uz-UZ')} UZS
                </span>
              </div>
            </div>
          </div>

          {/* To'lov tizimlari bo'yicha */}
          <div className="bg-black/20 border border-white/10 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400">
              To'lov tizimlari taqsimoti
            </h3>
            {data.providers && data.providers.length > 0 ? (
              <div className="space-y-2">
                {data.providers.map((p) => (
                  <div key={p.provider} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="font-semibold text-white">{p.provider}</span>
                      <span className="text-slate-500">({p.count} ta)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{p.total_uzs.toLocaleString('uz-UZ')} UZS</span>
                      <span className="text-slate-400 font-mono text-xs">({p.pct}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-2">Tanlangan davrda to'lovlar mavjud emas</div>
            )}
          </div>
        </div>
      )}

      {/* Oxirgi to'lovlar (Recent Conversions Table) */}
      {data && (
        <div className="bg-black/20 border border-white/10 rounded-xl overflow-hidden">
          <button
            onClick={() => setIsRecentTableOpen(!isRecentTableOpen)}
            className="w-full flex items-center justify-between p-4 text-xs font-semibold text-slate-300 hover:text-white transition"
          >
            <span>So'nggi muvaffaqiyatli xaridlar ({data.recent_conversions?.length || 0} ta)</span>
            {isRecentTableOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isRecentTableOpen && (
            <div className="border-t border-white/10 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Mijoz</th>
                    <th className="py-2.5 px-4 font-medium">Xarid</th>
                    <th className="py-2.5 px-4 font-medium">Summa</th>
                    <th className="py-2.5 px-4 font-medium">Tizim</th>
                    <th className="py-2.5 px-4 font-medium">Sana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {data.recent_conversions && data.recent_conversions.length > 0 ? (
                    data.recent_conversions.map((rc: FunnelRecentConversion) => (
                      <tr key={rc.payment_id} className="hover:bg-white/5 transition">
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-white">{rc.user_name}</div>
                          <div className="text-xs text-slate-500">{rc.user_email || rc.user_phone || 'ID: ' + rc.user_id.slice(0, 8)}</div>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-violet-300">{rc.item_label}</td>
                        <td className="py-2.5 px-4 font-semibold text-white">{rc.amount_uzs.toLocaleString('uz-UZ')} UZS</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-semibold text-slate-300">
                            {rc.provider}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">{rc.paid_at || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        To'lovlar topilmadi
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
