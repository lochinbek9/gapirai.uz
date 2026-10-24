'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { Heart, Loader2 } from 'lucide-react'
import PageShell, { PageTitle } from '@/components/PageShell'
import { getDonateOptions, createDonation, DonateOptions } from '@/lib/api'
import UzumAccountCard from '@/components/UzumAccountCard'
import PaynetOrderCard from '@/components/PaynetOrderCard'

const PROVIDERS = ['click', 'payme', 'uzum', 'paynet'] as const
type Provider = (typeof PROVIDERS)[number]
const PROVIDER_LABEL: Record<Provider, string> = { click: 'Click', payme: 'Payme', uzum: 'Uzum', paynet: 'Paynet' }

const FALLBACK: DonateOptions = { presets: [10000, 25000, 50000, 100000], min: 1000, max: 10000000 }

// toLocaleString server va brauzerda turli probel beradi (hydration xatosi) -- qo'lda guruhlaymiz
function formatSom(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
}

export default function DonatePage() {
  const [opts, setOpts] = useState<DonateOptions>(FALLBACK)
  const [amount, setAmount] = useState<number>(FALLBACK.presets[1])
  const [customRaw, setCustomRaw] = useState('')
  const [provider, setProvider] = useState<Provider>('click')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uzumAccount, setUzumAccount] = useState<{ account: number; amount: number; deeplink?: string } | null>(null)
  const [paynetOrder, setPaynetOrder] = useState<{ orderId: string; amount: number } | null>(null)

  useEffect(() => {
    getDonateOptions().then(setOpts).catch(() => {})
  }, [])

  const custom = customRaw ? parseInt(customRaw.replace(/\D/g, ''), 10) || 0 : 0
  const effectiveAmount = custom > 0 ? custom : amount
  const valid = effectiveAmount >= opts.min && effectiveAmount <= opts.max

  async function submit() {
    setError(null)
    if (!valid) {
      setError(`Summa ${formatSom(opts.min)} - ${formatSom(opts.max)} so'm oralig'ida bo'lishi kerak.`)
      return
    }
    setSubmitting(true)
    try {
      const res = await createDonation({
        amount: effectiveAmount,
        provider,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        message: message.trim() || undefined,
      })
      if (res.account) {
        setUzumAccount({ account: res.account, amount: res.amount, deeplink: res.payment_url })
        setSubmitting(false)
      } else if (res.order_id) {
        setPaynetOrder({ orderId: res.order_id, amount: res.amount })
        setSubmitting(false)
      } else if (res.payment_url) {
        window.location.href = res.payment_url
      } else {
        setError('Xatolik yuz berdi. Qayta urinib ko‘ring.')
        setSubmitting(false)
      }
    } catch (e) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : null
      setError(typeof detail === 'string' ? detail : 'Xatolik yuz berdi. Qayta urinib ko‘ring.')
      setSubmitting(false)
    }
  }

  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-24 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.1fr]">
        <PageTitle
          title="Loyihani qoʻllab-quvvatlang"
          lead="GapirAI.uz — mustaqil loyiha. Har bir hissa server va sunʼiy intellekt xarajatlarini qoplab, videolarni koʻproq odamga yetkazishga yordam beradi."
        />

        <div className="ui-card p-5 sm:p-7">
          <fieldset>
            <legend className="ui-label mb-2.5">Summa</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {opts.presets.map((p) => {
                const active = custom === 0 && amount === p
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { setAmount(p); setCustomRaw('') }}
                    className={`min-h-11 rounded-control border px-2 text-sm font-medium tabular-nums transition ${active ? 'border-ui-accent bg-ui-accent/[0.06] text-ui-ink shadow-[0_0_0_1px_rgb(var(--ui-accent))]' : 'border-ui-rule text-ui-muted hover:text-ui-ink'}`}
                  >
                    {formatSom(p)}
                  </button>
                )
              })}
            </div>
            <div className="relative mt-2">
              <label htmlFor="donate-custom" className="sr-only">Boshqa summa (soʻm)</label>
              <input
                id="donate-custom"
                value={customRaw}
                onChange={(e) => setCustomRaw(e.target.value)}
                inputMode="numeric"
                placeholder="Boshqa summa"
                className="ui-input min-h-11 w-full px-3 text-base placeholder:text-ui-muted focus:outline-none"
              />
              {custom > 0 && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ui-muted tabular-nums">
                  {formatSom(custom)} soʻm
                </span>
              )}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="ui-label mb-2.5">Toʻlov turi</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROVIDERS.map((pv) => (
                <button
                  key={pv}
                  type="button"
                  aria-pressed={provider === pv}
                  onClick={() => { setProvider(pv); setUzumAccount(null); setPaynetOrder(null) }}
                  className={`min-h-11 rounded-control border text-sm font-medium transition ${provider === pv ? 'border-ui-accent bg-ui-accent/[0.06] text-ui-ink shadow-[0_0_0_1px_rgb(var(--ui-accent))]' : 'border-ui-rule text-ui-muted hover:text-ui-ink'}`}
                >
                  {PROVIDER_LABEL[pv]}
                </button>
              ))}
            </div>
          </fieldset>

          {uzumAccount && <div className="mt-4"><UzumAccountCard account={uzumAccount.account} amount={uzumAccount.amount} deeplink={uzumAccount.deeplink} /></div>}
          {paynetOrder && <div className="mt-4"><PaynetOrderCard orderId={paynetOrder.orderId} amount={paynetOrder.amount} /></div>}

          <div className="mt-6 space-y-3">
            <div>
              <label htmlFor="donate-name" className="ui-label mb-1.5">Ismingiz <span className="font-normal text-ui-muted">(ixtiyoriy)</span></label>
              <input id="donate-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="ui-input min-h-11 w-full px-3 text-base focus:outline-none" />
            </div>
            <div>
              <label htmlFor="donate-email" className="ui-label mb-1.5">Email <span className="font-normal text-ui-muted">(rahmat xabari uchun, ixtiyoriy)</span></label>
              <input id="donate-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className="ui-input min-h-11 w-full px-3 text-base focus:outline-none" />
            </div>
            <div>
              <label htmlFor="donate-message" className="ui-label mb-1.5">Xabar <span className="font-normal text-ui-muted">(ixtiyoriy)</span></label>
              <textarea id="donate-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="ui-input w-full resize-none px-3 py-2.5 text-base focus:outline-none" />
            </div>
          </div>

          {error && <p role="alert" className="mt-3 text-sm font-medium text-ui-red-ink">{error}</p>}

          <button type="button" onClick={submit} disabled={submitting || !valid} className="ui-btn ui-btn-primary mt-5 w-full">
            {submitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Heart aria-hidden="true" className="h-4 w-4" />}
            {valid
              ? provider === 'uzum'
                ? `${formatSom(effectiveAmount)} soʻm — Uzum hisob raqamini olish`
                : provider === 'paynet'
                  ? `${formatSom(effectiveAmount)} soʻm — Paynet buyurtma raqamini olish`
                  : `${formatSom(effectiveAmount)} soʻm qoʻllab-quvvatlash`
              : 'Summani tanlang'}
          </button>

          <p className="mt-3 text-center text-[13px] text-ui-muted">
            Toʻlov {PROVIDER_LABEL[provider]} orqali xavfsiz amalga oshiriladi. Karta maʼlumotlari saytda saqlanmaydi.
          </p>
        </div>
      </div>
    </PageShell>
  )
}
