'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Check, Loader2, Plus } from 'lucide-react'
import {
  getPlans,
  subscribeToPlan,
  subscribeToPlanPayme,
  subscribeToPlanUzum,
  subscribeToPlanPaynet,
  purchaseMinutes,
  purchaseMinutesUzum,
  purchaseMinutesPaynet,
  PlanDef,
  CurrentSubscription,
  MinutePack,
  JobDiscountOffer,
} from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import DonateCTA from '@/components/DonateCTA'
import SiteHeader from '@/components/home/SiteHeader'
import Footer from '@/components/Footer'
import UzumAccountCard from '@/components/UzumAccountCard'
import PaynetOrderCard from '@/components/PaynetOrderCard'

type PayProvider = 'click' | 'payme' | 'uzum' | 'paynet'

const PROVIDERS: { id: PayProvider; name: string }[] = [
  { id: 'click', name: 'Click' },
  { id: 'payme', name: 'Payme' },
  { id: 'uzum', name: 'Uzum' },
  { id: 'paynet', name: 'Paynet' },
]

const som = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')

export default function PricingPage() {
  const router = useRouter()
  const { isLoggedIn, loading: authLoading } = useAuth()
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [packs, setPacks] = useState<MinutePack[]>(DEFAULT_PACKS)
  const [current, setCurrent] = useState<CurrentSubscription | null>(null)
  const [discountOffer, setDiscountOffer] = useState<JobDiscountOffer | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [buyingPack, setBuyingPack] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [uzumAccount, setUzumAccount] = useState<{ account: number; amount: number; deeplink?: string } | null>(null)
  const [paynetOrder, setPaynetOrder] = useState<{ orderId: string; amount: number } | null>(null)

  // Insufficient minutes modal
  const [showInsufficientMinutes, setShowInsufficientMinutes] = useState(false)
  const [shortfallMinutes, setShortfallMinutes] = useState<number | null>(null)
  const [videoDurationMinutes, setVideoDurationMinutes] = useState<number | null>(null)

  // To'lov usuli bir marta tanlanadi -- har tarif/paket yonida 4 ta tugma o'rniga
  const [provider, setProvider] = useState<PayProvider>('click')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'insufficient_minutes') {
      setShowInsufficientMinutes(true)
      const s = parseFloat(params.get('short') || '')
      const d = parseFloat(params.get('duration') || '')
      if (!isNaN(s) && s > 0) setShortfallMinutes(Math.ceil(s))
      if (!isNaN(d) && d > 0) setVideoDurationMinutes(Math.round(d * 10) / 10)
      window.history.replaceState({}, '', '/pricing')
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    getPlans()
      .then((res) => {
        setPlans(res.plans)
        if (res.minute_packs?.length) setPacks(res.minute_packs)
        setCurrent(res.current)
        if (res.discount) setDiscountOffer(res.discount)
      })
      .catch(() => setError("Tariflarni yuklashda xatolik yuz berdi."))
      .finally(() => setLoading(false))
  }, [authLoading])

  const scrollToPacks = () => {
    setShowInsufficientMinutes(false)
    setTimeout(() => {
      document.getElementById('minute-packs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const handleBuyPack = async (pack: number, provider: PayProvider = 'click') => {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setBuyingPack(pack)
    setError(null)
    try {
      const res =
        provider === 'uzum'
          ? await purchaseMinutesUzum(pack)
          : provider === 'paynet'
          ? await purchaseMinutesPaynet(pack)
          : await purchaseMinutes(pack, provider)
      if (provider === 'uzum' && res.success && 'account' in res && res.account) {
        setUzumAccount({
          account: res.account as number,
          amount: res.amount,
          deeplink: 'payment_url' in res ? res.payment_url : undefined,
        })
      } else if (provider === 'paynet' && res.success && 'order_id' in res && res.order_id) {
        setPaynetOrder({ orderId: res.order_id as string, amount: res.amount })
      } else if (res.success && 'payment_url' in res && res.payment_url) {
        window.location.assign(res.payment_url)
      } else {
        setError("To'lov havolasini yaratishda xatolik yuz berdi.")
      }
    } catch {
      setError("To'lov havolasini yaratishda xatolik yuz berdi.")
    } finally {
      setBuyingPack(null)
    }
  }

  const handleSubscribe = async (planId: string, provider: PayProvider = 'click') => {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setSubscribing(planId)
    setError(null)
    try {
      const res =
        provider === 'uzum'
          ? await subscribeToPlanUzum(planId)
          : provider === 'paynet'
          ? await subscribeToPlanPaynet(planId)
          : provider === 'payme'
          ? await subscribeToPlanPayme(planId)
          : await subscribeToPlan(planId)
      if (provider === 'uzum' && res.success && 'account' in res && res.account) {
        setUzumAccount({
          account: res.account as number,
          amount: res.amount,
          deeplink: 'payment_url' in res ? res.payment_url : undefined,
        })
      } else if (provider === 'paynet' && res.success && 'order_id' in res && res.order_id) {
        setPaynetOrder({ orderId: res.order_id as string, amount: res.amount })
      } else if (res.success && 'payment_url' in res && res.payment_url) {
        window.location.assign(res.payment_url)
      } else {
        setError("To'lov havolasini yaratishda xatolik yuz berdi.")
      }
    } catch {
      setError("To'lov havolasini yaratishda xatolik yuz berdi.")
    } finally {
      setSubscribing(null)
    }
  }

  // Check user subscription and payment status
  const hasPaidPlan = Boolean(current?.plan && current.plan !== 'free')
  const hasPurchasedMinutes = Boolean((current?.minutes?.purchased ?? 0) > 0)
  const isPaidCustomer = hasPaidPlan || hasPurchasedMinutes

  const visiblePlans = (plans.length ? plans : DEFAULT_PLANS).filter(
    (plan) => plan.tier === 'free' || plan.period_days === (billingCycle === 'yearly' ? 365 : 30)
  )
  const perMinute = (plan: PlanDef) =>
    plan.price > 0 && plan.monthly_minutes > 0
      ? Math.round((plan.discounted_price && billingCycle === 'monthly' ? plan.discounted_price : plan.price) / (plan.period_days === 365 ? plan.monthly_minutes * 12 : plan.monthly_minutes))
      : 0

  const ROWS: { label: string; value: (plan: PlanDef) => React.ReactNode }[] = [
    { label: 'Har 30 kunda', value: (p) => <><span className="font-medium tabular-nums">{p.monthly_minutes}</span> daqiqa</> },
    { label: '1 daqiqa narxi', value: (p) => (perMinute(p) ? <span className="tabular-nums">~{som(perMinute(p))} so&apos;m</span> : <span className="text-ui-muted">—</span>) },
    { label: 'Video sifati', value: (p) => <span className="tabular-nums">{p.max_resolution} gacha</span> },
    { label: 'Navbat', value: (p) => (p.priority ? 'Ustuvor' : 'Umumiy') },
    { label: 'Ovoz variantlari', value: (p) => (p.tier === 'pro' ? 'Tanlash mumkin' : <span className="text-ui-muted">Avtomatik</span>) },
    { label: 'Bitta video', value: () => '120 daqiqagacha' },
    { label: 'Tezkor tahlil', value: () => 'Daqiqa sarflamaydi' },
  ]

  const planPrice = (plan: PlanDef) => {
    const monthlyEquivalent = plan.period_days === 365 ? Math.round(plan.price / 12) : null
    const big = 'text-[2.5rem] font-semibold leading-none tracking-[-0.03em] text-ui-ink tabular-nums'
    if (plan.price === 0) return <p><span className={big}>0</span> <span className="text-[15px] text-ui-muted">so&apos;m</span></p>
    if (plan.discounted_price && billingCycle === 'monthly') {
      return (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={big}>{som(plan.discounted_price)}</span>
          <span className="text-[15px] text-ui-muted line-through tabular-nums">{som(plan.price)}</span>
          <span className="text-[15px] text-ui-muted">so&apos;m / oy · −10%</span>
        </p>
      )
    }
    return (
      <div>
        <p>
          <span className={big}>{som(monthlyEquivalent ?? plan.price)}</span>{' '}
          <span className="text-[15px] text-ui-muted">so&apos;m / oy</span>
        </p>
        {monthlyEquivalent !== null && <p className="mt-1.5 text-sm text-ui-muted tabular-nums">Yiliga {som(plan.price)} so&apos;m</p>}
      </div>
    )
  }

  const PLAN_NOTE: Record<string, string> = {
    free: 'Xizmatni sinab koʻrish uchun',
    standard: 'Muntazam koʻradigan va oʻrganadiganlar uchun',
    pro: 'Koʻp video bilan ishlaydigan blogerlar va jamoalar uchun',
  }

  const planAction = (plan: PlanDef) => {
    const isCurrent = current?.plan === plan.tier
    if (isCurrent) return <span className="ui-btn ui-btn-secondary w-full cursor-default">Joriy tarifingiz</span>
    if (plan.id === 'free') {
      return (
        <Link href={isLoggedIn ? '/' : '/register'} className="ui-btn ui-btn-secondary w-full">
          {isLoggedIn ? 'Video yuborish' : "Bepul ro'yxatdan o'tish"}
        </Link>
      )
    }
    return (
      <button type="button" onClick={() => handleSubscribe(plan.id, provider)} disabled={subscribing === plan.id} className="ui-btn w-full">
        {subscribing === plan.id ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Kutilmoqda...</> : `${PROVIDERS.find((x) => x.id === provider)?.name} orqali to'lash`}
      </button>
    )
  }

  const H2 = 'text-2xl font-semibold tracking-[-0.025em] text-ui-ink sm:text-3xl'

  return (
    <>
      <SiteHeader current="pricing" />
      <main id="main" tabIndex={-1} className="bg-ui-surface text-ui-ink focus:outline-none">
        <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-20">
          {/* Sarlavha */}
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ui-ink sm:text-6xl">Tariflar</h1>
            <p className="mx-auto mt-5 max-w-[56ch] text-lg leading-relaxed text-ui-muted [text-wrap:pretty]">
              Hisob daqiqada yuritiladi: dublaj ham, subtitr ham videoning haqiqiy davomiyligicha daqiqa sarflaydi.
              Tezkor tahlil daqiqa sarflamaydi.
            </p>
          </div>

          {isLoggedIn && current && (
            <p className="mx-auto mt-8 w-fit rounded-full border border-ui-rule bg-ui-ground px-4 py-2 text-[15px] text-ui-muted">
              Balansingiz: <strong className="font-semibold text-ui-ink tabular-nums">{current.minutes.total_available} daqiqa</strong>
              {current.minutes.purchased > 0 && <span className="tabular-nums"> · shundan {current.minutes.purchased} tasi kuymaydi</span>}
            </p>
          )}

          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            {!isLoggedIn && !authLoading && (
              <p className="rounded-control border border-ui-rule bg-ui-ground px-4 py-3 text-center text-[15px] text-ui-muted">
                Obuna boʻlish yoki paket olish uchun{' '}
                <Link href="/login" className="font-medium text-ui-ink underline underline-offset-4">kiring</Link> yoki{' '}
                <Link href="/register" className="font-medium text-ui-ink underline underline-offset-4">bepul roʻyxatdan oʻting</Link>.
              </p>
            )}

            {error && (
              <p role="alert" className="rounded-control border border-ui-red/30 bg-ui-red/[0.05] px-4 py-3 text-[15px] font-medium text-ui-red-ink">
                {error}
              </p>
            )}

            {discountOffer?.active && (
              <div className="rounded-control border border-amber-500/30 bg-amber-500/[0.07] px-5 py-4">
                <p className="font-semibold text-ui-ink">Ilk video uchun 10% chegirma — 24 soat</p>
                <p className="mt-1 text-[15px] text-ui-muted">
                  Birinchi videongiz tayyor boʻlgani uchun barcha tarif va paketlarga 10% chegirma narxi avtomatik qoʻllandi.
                </p>
              </div>
            )}

            {discountOffer?.expired && !isPaidCustomer && (
              <p className="rounded-control border border-ui-rule bg-ui-ground px-5 py-4 text-[15px] text-ui-muted">
                24 soatlik chegirma muddati tugadimi? Admin bilan bogʻlanib, chegirma soʻrashingiz mumkin:{' '}
                <a
                  href="https://t.me/mentor_lochinbek?text=Salom!+GapirAI+da+birinchi+videomni+dublyaj+qildim.+10%25+chegirma+muddati+tugabdi,+menga+chegirma+bera+olasizmi?"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ui-ink underline underline-offset-4"
                >
                  @mentor_lochinbek<span className="sr-only"> (Telegram, yangi oynada)</span>
                </a>
              </p>
            )}
          </div>

          {/* Boshqaruv: davr va to'lov usuli */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6">
            <div role="radiogroup" aria-label="To'lov davri" className="inline-flex gap-1 rounded-control bg-ui-ground p-1">
              {(['monthly', 'yearly'] as const).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  role="radio"
                  aria-checked={billingCycle === cycle}
                  onClick={() => setBillingCycle(cycle)}
                  className={`min-h-10 rounded-lg px-4 text-sm font-medium transition ${
                    billingCycle === cycle
                      ? 'bg-ui-surface text-ui-ink shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(var(--ui-rule))]'
                      : 'text-ui-muted hover:text-ui-ink'
                  }`}
                >
                  {cycle === 'monthly' ? 'Oylik' : <>Yillik <span className={billingCycle === cycle ? 'text-ui-accent-ink' : ''}>· 2 oy tekin</span></>}
                </button>
              ))}
            </div>
            <fieldset className="flex flex-wrap items-center justify-center gap-1.5">
              <legend className="sr-only">To&apos;lov usuli</legend>
              <span aria-hidden="true" className="mr-1 text-sm text-ui-muted">Toʻlov:</span>
              {PROVIDERS.map((p) => (
                <label
                  key={p.id}
                  className={`flex min-h-10 cursor-pointer items-center rounded-lg border px-3 text-sm font-medium transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ui-accent ${
                    provider === p.id
                      ? 'border-ui-accent bg-ui-accent/[0.06] text-ui-ink shadow-[0_0_0_1px_rgb(var(--ui-accent))]'
                      : 'border-ui-rule text-ui-muted hover:text-ui-ink'
                  }`}
                >
                  <input type="radio" name="provider" value={p.id} checked={provider === p.id} onChange={() => setProvider(p.id)} className="sr-only" />
                  {p.name}
                </label>
              ))}
            </fieldset>
          </div>

          {/* Tarif kartalari */}
          <section id="plans" aria-label="Obuna tariflari" className="mt-10 scroll-mt-24">
            {loading ? (
              <div className="flex justify-center py-20" role="status">
                <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-ui-muted" />
                <span className="sr-only">Tariflar yuklanmoqda</span>
              </div>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-3">
                {visiblePlans.map((plan) => {
                  const isCurrent = current?.plan === plan.tier
                  return (
                    <li
                      key={plan.id}
                      className={`ui-card flex flex-col p-6 sm:p-7 ${isCurrent ? 'shadow-[0_0_0_1px_rgb(var(--ui-accent))] border-ui-accent' : ''}`}
                    >
                      <h2 className="flex items-center gap-2 text-lg font-semibold text-ui-ink">
                        {plan.name.replace(' (yillik)', '')}
                        {isCurrent && (
                          <span className="rounded-full bg-ui-accent/10 px-2 py-0.5 text-xs font-medium text-ui-accent-ink">Joriy</span>
                        )}
                      </h2>
                      <p className="mt-1 text-sm text-ui-muted lg:min-h-10">{PLAN_NOTE[plan.tier] ?? ''}</p>
                      <div className="mt-6">{planPrice(plan)}</div>
                      <div className="mt-6">{planAction(plan)}</div>
                      <dl className="mt-6 divide-y divide-ui-rule border-t border-ui-rule">
                        {ROWS.map((row) => (
                          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                            <dt className="text-ui-muted">{row.label}</dt>
                            <dd className="text-right text-ui-ink">{row.value(plan)}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Bir martalik daqiqalar */}
          <section id="minute-packs" aria-labelledby="packs-title" className="scroll-mt-24 pt-24">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
              <div>
                <h2 id="packs-title" className={H2}>Bir martalik daqiqalar</h2>
                <p className="mt-3 max-w-[44ch] text-base leading-relaxed text-ui-muted">
                  Obunasiz yoki obunaga qoʻshimcha. Sotib olingan daqiqalar hech qachon kuymaydi va obuna tugasa ham saqlanadi.
                </p>
              </div>
              <ul className="ui-card divide-y divide-ui-rule">
                {packs.map((p) => {
                  const isAlreadyBought = Boolean(p.one_time && p.already_purchased)
                  const price = p.discounted_price ?? p.price
                  return (
                    <li key={p.minutes} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[120px_1fr_auto]">
                      <p className="whitespace-nowrap text-lg font-semibold text-ui-ink tabular-nums">
                        +{p.minutes} <span className="text-[15px] font-normal text-ui-muted">daqiqa</span>
                      </p>
                      <div className="text-right sm:text-left">
                        <p className="font-medium text-ui-ink tabular-nums">
                          {som(price)} so&apos;m
                          {p.discounted_price ? <span className="ml-2 text-sm font-normal text-ui-muted line-through">{som(p.price)}</span> : null}
                        </p>
                        <p className="text-[13px] text-ui-muted tabular-nums">
                          ~{som(Math.round(price / p.minutes))} so&apos;m / daqiqa{p.one_time ? ' · faqat bir marta' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBuyPack(p.minutes, provider)}
                        disabled={buyingPack === p.minutes || isAlreadyBought}
                        aria-label={isAlreadyBought ? undefined : `${p.minutes} daqiqa sotib olish, ${PROVIDERS.find((x) => x.id === provider)?.name} orqali`}
                        className="ui-btn ui-btn-secondary col-span-2 min-h-10 w-full px-4 text-sm sm:col-span-1 sm:w-auto"
                      >
                        {buyingPack === p.minutes ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                        ) : isAlreadyBought ? (
                          'Olingan'
                        ) : (
                          'Sotib olish'
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          <section id="qoidalar" aria-labelledby="rules-title" className="scroll-mt-24 pt-24">
            <h2 id="rules-title" className={H2}>Daqiqa qanday sarflanadi</h2>
            <ul className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {[
                ['Haqiqiy davomiylik', "12 daqiqa 40 soniyalik video — 12,7 daqiqa. Yaxlitlash yoki yashirin to'lov yo'q."],
                ['Avval obuna, keyin paket', "Avval obunaning 30 kunlik daqiqalari ishlatiladi, ular tugasa — sotib olingan, kuymaydigan daqiqalar."],
                ['30 kunda yangilanadi', "Obuna daqiqalari har 30 kunda yangilanadi; ishlatilmagan qoldiq keyingi davrga o'tmaydi."],
                ['Nosozlikda qaytariladi', "Video texnik sabab bilan tayyor bo'lmasa, sarflangan daqiqa balansingizga avtomatik qaytadi."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-ui-accent-ink" />
                  <span className="text-base leading-relaxed text-ui-muted">
                    <strong className="font-medium text-ui-ink">{t}.</strong> {d}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section id="savollar" aria-labelledby="faq-title" className="scroll-mt-24 pb-24 pt-24">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
              <h2 id="faq-title" className={H2}>Savollar</h2>
              <div>
                <div className="divide-y divide-ui-rule border-y border-ui-rule">
                  {[
                    {
                      q: 'Obunani bekor qilish yoki boshqa tarifga o‘tish mumkinmi?',
                      a: "Ha, istalgan vaqtda tarifni o'zgartirishingiz yoki to'xtatishingiz mumkin. Majburiy muddat yoki jarima yo'q.",
                    },
                    {
                      q: 'Qaysi kartalar bilan to‘lash mumkin?',
                      a: 'Click, Payme, Uzum yoki Paynet orqali — Uzcard, Humo yoki Visa kartangiz bilan.',
                    },
                    {
                      q: 'Subtitr ham daqiqa sarflaydimi?',
                      a: "Ha, subtitr ham dublaj kabi video davomiyligicha daqiqa sarflaydi. Tezkor tahlil (xulosa, konspekt, test) daqiqa sarflamaydi.",
                    },
                    {
                      q: 'Bepul tarifda nima bor?',
                      a: "Har 30 kunda 5 daqiqa dublaj yoki subtitr, 360p sifatda yuklab olish. Uzunroq videolar uchun bir martalik paket yoki obuna oling.",
                    },
                  ].map((faq) => (
                    <details key={faq.q} className="group py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ui-ink [&::-webkit-details-marker]:hidden">
                        {faq.q}
                        <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-ui-muted transition-transform group-open:rotate-45" />
                      </summary>
                      <p className="mt-2 max-w-[65ch] text-[15px] leading-relaxed text-ui-muted">{faq.a}</p>
                    </details>
                  ))}
                </div>
                <DonateCTA variant="line" className="mt-10 justify-start" />
              </div>
            </div>
          </section>
        </div>

        {/* Uzum hisob oynasi */}
        {uzumAccount && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={() => setUzumAccount(null)}>
            <div role="dialog" aria-modal="true" aria-label="Uzum orqali to'lov" className="w-full max-w-sm rounded-card border border-ui-rule bg-ui-surface p-5 shadow-[0_24px_64px_rgb(0_0_0/0.25)]" onClick={(e) => e.stopPropagation()}>
              <UzumAccountCard account={uzumAccount.account} amount={uzumAccount.amount} deeplink={uzumAccount.deeplink} />
              <button onClick={() => setUzumAccount(null)} className="ui-btn ui-btn-secondary mt-3 w-full">Yopish</button>
            </div>
          </div>
        )}

        {/* Paynet buyurtma oynasi */}
        {paynetOrder && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={() => setPaynetOrder(null)}>
            <div role="dialog" aria-modal="true" aria-label="Paynet orqali to'lov" className="w-full max-w-sm rounded-card border border-ui-rule bg-ui-surface p-5 shadow-[0_24px_64px_rgb(0_0_0/0.25)]" onClick={(e) => e.stopPropagation()}>
              <PaynetOrderCard orderId={paynetOrder.orderId} amount={paynetOrder.amount} />
              <button onClick={() => setPaynetOrder(null)} className="ui-btn ui-btn-secondary mt-3 w-full">Yopish</button>
            </div>
          </div>
        )}

        {/* Daqiqa yetmadi oynasi */}
        {showInsufficientMinutes && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowInsufficientMinutes(false)}>
            <div role="dialog" aria-modal="true" aria-labelledby="short-title" className="w-full max-w-sm rounded-card border border-ui-rule bg-ui-surface p-6 shadow-[0_24px_64px_rgb(0_0_0/0.25)]" onClick={(e) => e.stopPropagation()}>
              <AlertCircle aria-hidden="true" className="h-5 w-5 text-ui-muted" />
              <h2 id="short-title" className="mt-3 text-xl font-semibold tracking-[-0.02em] text-ui-ink">Daqiqa yetmadi</h2>
              {videoDurationMinutes && shortfallMinutes ? (
                <div className="mt-3 space-y-2 text-[15px] text-ui-muted">
                  <p>Video davomiyligi: <strong className="font-medium text-ui-ink tabular-nums">{videoDurationMinutes} daqiqa</strong></p>
                  <p>Yetishmayapti: <strong className="font-medium text-ui-red-ink tabular-nums">{shortfallMinutes} daqiqa</strong></p>
                  {(() => {
                    const rec = packs.find((p) => p.minutes >= shortfallMinutes) || packs[packs.length - 1]
                    return rec ? (
                      <p>
                        Mos paket: <strong className="font-medium text-ui-ink tabular-nums">+{rec.minutes} daqiqa</strong> ({som(rec.price)} so&apos;m). Ortib qolgani kuymaydi.
                      </p>
                    ) : null
                  })()}
                </div>
              ) : (
                <p className="mt-3 text-[15px] text-ui-muted">
                  Bu video uchun balansingiz yetmayapti. Bir martalik paket oling — u kuymaydi.
                </p>
              )}
              <button onClick={scrollToPacks} className="ui-btn mt-6 w-full">Daqiqa sotib olish</button>
              <button onClick={() => setShowInsufficientMinutes(false)} className="ui-btn ui-btn-secondary mt-2 w-full">Yopish</button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}

const DEFAULT_PACKS: MinutePack[] = [
  { minutes: 15, price: 4900, one_time: true },
  { minutes: 35, price: 15000 },
  { minutes: 70, price: 25000 },
  { minutes: 140, price: 45000 },
  { minutes: 350, price: 100000 },
]

// API javob bermasa ko'rsatiladigan zaxira -- backend/services/plans.py PLANS bilan bir xil bo'lishi shart
const DEFAULT_PLANS: PlanDef[] = [
  { id: 'free', name: 'Bepul', price: 0, monthly_minutes: 5, priority: false, tts_tier: 'gemini', tier: 'free', period_days: 30, max_resolution: '360p' },
  { id: 'standard', name: 'Standart', price: 49000, monthly_minutes: 350, priority: true, tts_tier: 'gemini', tier: 'standard', period_days: 30, max_resolution: '720p' },
  { id: 'standard_yearly', name: 'Standart (yillik)', price: 490000, monthly_minutes: 350, priority: true, tts_tier: 'gemini', tier: 'standard', period_days: 365, max_resolution: '720p' },
  { id: 'pro', name: 'Pro', price: 199000, monthly_minutes: 600, priority: true, tts_tier: 'gemini', tier: 'pro', period_days: 30, max_resolution: '1080p' },
  { id: 'pro_yearly', name: 'Pro (yillik)', price: 1990000, monthly_minutes: 600, priority: true, tts_tier: 'gemini', tier: 'pro', period_days: 365, max_resolution: '1080p' },
]
