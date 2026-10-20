'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, Check, Crown, Loader2, Sparkles, Zap } from 'lucide-react'
import { getPlans, subscribeToPlan, subscribeToPlanPayme, subscribeToPlanUzum, subscribeToPlanPaynet, purchaseMinutes, purchaseMinutesUzum, purchaseMinutesPaynet, PlanDef, CurrentSubscription, MinutePack } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import DonateCTA from '@/components/DonateCTA'
import UzumAccountCard from '@/components/UzumAccountCard'
import PaynetOrderCard from '@/components/PaynetOrderCard'

type PayProvider = 'click' | 'payme' | 'uzum' | 'paynet'

const PLAN_ICONS: Record<string, any> = { free: Sparkles, standard: Zap, pro: Crown }

export default function PricingPage() {
  const router = useRouter()
  const { isLoggedIn, loading: authLoading } = useAuth()
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [packs, setPacks] = useState<MinutePack[]>(DEFAULT_PACKS)
  const [current, setCurrent] = useState<CurrentSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [buyingPack, setBuyingPack] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [uzumAccount, setUzumAccount] = useState<{ account: number; amount: number; deeplink?: string } | null>(null)
  const [paynetOrder, setPaynetOrder] = useState<{ orderId: string; amount: number } | null>(null)
  // Bosh sahifada video yuborilganda daqiqa yetmasa (402 insufficient_minutes),
  // matnli xabar o'rniga to'g'ridan-to'g'ri shu yerga (?reason=...) yo'naltiriladi
  // va shu modal chiqadi (2026-09-14). useSearchParams o'rniga plain
  // window.location.search ishlatildi -- Next.js'da useSearchParams static
  // sahifani Suspense chegarasiz build vaqtida buzishi mumkin, bu sahifa esa
  // hozircha (loading holatisiz) statik sifatida yig'iladi.
  const [showInsufficientMinutes, setShowInsufficientMinutes] = useState(false)
  const [shortfallMinutes, setShortfallMinutes] = useState<number | null>(null)
  const [videoDurationMinutes, setVideoDurationMinutes] = useState<number | null>(null)

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
      })
      .catch(() => setError("Tariflarni yuklashda xatolik yuz berdi."))
      .finally(() => setLoading(false))
  }, [authLoading])

  const scrollToPacks = () => {
    setShowInsufficientMinutes(false)
    // Modal yopilishi (re-render)dan keyingi taktga qoldiramiz. "smooth"
    // sinovda modal yopilishi bilan bir vaqtda chaqirilganda ba'zan hech
    // narsa qilmasdan o'tib ketishi kuzatildi -- "instant" har doim ishlaydi.
    setTimeout(() => {
      document.getElementById('minute-packs')?.scrollIntoView({ behavior: 'instant', block: 'start' })
    }, 50)
  }

  const handleBuyPack = async (pack: number, provider: PayProvider = 'click') => {
    if (!isLoggedIn) { router.push('/login'); return }
    setBuyingPack(pack)
    setError(null)
    try {
      const res =
        provider === 'uzum' ? await purchaseMinutesUzum(pack)
        : provider === 'paynet' ? await purchaseMinutesPaynet(pack)
        : await purchaseMinutes(pack, provider)
      if (provider === 'uzum' && res.success && 'account' in res && res.account) {
        setUzumAccount({ account: res.account as number, amount: res.amount, deeplink: 'payment_url' in res ? res.payment_url : undefined })
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
        provider === 'uzum' ? await subscribeToPlanUzum(planId)
        : provider === 'paynet' ? await subscribeToPlanPaynet(planId)
        : provider === 'payme' ? await subscribeToPlanPayme(planId)
        : await subscribeToPlan(planId)
      if (provider === 'uzum' && res.success && 'account' in res && res.account) {
        setUzumAccount({ account: res.account as number, amount: res.amount, deeplink: 'payment_url' in res ? res.payment_url : undefined })
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

  return (
    <div className="min-h-screen relative flex flex-col items-center py-12 px-4 sm:px-6 transition-colors duration-300">
      <MeshBackground />

      <div className="w-full max-w-5xl z-10 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition duration-200">
          <ArrowLeft className="w-4 h-4" /> Bosh sahifaga qaytish
        </Link>

        <div className="text-center space-y-3">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">Tarif rejalari</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xl mx-auto">
            Har tarif oyiga ma'lum daqiqa dublyaj beradi (haqiqiy video davomiyligi bo'yicha hisoblanadi).
            Byudjet tugasa — pastdan qo'shimcha daqiqa sotib olasiz. Sotib olingan daqiqalar tugamaydi.
          </p>
        </div>

        {!isLoggedIn && !authLoading && (
          <p className="text-center text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 max-w-md mx-auto">
            Tarifga obuna bo'lish uchun{' '}
            <Link href="/login" className="underline hover:text-amber-700 dark:hover:text-amber-300">kiring</Link>
            {' '}yoki{' '}
            <Link href="/register" className="underline hover:text-amber-700 dark:hover:text-amber-300">ro'yxatdan o'ting</Link>.
          </p>
        )}

        {error && (
          <p className="text-center text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 max-w-md mx-auto">{error}</p>
        )}

        <div className="flex items-center justify-center gap-3">
          <span className={`text-sm font-semibold transition ${billingCycle === 'monthly' ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>Oylik</span>
          <button
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className="relative w-12 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 transition"
            aria-label="To'lov davrini almashtirish"
          >
            <span
              className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-violet-500 transition-transform ${
                billingCycle === 'yearly' ? 'translate-x-[22px]' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-sm font-semibold transition flex items-center gap-1.5 ${billingCycle === 'yearly' ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
            Yillik
            <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">2 oy bepul</span>
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-violet-400" /></div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-5">
            {(plans.length ? plans : DEFAULT_PLANS)
              .filter((plan) => plan.tier === 'free' || plan.period_days === (billingCycle === 'yearly' ? 365 : 30))
              .map((plan) => {
              const Icon = PLAN_ICONS[plan.tier] || Sparkles
              const isCurrent = current?.plan === plan.tier
              const isPro = plan.tier === 'pro'
              const monthlyEquivalent = plan.period_days === 365 ? Math.round(plan.price / 12) : null
              return (
                <div
                  key={plan.id}
                  className={`glass-card relative border rounded-[28px] p-6 flex flex-col gap-5 ${
                    isPro ? 'border-violet-500/50 shadow-[0_0_40px_-10px] shadow-violet-500/30' : 'border-black/5 dark:border-white/5'
                  }`}
                >
                  {isPro && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest bg-violet-500 text-white px-3 py-1 rounded-full">
                      Tavsiya etiladi
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 dark:text-violet-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900 dark:text-white">{plan.name}</h3>
                      {isCurrent && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Joriy tarif</span>}
                    </div>
                  </div>

                  <div>
                    <span className="text-3xl font-black text-gray-900 dark:text-white">
                      {plan.price === 0 ? 'Bepul' : (monthlyEquivalent ?? plan.price).toLocaleString('uz-UZ')}
                    </span>
                    {plan.price > 0 && <span className="text-sm text-gray-500 dark:text-slate-400"> so'm/oy</span>}
                    {monthlyEquivalent !== null && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        {plan.price.toLocaleString('uz-UZ')} so'm/yil to'lanadi
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2.5 text-sm text-gray-600 dark:text-slate-300 flex-1">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" /> <strong className="text-gray-900 dark:text-white">Oyiga {plan.monthly_minutes} daqiqa</strong> dublyaj</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" /> 1 video — maksimal 120 daqiqa</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" /> {plan.priority ? 'Ustuvor navbat' : 'Standart navbat'}</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" /> Tabiiy, tiniq AI ovozlar</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" /> Yuklab olish sifati: {plan.max_resolution} gacha</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" /> Video tahlil — cheklovsiz</li>
                  </ul>

                  <button
                    onClick={() => plan.id !== 'free' && handleSubscribe(plan.id, 'click')}
                    disabled={plan.id === 'free' || isCurrent || subscribing === plan.id}
                    className={`w-full py-3 rounded-2xl font-bold text-sm transition flex items-center justify-center gap-2 ${
                      plan.id === 'free' || isCurrent
                        ? 'bg-black/5 dark:bg-white/5 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90'
                    }`}
                  >
                    {subscribing === plan.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Kutilmoqda...</>
                    ) : isCurrent ? 'Joriy tarif' : plan.id === 'free' ? 'Bepul tarif' : 'Click orqali tanlash'}
                  </button>
                  {plan.id !== 'free' && !isCurrent && (
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                      <button
                        onClick={() => handleSubscribe(plan.id, 'payme')}
                        disabled={subscribing === plan.id}
                        className="py-2 sm:py-2.5 px-1 rounded-xl sm:rounded-2xl font-bold text-[11px] sm:text-xs text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate"
                      >
                        Payme
                      </button>
                      <button
                        onClick={() => handleSubscribe(plan.id, 'uzum')}
                        disabled={subscribing === plan.id}
                        className="py-2 sm:py-2.5 px-1 rounded-xl sm:rounded-2xl font-bold text-[11px] sm:text-xs text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate"
                      >
                        Uzum
                      </button>
                      <button
                        onClick={() => handleSubscribe(plan.id, 'paynet')}
                        disabled={subscribing === plan.id}
                        className="py-2 sm:py-2.5 px-1 rounded-xl sm:rounded-2xl font-bold text-[11px] sm:text-xs text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate"
                      >
                        Paynet
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Qo'shimcha daqiqa paketlari */}
        <div id="minute-packs" className="space-y-4 pt-4">
          <div className="text-center space-y-1.5">
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Qo'shimcha daqiqalar</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 max-w-lg mx-auto">
              Oylik byudjetingiz tugasa sotib oling. Bir martalik to'lov — tugamaydi, keyingi oyga o'tadi.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-stretch">
            {packs.map((p) => {
              const isStarter = p.minutes === 15;
              const isPopular = p.minutes === 70;
              const isAlreadyBought = Boolean(isStarter && p.already_purchased);

              return (
                <div
                  key={p.minutes}
                  className={`rounded-2xl border ${
                    isStarter
                      ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
                      : isPopular
                      ? 'border-violet-500/40 bg-violet-500/[0.04]'
                      : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/[0.03]'
                  } backdrop-blur p-4 flex flex-col justify-between items-center text-center relative h-full`}
                >
                  {/* Top Badge area with uniform fixed height so numbers ALWAYS align */}
                  <div className="h-6 flex items-center justify-center w-full mb-1">
                    {isStarter ? (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        Starter (1 marta)
                      </span>
                    ) : isPopular ? (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30">
                        Mashhur
                      </span>
                    ) : (
                      <span className="h-4 block" aria-hidden="true" />
                    )}
                  </div>

                  {/* Value and Price (Perfect vertical alignment across all cards) */}
                  <div className="flex flex-col items-center justify-center my-auto py-2">
                    <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                      +{p.minutes}
                    </span>
                    <span className="text-[10px] sm:text-[11px] uppercase tracking-widest text-gray-400 dark:text-slate-500 font-semibold mt-0.5">
                      daqiqa
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-violet-600 dark:text-violet-400 mt-2">
                      {p.price.toLocaleString('uz-UZ')} so'm
                    </span>
                  </div>

                  {/* Bottom Action Buttons (Uniformly pinned to the bottom) */}
                  <div className="w-full space-y-1.5 mt-auto pt-2">
                    <button
                      onClick={() => handleBuyPack(p.minutes, 'click')}
                      disabled={buyingPack === p.minutes || isAlreadyBought}
                      className="w-full py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90 transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {buyingPack === p.minutes ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isAlreadyBought ? (
                        'Xarid qilingan'
                      ) : (
                        'Sotib olish'
                      )}
                    </button>
                    <div className="grid grid-cols-3 w-full gap-1">
                      <button
                        onClick={() => handleBuyPack(p.minutes, 'payme')}
                        disabled={buyingPack === p.minutes || isAlreadyBought}
                        className="py-1.5 px-0.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Payme
                      </button>
                      <button
                        onClick={() => handleBuyPack(p.minutes, 'uzum')}
                        disabled={buyingPack === p.minutes || isAlreadyBought}
                        className="py-1.5 px-0.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Uzum
                      </button>
                      <button
                        onClick={() => handleBuyPack(p.minutes, 'paynet')}
                        disabled={buyingPack === p.minutes || isAlreadyBought}
                        className="py-1.5 px-0.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Paynet
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DonateCTA variant="line" className="pt-2 pb-4" />
      </div>

      {uzumAccount && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setUzumAccount(null)}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-[#1b1b20]" onClick={(e) => e.stopPropagation()}>
            <UzumAccountCard account={uzumAccount.account} amount={uzumAccount.amount} deeplink={uzumAccount.deeplink} />
            <button
              onClick={() => setUzumAccount(null)}
              className="mt-3 w-full rounded-xl bg-black/5 py-2.5 text-sm font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300"
            >
              Yopish
            </button>
          </div>
        </div>
      )}

      {paynetOrder && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setPaynetOrder(null)}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-[#1b1b20]" onClick={(e) => e.stopPropagation()}>
            <PaynetOrderCard orderId={paynetOrder.orderId} amount={paynetOrder.amount} />
            <button
              onClick={() => setPaynetOrder(null)}
              className="mt-3 w-full rounded-xl bg-black/5 py-2.5 text-sm font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300"
            >
              Yopish
            </button>
          </div>
        </div>
      )}

      {showInsufficientMinutes && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowInsufficientMinutes(false)}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-[#1b1b20]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white">Daqiqangiz yetarli emas</h3>
            {videoDurationMinutes && shortfallMinutes ? (
              <div className="mt-2 space-y-2 text-sm text-gray-600 dark:text-slate-300">
                <p className="text-xs">
                  Siz tanlagan video: <strong className="text-gray-900 dark:text-white">{videoDurationMinutes} daqiqa</strong>
                </p>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium">
                  Yetishmayotgan daqiqa: <strong>{shortfallMinutes} daqiqa</strong>
                </div>
                {(() => {
                  const rec = shortfallMinutes ? (packs.find((p) => p.minutes >= shortfallMinutes) || packs[packs.length - 1]) : packs[0];
                  const recPlan = shortfallMinutes ? (shortfallMinutes <= 350
                    ? (plans.find((p) => p.id === 'standard') || { id: 'standard', name: 'Standart', monthly_minutes: 350, price: 49000 })
                    : (plans.find((p) => p.id === 'pro') || { id: 'pro', name: 'Pro', monthly_minutes: 600, price: 199000 })) : null;
                  return rec ? (
                    <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <p>
                        Tavsiya etilgan paket: <strong className="text-violet-600 dark:text-violet-400">+{rec.minutes} daqiqa</strong> ({rec.price.toLocaleString('uz-UZ')} so&apos;m). Ortib qolgan daqiqalar kuymaydi!
                      </p>
                      {recPlan && (
                        <p>
                          Yoki oylik tejamkorlik uchun <strong className="text-indigo-600 dark:text-indigo-400">{recPlan.name} tarifiga</strong> ({recPlan.monthly_minutes} daqiqa/oy — {recPlan.price.toLocaleString('uz-UZ')} so&apos;m) o&apos;tishingiz mumkin.
                        </p>
                      )}
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                Bu videoni dublyaj qilish uchun oylik byudjetingiz yetmayapti. Qo'shimcha daqiqa paketini sotib oling — tugamaydi, keyingi oyga o'tadi.
              </p>
            )}

            {(() => {
              const rec = shortfallMinutes ? (packs.find((p) => p.minutes >= shortfallMinutes) || packs[packs.length - 1]) : (packs.length > 0 ? packs[0] : null);
              const recPlan = shortfallMinutes ? (shortfallMinutes <= 350
                ? (plans.find((p) => p.id === 'standard') || { id: 'standard', name: 'Standart', monthly_minutes: 350, price: 49000 })
                : (plans.find((p) => p.id === 'pro') || { id: 'pro', name: 'Pro', monthly_minutes: 600, price: 199000 })) : null;
              if (rec) {
                return (
                  <div className="mt-5 space-y-2">
                    <button
                      onClick={() => {
                        setShowInsufficientMinutes(false)
                        handleBuyPack(rec.minutes, 'click')
                      }}
                      className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 py-3 text-sm font-bold text-white transition hover:opacity-90 shadow-lg shadow-violet-500/20"
                    >
                      +{rec.minutes} daqiqa olish ({rec.price.toLocaleString('uz-UZ')} UZS)
                    </button>
                    {recPlan && (
                      <button
                        onClick={() => {
                          setShowInsufficientMinutes(false)
                          handleSubscribe(recPlan.id, 'click')
                        }}
                        className="w-full rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 transition"
                      >
                        {recPlan.name} tarifiga o&apos;tish ({recPlan.price.toLocaleString('uz-UZ')} UZS/oy)
                      </button>
                    )}
                  </div>
                )
              }
              return (
                <button
                  onClick={scrollToPacks}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 py-3 text-sm font-bold text-white transition hover:opacity-90"
                >
                  Qo&apos;shimcha daqiqa sotib olish
                </button>
              )
            })()}

            <button
              onClick={scrollToPacks}
              className="mt-2 w-full rounded-2xl bg-black/5 dark:bg-white/10 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20 transition"
            >
              Barcha paketlar va tariflarni ko'rish
            </button>
            <button
              onClick={() => setShowInsufficientMinutes(false)}
              className="mt-1 w-full py-2 text-xs text-gray-400 dark:text-slate-500 hover:underline"
            >
              Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const DEFAULT_PACKS: MinutePack[] = [
  { minutes: 35, price: 15000 },
  { minutes: 70, price: 25000 },
  { minutes: 140, price: 45000 },
  { minutes: 350, price: 100000 },
]

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  );
}

// Login qilinmagan foydalanuvchiga ham tarif tuzilmasini ko'rsatish uchun
// (backend /api/plans login talab qiladi) — narxlar backend/services/plans.py
// bilan bir xil, faqat ko'rsatish uchun.
const DEFAULT_PLANS: PlanDef[] = [
  { id: 'free', name: 'Bepul', price: 0, monthly_minutes: 5, priority: false, tts_tier: 'edge', tier: 'free', period_days: 30, max_resolution: '360p' },
  { id: 'standard', name: 'Standart', price: 49000, monthly_minutes: 350, priority: false, tts_tier: 'edge', tier: 'standard', period_days: 30, max_resolution: '720p' },
  { id: 'standard_yearly', name: "Standart (yillik)", price: 490000, monthly_minutes: 350, priority: false, tts_tier: 'edge', tier: 'standard', period_days: 365, max_resolution: '720p' },
  { id: 'pro', name: 'Pro', price: 199000, monthly_minutes: 600, priority: true, tts_tier: 'premium', tier: 'pro', period_days: 30, max_resolution: '1080p' },
  { id: 'pro_yearly', name: 'Pro (yillik)', price: 1990000, monthly_minutes: 600, priority: true, tts_tier: 'premium', tier: 'pro', period_days: 365, max_resolution: '1080p' },
]
