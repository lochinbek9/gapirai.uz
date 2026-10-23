'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Users, RefreshCw, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ActiveUsersPeriod, ActiveUsersReport, apiAdminActiveUsers } from '@/lib/admin'
import { getToken } from '@/lib/auth'

const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek']
const PERIODS: { id: ActiveUsersPeriod; label: string }[] = [
  { id: '7d', label: '7 kun' },
  { id: '30d', label: '30 kun' },
  { id: '90d', label: '90 kun' },
  { id: '12m', label: '12 oy' },
]
const COLOR_RETURNING = '#3987e5'
const COLOR_NEW = '#10b981'

function formatBucket(bucket: string, long = false) {
  const p = bucket.split('-').map(Number)
  if (p.length === 2) return `${MONTHS[p[1] - 1]} ${long ? p[0] : String(p[0]).slice(2)}`
  return long ? `${p[2]}-${MONTHS[p[1] - 1]} ${p[0]}` : `${p[2]}-${MONTHS[p[1] - 1]}`
}

/** Shkala uchun "chiroyli" qadam: 1, 2, 5 x 10^k -- 4 ta oraliq. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 4) return { top: 4, ticks: [0, 1, 2, 3, 4] }
  const raw = max / 4
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const top = step * Math.ceil(max / step)
  const ticks = []
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v))
  return { top, ticks }
}

function StatCard({
  label,
  value,
  compareTo,
  compareLabel,
  hint,
}: {
  label: string
  value: number
  compareTo?: number
  compareLabel?: string
  hint?: string
}) {
  const diff = compareTo === undefined ? null : value - compareTo
  const pct = diff !== null && compareTo ? Math.round((diff / compareTo) * 100) : null
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-extrabold text-white mt-1 tabular-nums">{value.toLocaleString()}</div>
      {diff !== null ? (
        <div
          className={`text-[11px] mt-1 flex items-center gap-1 font-semibold ${
            diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-gray-500'
          }`}
        >
          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          <span>
            {diff > 0 ? '+' : ''}
            {diff.toLocaleString()}
            {pct !== null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''} {compareLabel}
          </span>
        </div>
      ) : (
        hint && <div className="text-[11px] mt-1 text-gray-500">{hint}</div>
      )}
    </div>
  )
}

function ActiveUsersChart({ series, monthly }: { series: ActiveUsersReport['series']; monthly: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  // SVG haqiqiy kenglikda chiziladi (viewBox = piksel) -- aks holda telefonda
  // butun grafik kichraytirilib, shkala va sanalar o'qib bo'lmas darajada mayda bo'lardi.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(Math.max(260, Math.round(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const height = 220
  const padLeft = 40
  const padRight = 8
  const padTop = 10
  const padBottom = 24
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom
  const n = series.length
  const max = Math.max(0, ...series.map((s) => s.active))
  const { top, ticks } = niceScale(max)
  const slot = n > 0 ? plotW / n : plotW
  const barW = Math.max(2, Math.min(28, slot * 0.7))
  const y = (v: number) => padTop + plotH - (v / top) * plotH
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(plotW / 70))))
  const hp = hover !== null ? series[hover] : null

  return (
    <div className="relative" ref={wrapRef}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block max-w-full" onMouseLeave={() => setHover(null)}>
        {/* Shkala: gorizontal chiziqlar va qiymatlar */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padLeft} x2={width - padRight} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#383835' : '#2c2c2a'} strokeWidth={1} />
            <text x={padLeft - 6} y={y(t) + 3} fontSize={10} fill="#898781" textAnchor="end">
              {t.toLocaleString()}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const x = padLeft + i * slot + (slot - barW) / 2
          const isHover = hover === i
          return (
            <g key={s.date} opacity={hover === null || isHover ? 1 : 0.55}>
              {s.returning > 0 && (
                <rect x={x} y={y(s.returning)} width={barW} height={y(0) - y(s.returning)} fill={COLOR_RETURNING} rx={1.5} />
              )}
              {s.new > 0 && (
                <rect x={x} y={y(s.active)} width={barW} height={y(s.returning) - y(s.active)} fill={COLOR_NEW} rx={1.5} />
              )}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={height - 8} fontSize={9} fill="#898781" textAnchor="middle">
                  {formatBucket(s.date)}
                </text>
              )}
              <rect
                x={padLeft + i * slot}
                y={padTop}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            </g>
          )
        })}
      </svg>
      {hp && hover !== null && (
        <div
          className="absolute top-0 bg-black/85 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] pointer-events-none whitespace-nowrap z-10"
          style={{
            left: `${((padLeft + hover * slot + slot / 2) / width) * 100}%`,
            transform: `translate(${hover > n * 0.75 ? '-100%' : hover < n * 0.25 ? '0' : '-50%'}, 0)`,
          }}
        >
          <div className="text-gray-400 mb-0.5">{formatBucket(hp.date, true)}{monthly ? ' (oy)' : ''}</div>
          <div className="text-white font-bold">Jami kirgan: {hp.active.toLocaleString()}</div>
          <div style={{ color: COLOR_NEW }}>Yangi: {hp.new.toLocaleString()}</div>
          <div style={{ color: COLOR_RETURNING }}>Qaytgan: {hp.returning.toLocaleString()}</div>
        </div>
      )}
    </div>
  )
}

export default function AdminActiveUsersPanel({ includeInternal = false }: { includeInternal?: boolean }) {
  const [period, setPeriod] = useState<ActiveUsersPeriod>('30d')
  const [data, setData] = useState<ActiveUsersReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      setData(await apiAdminActiveUsers(token, period, includeInternal))
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Faol foydalanuvchilar statistikasini yuklab bo'lmadi")
    } finally {
      setLoading(false)
    }
  }, [period, includeInternal])

  useEffect(() => {
    load()
  }, [load])

  const s = data?.summary
  const periodTotal = useMemo(() => {
    if (!data) return null
    const sum = (k: 'active' | 'new') => data.series.reduce((a, x) => a + x[k], 0)
    return { active: sum('active'), new: sum('new') }
  }, [data])

  return (
    <section className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            Saytga kirgan foydalanuvchilar
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Toshkent vaqti bo&apos;yicha · faqat ro&apos;yxatdan o&apos;tib, tizimga kirganlar
            {data ? ` · ma'lumot ${formatBucket(data.data_since, true)} dan` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="self-start sm:self-auto p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition disabled:opacity-50"
          title="Yangilash"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!data && loading && (
        <div className="flex items-center justify-center py-10 text-gray-400 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> Yuklanmoqda...
        </div>
      )}

      {s && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Bugun" value={s.today} compareTo={s.yesterday} compareLabel="kechaga nisbatan" />
            <StatCard label="Kecha" value={s.yesterday} hint={`Oxirgi 7 kun: ${s.last_7d.toLocaleString()}`} />
            <StatCard
              label="Shu oy"
              value={s.this_month}
              compareTo={s.prev_month_same_period}
              compareLabel="o'tgan oyning shu davriga"
            />
            <StatCard label="Jami" value={s.total} hint={`O'tgan oy: ${s.prev_month.toLocaleString()} · 30 kun: ${s.last_30d.toLocaleString()}`} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      period === p.id ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_RETURNING }} /> Qaytgan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_NEW }} /> Yangi (shu kuni ro&apos;yxatdan o&apos;tgan)
                </span>
              </div>
            </div>
            <ActiveUsersChart series={data.series} monthly={data.period === '12m'} />
            {periodTotal && (
              <p className="text-[11px] text-gray-500">
                {data.period === '12m' ? 'Oylik' : 'Kunlik'} qiymatlar yig&apos;indisi: {periodTotal.active.toLocaleString()} kirish
                (shundan yangi {periodTotal.new.toLocaleString()}). Bitta foydalanuvchi bir necha kun kirsa, har kuni alohida sanaladi.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
