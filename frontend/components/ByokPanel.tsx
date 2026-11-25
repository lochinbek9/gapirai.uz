'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, KeyRound, Trash2 } from 'lucide-react'
import { apiClient } from '@/lib/api'

type Provider = 'gemini' | 'groq' | 'gapi'
type Tier = { free: number; paid: number }
interface Byok { enabled: boolean; providers: Record<Provider, string[]>; tiers: Record<Provider, Tier> }
const BADGE = 'rounded-full px-2 text-xs font-medium'

/** Kalit turi: bepul / pullik. Gapi hozir beta -- kunlik balans bepul beriladi. */
function TierBadges({ tier, note }: { tier: Tier; note: string }) {
  return (
    <>
      {tier.free > 0 && <span className={`${BADGE} bg-emerald-500/10 text-emerald-600`}>Bepul{note} · {tier.free}</span>}
      {tier.paid > 0 && <span className={`${BADGE} bg-amber-500/10 text-amber-600`}>Pullik · {tier.paid}</span>}
    </>
  )
}
interface Spent { chars: number; g: number; stt_minutes: number }
interface Usage {
  gemini: { today: number; month: number } | null
  groq: { today: number; month: number } | null
  gapi: { today: Spent; month: Spent; balance_g: number | null }
}

// gapi.uz "Narxlar" (24.10.2026): ovoz 1000 belgi = 112 so'm = 3,2 g, ya'ni 1 g = 35 so'm
const SOM_PER_G = 35
const som = (g: number) => `${Math.round(g * SOM_PER_G).toLocaleString('ru-RU')} soʻm`

function costLine(usage: Usage, p: Provider, tier: Tier) {
  if (p === 'gapi') {
    const { today, month, balance_g } = usage.gapi
    const left = balance_g === null ? '' : ` · Qoldiq: ${som(balance_g)} (${balance_g} g)`
    const spent = (s: Spent) => `${som(s.g)} (${s.chars} belgi, ${s.stt_minutes} daqiqa)`
    return `Bugun: ${spent(today)} · 30 kun: ${spent(month)}${left}`
  }
  const counts = usage[p]
  return counts ? `Bugun: ${counts.today} soʻrov · 30 kun: ${counts.month} soʻrov ${tier.paid ? '' : ' · Narx: 0'}` : 'Hisob vaqtincha mavjud emas'
}

const NAMES: Record<Provider, string> = { gemini: 'Gemini', groq: 'Groq', gapi: 'Gapi (nutqni tanish va ovoz)' }

/** Oʻz API kalitlaringiz (BYOK). Kalit qiymati serverdan qaytmaydi -- faqat oxirgi 4 belgisi. */
export default function ByokPanel() {
  const [data, setData] = useState<Byok | null>(null)
  const [drafts, setDrafts] = useState<Record<Provider, string>>({ gemini: '', groq: '', gapi: '' })
  const [usage, setUsage] = useState<Usage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { apiClient.get('/api/byok').then((r) => setData(r.data)).catch(() => {}) }, [])

  const loadUsage = () => apiClient.get('/api/byok/usage').then((r) => setUsage(r.data)).catch(() => {})

  const save = async (patch: Partial<Record<Provider, string>> & { enabled?: boolean }) => {
    setBusy(true)
    setError('')
    try {
      setData((await apiClient.put('/api/byok', patch)).data)
      setDrafts((d) => {
        const next = { ...d }
        for (const p of Object.keys(NAMES) as Provider[]) if (p in patch) next[p] = ''
        return next
      })
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Saqlanmadi. Qayta urinib koʻring.')
    }
    setBusy(false)
  }

  if (!data) return null
  const hasKeys = Object.values(data.providers).some((k) => k.length > 0)
  return (
    <details onToggle={(e) => { if (e.currentTarget.open) loadUsage() }} className="group rounded-card border border-ui-rule bg-ui-surface p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ui-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 -rotate-90 text-ui-muted transition-transform group-open:rotate-0" />
        <KeyRound aria-hidden="true" className="h-4 w-4" />Oʻz API kalitlarim
        <span className={`rounded-full px-2 text-xs font-medium ${data.enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-ui-ground text-ui-muted'}`}>{data.enabled ? 'Yoqilgan' : 'Oʻchiq'}</span>
      </summary>
      <div className="mt-3 max-w-lg space-y-3">
        <label className="flex items-center gap-2 text-sm text-ui-ink">
          <input type="checkbox" checked={data.enabled} disabled={busy || !hasKeys} onChange={(e) => save({ enabled: e.target.checked })} />
          Ishlarim oʻz kalitlarim bilan bajarilsin
        </label>
        <p className="text-xs text-ui-muted">Kalit kiritilgan provayderda faqat sizning kalitingiz ishlatiladi. Qolgan xizmatlar tizim sozlamasida qoladi.</p>
        {(Object.keys(NAMES) as Provider[]).map((p) => (
          <form key={p} className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); if (drafts[p].trim()) save({ [p]: drafts[p] }) }}>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ui-ink">
              {NAMES[p]}
              <TierBadges tier={data.tiers[p]} note={p === 'gapi' ? ' (beta)' : ''} />
              <span className="text-xs font-normal text-ui-muted">{data.providers[p].join(', ') || 'kiritilmagan'}</span>
              {data.providers[p].length > 0 && (
                <button type="button" disabled={busy} aria-label={`${NAMES[p]} kalitlarini oʻchirish`} onClick={() => { if (confirm(`${NAMES[p]} kalitlari oʻchirilsinmi?`)) save({ [p]: '' }) }} className="text-ui-muted hover:text-red-500">
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
            {usage && <p className="text-xs text-ui-muted">{costLine(usage, p, data.tiers[p])}</p>}
            {p === 'gapi' && <p className="text-xs text-ui-muted">Rasmiy narx: nutqni tanish 35 soʻm/daqiqa (1 g), ovoz 112 soʻm/1000 belgi (3,2 g). Beta davrida sizdan pul yechilmaydi: toʻlov 0 soʻm.</p>}
            <div className="flex gap-1.5">
              <input type="password" autoComplete="off" aria-label={`${NAMES[p]} API kaliti`} placeholder="Yangi kalit (bir nechta boʻlsa vergul bilan)" value={drafts[p]}
                onChange={(e) => setDrafts({ ...drafts, [p]: e.target.value })} className="w-full rounded-lg border border-ui-rule bg-ui-surface p-2 text-sm text-ui-ink" />
              <button type="submit" disabled={busy || !drafts[p].trim()} className="ui-btn ui-btn-secondary">Saqlash</button>
            </div>
          </form>
        ))}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      </div>
    </details>
  )
}
