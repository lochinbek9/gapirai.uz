'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Check, Loader2, Minus } from 'lucide-react'
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
import SiteHeader from '@/components/metro/SiteHeader'
import { Spine, SpineStop } from '@/components/metro/Spine'
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
    { label: 'Har 30 kunda', value: (p) => <><strong className="m-num text-metro-ink">{p.monthly_minutes}</strong> daqiqa</> },
    { label: '1 daqiqa narxi', value: (p) => (perMinute(p) ? <span className="m-num">~{som(perMinute(p))} so&apos;m</span> : <span className="text-metro-muted">—</span>) },
    { label: 'Video sifati', value: (p) => <span className="m-num">{p.max_resolution} gacha</span> },
    { label: 'Navbat', value: (p) => (p.priority ? 'Ustuvor' : 'Umumiy') },
    { label: 'Ovoz variantlari', value: (p) => (p.tier === 'pro' ? 'Tanlash mumkin' : <span className="text-metro-muted">Avtomatik</span>) },
    { label: 'Bitta video', value: () => '120 daqiqagacha' },
    { label: 'Tezkor tahlil', value: () => 'Daqiqa sarflamaydi' },
  ]

  const planPrice = (plan: PlanDef) => {
    const monthlyEquivalent = plan.period_days === 365 ? Math.round(plan.price / 12) : null
    if (plan.price === 0) return <span className="block"><span className="font-sign text-5xl font-extrabold text-white m-num">0</span> <span className="text-base text-metro-plaque-ink/80">so&apos;m</span></span>
    if (plan.discounted_price && billingCycle === 'monthly') {
      return (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-sign text-5xl font-extrabold text-white m-num">{som(plan.discounted_price)}</span>
          <span className="text-base text-metro-plaque-ink/70 line-through m-num">{som(plan.price)}</span>
          <span className="text-base text-metro-plaque-ink/80">so&apos;m / oy · −10%</span>
        </span>
      )
    }
    return (
      <span className="block">
        <span className="font-sign text-5xl font-extrabold text-white m-num">{som(monthlyEquivalent ?? plan.price)}</span>{' '}
        <span className="text-base text-metro-plaque-ink/80">so&apos;m / oy</span>
        {monthlyEquivalent !== null && <span className="mt-1 block text-sm text-metro-plaque-ink/80 m-num">Yiliga {som(plan.price)} so&apos;m</span>}
      </span>
    )
  }

  const planAction = (plan: PlanDef) => {
    const isCurrent = current?.plan === plan.tier
    if (isCurrent) return <span className="m-btn m-btn-ghost w-full cursor-default">Joriy tarifingiz</span>
    if (plan.id === 'free') {
      return (
        <Link href={isLoggedIn ? '/' : '/register'} className="m-btn m-btn-ghost w-full">
          {isLoggedIn ? 'Video yuborish' : "Bepul ro'yxatdan o'tish"}
        </Link>
      )
    }
    return (
      <button type="button" onClick={() => handleSubscribe(plan.id, provider)} disabled={subscribing === plan.id} className="m-btn w-full">
        {subscribing === plan.id ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Kutilmoqda...</> : `${PROVIDERS.find((x) => x.id === provider)?.name} orqali to'lash`}
      </button>
    )
  }

  return (
    <>
      <SiteHeader current="pricing" />
      <main id="main" tabIndex={-1} className="bg-metro-ground text-metro-ink focus:outline-none">
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8">
          {/* Sarlavha va balans */}
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="font-sign text-6xl font-extrabold uppercase leading-none text-metro-ink sm:text-7xl">Tariflar</h1>
              <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-metro-muted">
                Hisob daqiqada yuritiladi: dublaj ham, subtitr ham videoning haqiqiy davomiyligicha daqiqa sarflaydi.
                Tezkor tahlil daqiqa sarflamaydi. Bepul tarifda har 30 kunda 5 daqiqa.
              </p>
            </div>
            {isLoggedIn && current && (
              <div className="m-plaque px-5 py-4">
                <p className="font-sign text-sm font-bold uppercase tracking-wide text-metro-plaque-ink/75">Balansingiz</p>
                <p className="mt-1 font-sign text-4xl font-extrabold text-white m-num">
                  {current.minutes.total_available} <span className="text-xl">daqiqa</span>
                </p>
                {current.minutes.purchased > 0 && (
                  <p className="mt-1 text-sm text-metro-plaque-ink/80 m-num">shundan {current.minutes.purchased} tasi kuymaydi</p>
                )}
              </div>
            )}
          </div>

          {!isLoggedIn && !authLoading && (
            <p className="mt-8 rounded-[6px] border-2 border-metro-rule bg-metro-surface px-4 py-3 text-base text-metro-ink">
              Obuna bo&apos;lish yoki paket olish uchun{' '}
              <Link href="/login" className="font-bold underline underline-offset-4">kiring</Link> yoki{' '}
              <Link href="/register" className="font-bold underline underline-offset-4">bepul ro&apos;yxatdan o&apos;ting</Link>.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-6 rounded-[6px] border-2 border-metro-red/50 bg-metro-red/5 px-4 py-3 text-base font-semibold text-metro-red-ink">
              {error}
            </p>
          )}

          {discountOffer?.active && (
            <div className="mt-8 rounded-[6px] border-2 border-amber-600/50 bg-amber-500/10 px-5 py-4">
              <p className="font-sign text-xl font-extrabold uppercase text-metro-ink">Ilk video uchun 10% chegirma — 24 soat</p>
              <p className="mt-1 text-base text-metro-muted">
                Birinchi videongiz tayyor bo&apos;lgani uchun barcha tarif va paketlarga 10% chegirma narxi avtomatik qo&apos;llandi.
              </p>
            </div>
          )}

          {discountOffer?.expired && !isPaidCustomer && (
            <div className="mt-8 rounded-[6px] border-2 border-metro-rule bg-metro-surface px-5 py-4">
              <p className="text-base text-metro-ink">
                24 soatlik chegirma muddati tugadimi? Admin bilan bog&apos;lanib, chegirma so&apos;rashingiz mumkin:{' '}
                <a
                  href="https://t.me/mentor_lochinbek?text=Salom!+GapirAI+da+birinchi+videomni+dublyaj+qildim.+10%25+chegirma+muddati+tugabdi,+menga+chegirma+bera+olasizmi?"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline underline-offset-4"
                >
                  @mentor_lochinbek<span className="sr-only"> (Telegram, yangi oynada)</span>
                </a>
              </p>
            </div>
          )}

          {/* Boshqaruv: davr va to'lov usuli */}
          <div className="mt-12 flex flex-col gap-5 border-y-2 border-metro-rule py-5 sm:flex-row sm:items-center sm:justify-between">
            <div role="radiogroup" aria-label="To'lov davri" className="inline-flex rounded-[6px] bg-metro-surface p-1 shadow-[inset_0_0_0_2px_rgb(var(--m-rule))]">
              {(['monthly', 'yearly'] as const).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  role="radio"
                  aria-checked={billingCycle === cycle}
                  onClick={() => setBillingCycle(cycle)}
                  className={`min-h-11 rounded-[4px] px-4 font-sign text-base font-bold uppercase tracking-wide transition ${
                    billingCycle === cycle ? 'bg-metro-ink text-metro-ground' : 'text-metro-muted hover:text-metro-ink'
                  }`}
                >
                  {cycle === 'monthly' ? 'Oylik' : 'Yillik · 2 oy tekin'}
                </button>
              ))}
            </div>
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="m-label mb-2 block w-full sm:float-left sm:mb-0 sm:mr-2 sm:w-auto sm:py-2">To&apos;lov usuli</legend>
              {PROVIDERS.map((p) => (
                <label
                  key={p.id}
                  className={`flex min-h-11 cursor-pointer items-center rounded-[6px] px-3.5 text-base font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-metro-blue ${
                    provider === p.id ? 'bg-metro-ink text-metro-ground' : 'text-metro-ink shadow-[inset_0_0_0_2px_rgb(var(--m-rule))] hover:shadow-[inset_0_0_0_2px_rgb(var(--m-muted))]'
                  }`}
                >
                  <input type="radio" name="provider" value={p.id} checked={provider === p.id} onChange={() => setProvider(p.id)} className="sr-only" />
                  {p.name}
                </label>
              ))}
            </fieldset>
          </div>

        </div>
        <Spine tight>
          {/* Tarif taxtasi */}
          {loading ? (
            <div className="flex justify-center py-20" role="status">
              <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-metro-muted" />
              <span className="sr-only">Tariflar yuklanmoqda</span>
            </div>
          ) : (
            <SpineStop id="plans" title="Obuna tariflari">
              {/* Kompyuter: bitta jadval -- qatorlar bo'yicha solishtirish */}
              <div className="hidden overflow-hidden rounded-[6px] border-2 border-metro-plaque bg-metro-surface outline outline-1 outline-offset-2 outline-metro-brass lg:block">
                <table className="w-full table-fixed text-left">
                  <caption className="sr-only">Tariflarni solishtirish</caption>
                  <thead className="bg-metro-plaque text-metro-plaque-ink">
                    <tr className="border-b-[6px] border-metro-red">
                      <td className="w-[22%] p-6 align-bottom">
                        <span className="font-sign text-base font-bold uppercase tracking-wide text-metro-plaque-ink/70">Tarif</span>
                      </td>
                      {visiblePlans.map((plan) => (
                        <th key={plan.id} scope="col" className="border-l border-metro-plaque-ink/15 p-6 align-top font-normal">
                          <span className="flex items-center gap-2">
                            <span className="font-sign text-3xl font-extrabold uppercase text-white">{plan.name.replace(' (yillik)', '')}</span>
                            {current?.plan === plan.tier && (
                              <span className="rounded-[3px] bg-metro-plaque-ink px-2 py-0.5 font-sign text-sm font-bold uppercase text-metro-plaque">Joriy</span>
                            )}
                          </span>
                          <span className="mt-4 block">{planPrice(plan)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => (
                      <tr key={row.label} className="border-b border-metro-rule last:border-b-0">
                        <th scope="row" className="px-6 py-4 text-base font-semibold text-metro-muted">{row.label}</th>
                        {visiblePlans.map((plan) => (
                          <td key={plan.id} className="border-l-2 border-metro-rule px-6 py-4 text-base text-metro-ink">{row.value(plan)}</td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-metro-rule">
                      <td className="px-6 py-5" />
                      {visiblePlans.map((plan) => (
                        <td key={plan.id} className="border-l-2 border-metro-rule px-6 py-5">{planAction(plan)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Telefon/planshet: har tarif o'z bloki */}
              <ul className="space-y-5 lg:hidden">
                {visiblePlans.map((plan) => (
                  <li key={plan.id} className="overflow-hidden rounded-[6px] border-2 border-metro-plaque bg-metro-surface">
                    <div className="border-b-[6px] border-metro-red bg-metro-plaque p-5 text-metro-plaque-ink">
                      <h3 className="flex items-center gap-2 font-sign text-3xl font-extrabold uppercase text-white">
                        {plan.name.replace(' (yillik)', '')}
                        {current?.plan === plan.tier && (
                          <span className="rounded-[3px] bg-metro-plaque-ink px-2 py-0.5 font-sign text-sm font-bold uppercase text-metro-plaque">Joriy</span>
                        )}
                      </h3>
                      <div className="mt-3">{planPrice(plan)}</div>
                    </div>
                    <dl className="divide-y divide-metro-rule px-5">
                      {ROWS.map((row) => (
                        <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
                          <dt className="text-base text-metro-muted">{row.label}</dt>
                          <dd className="text-right text-base text-metro-ink">{row.value(plan)}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="p-5 pt-3">{planAction(plan)}</div>
                  </li>
                ))}
              </ul>
            </SpineStop>
          )}

          {/* Bir martalik daqiqalar */}
          <SpineStop id="minute-packs" title="Bir martalik daqiqalar">
            <p className="-mt-2 max-w-[62ch] text-lg leading-relaxed text-metro-muted">
              Obunasiz yoki obunaga qo&apos;shimcha. Sotib olingan daqiqalar hech qachon kuymaydi va obuna tugasa ham saqlanadi.
            </p>
            <ul className="mt-8 divide-y-2 divide-metro-rule border-y-2 border-metro-rule">
              {packs.map((p) => {
                const isAlreadyBought = Boolean(p.one_time && p.already_purchased)
                const price = p.discounted_price ?? p.price
                return (
                  <li key={p.minutes} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 py-5 sm:grid-cols-[180px_1fr_220px]">
                    <p className="whitespace-nowrap font-sign text-4xl font-extrabold text-metro-ink m-num">
                      +{p.minutes} <span className="text-xl uppercase">daqiqa</span>
                    </p>
                    <div className="text-right sm:text-left">
                      <p className="text-lg font-bold text-metro-ink m-num">
                        {som(price)} so&apos;m
                        {p.discounted_price ? <span className="ml-2 text-base font-normal text-metro-muted line-through">{som(p.price)}</span> : null}
                      </p>
                      <p className="text-sm text-metro-muted m-num">
                        ~{som(Math.round(price / p.minutes))} so&apos;m / daqiqa{p.one_time ? ' · faqat bir marta olinadi' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBuyPack(p.minutes, provider)}
                      disabled={buyingPack === p.minutes || isAlreadyBought}
                      className="m-btn col-span-2 w-full sm:col-span-1"
                    >
                      {buyingPack === p.minutes ? (
                        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      ) : isAlreadyBought ? (
                        'Olingan'
                      ) : (
                        `Sotib olish · ${PROVIDERS.find((x) => x.id === provider)?.name}`
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </SpineStop>

          <SpineStop id="qoidalar" title="Daqiqa qanday sarflanadi">
            <ul className="grid max-w-5xl gap-x-10 gap-y-5 text-lg leading-relaxed text-metro-muted lg:grid-cols-2">
              {[
                ['Haqiqiy davomiylik', "12 daqiqa 40 soniyalik video — 12,7 daqiqa. Yaxlitlash yoki yashirin to'lov yo'q."],
                ['Avval obuna, keyin paket', "Avval obunaning 30 kunlik daqiqalari ishlatiladi, ular tugasa — sotib olingan, kuymaydigan daqiqalar."],
                ['30 kunda yangilanadi', "Obuna daqiqalari har 30 kunda yangilanadi; ishlatilmagan qoldiq keyingi davrga o'tmaydi."],
                ['Nosozlikda qaytariladi', "Video texnik sabab bilan tayyor bo'lmasa, sarflangan daqiqa balansingizga avtomatik qaytadi."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Check aria-hidden="true" className="mt-1.5 h-5 w-5 shrink-0 text-metro-ink" />
                  <span>
                    <strong className="text-metro-ink">{t}.</strong> {d}
                  </span>
                </li>
              ))}
            </ul>
          </SpineStop>

          <SpineStop id="savollar" title="Savollar" marker="end">
            <div className="divide-y-2 divide-metro-rule border-y-2 border-metro-rule">
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
                <details key={faq.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold text-metro-ink [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <Minus aria-hidden="true" className="hidden h-5 w-5 shrink-0 group-open:block" />
                    <span aria-hidden="true" className="font-sign text-2xl leading-none group-open:hidden">+</span>
                  </summary>
                  <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-metro-muted">{faq.a}</p>
                </details>
              ))}
            </div>
            <DonateCTA variant="line" className="mt-12 justify-start" />
          </SpineStop>

        </Spine>

        {/* Uzum hisob oynasi */}
        {uzumAccount && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setUzumAccount(null)}>
            <div role="dialog" aria-modal="true" aria-label="Uzum orqali to'lov" className="w-full max-w-sm rounded-[6px] bg-metro-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <UzumAccountCard account={uzumAccount.account} amount={uzumAccount.amount} deeplink={uzumAccount.deeplink} />
              <button onClick={() => setUzumAccount(null)} className="m-btn m-btn-ghost mt-3 w-full">Yopish</button>
            </div>
          </div>
        )}

        {/* Paynet buyurtma oynasi */}
        {paynetOrder && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setPaynetOrder(null)}>
            <div role="dialog" aria-modal="true" aria-label="Paynet orqali to'lov" className="w-full max-w-sm rounded-[6px] bg-metro-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <PaynetOrderCard orderId={paynetOrder.orderId} amount={paynetOrder.amount} />
              <button onClick={() => setPaynetOrder(null)} className="m-btn m-btn-ghost mt-3 w-full">Yopish</button>
            </div>
          </div>
        )}

        {/* Daqiqa yetmadi oynasi */}
        {showInsufficientMinutes && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowInsufficientMinutes(false)}>
            <div role="dialog" aria-modal="true" aria-labelledby="short-title" className="w-full max-w-sm rounded-[6px] border-t-[8px] border-metro-plaque bg-metro-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <AlertCircle aria-hidden="true" className="h-6 w-6 text-metro-ink" />
              <h2 id="short-title" className="mt-3 font-sign text-3xl font-extrabold uppercase text-metro-ink">Daqiqa yetmadi</h2>
              {videoDurationMinutes && shortfallMinutes ? (
                <div className="mt-3 space-y-2 text-base text-metro-muted">
                  <p>Video davomiyligi: <strong className="text-metro-ink m-num">{videoDurationMinutes} daqiqa</strong></p>
                  <p>Yetishmayapti: <strong className="text-metro-red-ink m-num">{shortfallMinutes} daqiqa</strong></p>
                  {(() => {
                    const rec = packs.find((p) => p.minutes >= shortfallMinutes) || packs[packs.length - 1]
                    return rec ? (
                      <p>
                        Mos paket: <strong className="text-metro-ink m-num">+{rec.minutes} daqiqa</strong> ({som(rec.price)} so&apos;m). Ortib qolgani kuymaydi.
                      </p>
                    ) : null
                  })()}
                </div>
              ) : (
                <p className="mt-3 text-base text-metro-muted">
                  Bu video uchun balansingiz yetmayapti. Bir martalik paket oling — u kuymaydi.
                </p>
              )}
              <button onClick={scrollToPacks} className="m-btn mt-6 w-full">Daqiqa sotib olish</button>
              <button onClick={() => setShowInsufficientMinutes(false)} className="m-btn m-btn-ghost mt-2 w-full">Yopish</button>
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
