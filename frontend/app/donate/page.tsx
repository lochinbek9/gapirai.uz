'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Heart, Loader2, ArrowLeft } from 'lucide-react'
import { getDonateOptions, createDonation, DonateOptions } from '@/lib/api'
import UzumAccountCard from '@/components/UzumAccountCard'

const PROVIDERS = ['click', 'payme', 'uzum'] as const
type Provider = (typeof PROVIDERS)[number]
const PROVIDER_LABEL: Record<Provider, string> = { click: 'Click', payme: 'Payme', uzum: 'Uzum' }

const FALLBACK: DonateOptions = { presets: [10000, 25000, 50000, 100000], min: 1000, max: 10000000 }

function formatSom(n: number): string {
  return n.toLocaleString('ru-RU').replace(/,/g, ' ')
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
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white dark:from-[#15121f] dark:to-[#0f0f10]">
      <div className="mx-auto max-w-lg px-4 py-10">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 dark:text-gray-400">
          <ArrowLeft className="h-4 w-4" /> Bosh sahifa
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <Heart className="h-6 w-6" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 dark:text-white">Loyihani qo‘llab-quvvatlang</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              GapirAI.uz — mustaqil loyiha. Har bir hissa videolarni ko‘proq odamga yetkazishga yordam beradi.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          {/* Presets */}
          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">Summa</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {opts.presets.map((p) => {
              const active = custom === 0 && amount === p
              return (
                <button
                  key={p}
                  onClick={() => { setAmount(p); setCustomRaw('') }}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-bold transition ${
                    active
                      ? 'border-violet-500 bg-violet-500 text-white'
                      : 'border-gray-200 text-gray-700 hover:border-violet-300 dark:border-white/15 dark:text-gray-200'
                  }`}
                >
                  {formatSom(p)}
                </button>
              )
            })}
          </div>

          <div className="mt-3">
            <div className="relative">
              <input
                value={customRaw}
                onChange={(e) => setCustomRaw(e.target.value)}
                inputMode="numeric"
                placeholder="Boshqa summa"
                className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none dark:bg-white/5 ${
                  custom > 0 ? 'border-violet-500' : 'border-gray-300 dark:border-white/15'
                }`}
              />
              {custom > 0 && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {formatSom(custom)} so‘m
                </span>
              )}
            </div>
          </div>

          {/* Provider */}
          <label className="mb-2 mt-5 block text-xs font-bold uppercase tracking-wide text-gray-500">To‘lov turi</label>
          <div className="flex gap-2">
            {PROVIDERS.map((pv) => (
              <button
                key={pv}
                onClick={() => { setProvider(pv); setUzumAccount(null) }}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${
                  provider === pv
                    ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300'
                    : 'border-gray-200 text-gray-600 dark:border-white/15 dark:text-gray-300'
                }`}
              >
                {PROVIDER_LABEL[pv]}
              </button>
            ))}
          </div>

          {uzumAccount && <div className="mt-4"><UzumAccountCard account={uzumAccount.account} amount={uzumAccount.amount} deeplink={uzumAccount.deeplink} /></div>}

          {/* Optional identity */}
          <div className="mt-5 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ismingiz (ixtiyoriy)"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 dark:border-white/15 dark:bg-white/5"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email (rahmat xabari uchun, ixtiyoriy)"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 dark:border-white/15 dark:bg-white/5"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="Xabar (ixtiyoriy)"
              className="w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 dark:border-white/15 dark:bg-white/5"
            />
          </div>

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting || !valid}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-violet-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" fill="currentColor" />}
            {valid
              ? provider === 'uzum'
                ? `${formatSom(effectiveAmount)} so‘m — Uzum hisob raqamini olish`
                : `${formatSom(effectiveAmount)} so‘m qo‘llab-quvvatlash`
              : 'Summani tanlang'}
          </button>

          <p className="mt-3 text-center text-[11px] text-gray-400">
            To‘lov {PROVIDER_LABEL[provider]} orqali xavfsiz amalga oshiriladi. Karta ma’lumotlari saytda saqlanmaydi.
          </p>
        </div>
      </div>
    </div>
  )
}
