'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Crown,
  Loader2,
  Sparkles,
  Zap,
  ShieldCheck,
  Clock,
  HelpCircle,
  ChevronDown,
  Flame,
  Star,
  Layers,
  Sparkle,
  Gift,
  MessageCircle,
  ExternalLink,
} from 'lucide-react'
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

  // FAQ Accordion
  const [openFaq, setOpenFaq] = useState<number | null>(0)

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

  return (
    <div className="min-h-screen relative flex flex-col items-center py-10 px-4 sm:px-6 transition-colors duration-300">
      <MeshBackground />

      <div className="w-full max-w-5xl z-10 space-y-10">
        {/* Navigation & Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition duration-200 bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-black/5 dark:border-white/10"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Bosh sahifaga qaytish
          </Link>

          {isLoggedIn && current && (
            <div className="flex items-center gap-2 text-xs font-medium bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-xl text-violet-700 dark:text-violet-300">
              <span>Balansingiz:</span>
              <strong className="font-bold text-violet-900 dark:text-white">
                {current.minutes.total_available} daqiqa
              </strong>
              {current.minutes.purchased > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  (+{current.minutes.purchased} kuymas)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 shadow-sm">
            <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span>10,000+ daqiqa professional AI dublyaj qilindi</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
            Shaffof va Qulay Tariflar
          </h1>

          <p className="text-sm sm:text-base text-gray-600 dark:text-slate-300 leading-relaxed">
            Ortiqcha studiya xarajatlarisiz, daqiqasiga atigi <span className="font-bold text-violet-600 dark:text-violet-400">140 so'mdan</span> professional dublyaj qiling. Doimiy foydalanish uchun <span className="font-bold text-violet-600 dark:text-violet-400">oylik tejamkor obunalar</span> yoki muddatsiz saqlanadigan <span className="font-bold text-emerald-600 dark:text-emerald-400">kuymaydigan daqiqa paketlari</span>ni tanlang!
          </p>

          {/* Value Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20 font-semibold">
              <Check className="w-3.5 h-3.5 text-violet-500" /> Oylik qulay tariflar
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-semibold">
              <Check className="w-3.5 h-3.5 text-emerald-500" /> Paketlar kuymaydi
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-semibold">
              <Clock className="w-3.5 h-3.5 text-blue-500" /> 1-2 daqiqada tayyor
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" /> 100% tabiiy intonatsiyali ovoz
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" /> Kafolatlangan sifat
            </span>
          </div>
        </div>

        {!isLoggedIn && !authLoading && (
          <p className="text-center text-xs sm:text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3 max-w-lg mx-auto shadow-sm">
            Tarifga obuna bo'lish yoki paket olish uchun{' '}
            <Link href="/login" className="font-bold underline hover:text-amber-900 dark:hover:text-amber-200">
              tizimga kiring
            </Link>{' '}
            yoki{' '}
            <Link href="/register" className="font-bold underline hover:text-amber-900 dark:hover:text-amber-200">
              bepul ro'yxatdan o'ting
            </Link>.
          </p>
        )}

        {error && (
          <p className="text-center text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 max-w-md mx-auto shadow-sm">
            {error}
          </p>
        )}

        {/* Active 10% First Video Welcome Discount Banner */}
        {discountOffer?.active && (
          <div className="max-w-2xl mx-auto p-4 rounded-3xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-purple-500/20 border border-amber-500/40 text-gray-900 dark:text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-amber-500/25 text-amber-500 shrink-0">
                <Gift className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-500">
                    Maxsus Taklif • 10% Chegirma
                  </span>
                  <span className="text-[10px] bg-amber-500/25 text-amber-600 dark:text-amber-300 font-mono font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                    24 SOAT FAOL
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  Ilk videongiz tayyor bo&apos;lgani munosabati bilan barcha tarif va daqiqa paketlariga 10% chegirma narxlari avtomatik qo&apos;llanildi!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Expired Discount Soft-Landing with Admin Contacts */}
        {discountOffer?.expired && !isPaidCustomer && (
          <div className="max-w-2xl mx-auto p-4 rounded-3xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-blue-500/20 text-gray-900 dark:text-white shadow-md space-y-3">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-blue-400">24 soatlik chegirma muddati tugabdimi?</span>
                <span className="text-gray-600 dark:text-gray-300 ml-1">
                  Ko&apos;nglingizni aslo cho&apos;ktirmang! Adminlarimiz bilan to&apos;g&apos;ridan-to&apos;g&apos;ri bog&apos;lanib maxsus chegirma so&apos;rashingiz mumkin:
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <a
                href="https://t.me/goldendevuz?text=Salom!+GapirAI+da+birinchi+videomni+dublyaj+qildim.+10%25+chegirma+muddati+tugabdi,+menga+chegirma+bera+olasizmi?"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-600 dark:text-blue-300 transition text-xs font-semibold group"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-blue-400" />
                  <span>@goldendevuz</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
              </a>
              <a
                href="https://t.me/mentor_lochinbek?text=Salom!+GapirAI+da+birinchi+videomni+dublyaj+qildim.+10%25+chegirma+muddati+tugabdi,+menga+chegirma+bera+olasizmi?"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-600 dark:text-blue-300 transition text-xs font-semibold group"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-blue-400" />
                  <span>@mentor_lochinbek</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
              </a>
            </div>
          </div>
        )}

        {/* Monthly / Yearly Switcher */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <span className={`text-sm font-bold transition ${billingCycle === 'monthly' ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
            Oylik to'lov
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className="relative w-12 h-7 rounded-full bg-violet-500/20 border border-violet-500/40 transition focus:outline-none"
            aria-label="To'lov davrini almashtirish"
          >
            <span
              className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-violet-600 transition-transform ${
                billingCycle === 'yearly' ? 'translate-x-[22px]' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-sm font-bold transition flex items-center gap-1.5 ${billingCycle === 'yearly' ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
            Yillik obuna
            <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
              2 oy bepul (17% tejash)
            </span>
          </span>
        </div>

        {/* Plan Cards */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-6 items-stretch">
            {(plans.length ? plans : DEFAULT_PLANS)
              .filter((plan) => plan.tier === 'free' || plan.period_days === (billingCycle === 'yearly' ? 365 : 30))
              .map((plan) => {
                const Icon = PLAN_ICONS[plan.tier] || Sparkles
                const isCurrent = current?.plan === plan.tier
                const isPro = plan.tier === 'pro'
                const isStandard = plan.tier === 'standard'
                const monthlyEquivalent = plan.period_days === 365 ? Math.round(plan.price / 12) : null

                // Unit economic calculation: price per minute
                const perMinuteCost =
                  plan.price > 0 && plan.monthly_minutes > 0
                    ? Math.round(plan.price / (billingCycle === 'yearly' ? plan.monthly_minutes * 12 : plan.monthly_minutes))
                    : 0

                return (
                  <div
                    key={plan.id}
                    className={`glass-card relative border rounded-3xl p-6 flex flex-col justify-between transition duration-200 ${
                      isCurrent
                        ? 'border-emerald-500/60 ring-2 ring-emerald-500/20 bg-emerald-500/[0.02] shadow-xl'
                        : isPro
                        ? 'border-violet-500/50 shadow-[0_0_40px_-10px] shadow-violet-500/25 bg-white/80 dark:bg-white/[0.03]'
                        : isStandard
                        ? 'border-blue-500/30 bg-white/80 dark:bg-white/[0.03]'
                        : 'border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/[0.02]'
                    }`}
                  >
                    {/* Badge 1: If current plan, show top-right mini component badge */}
                    {isCurrent && (
                      <span className="absolute -top-3 right-4 text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-3 py-1 rounded-full shadow-md shadow-emerald-600/20 flex items-center gap-1 border border-emerald-400/30">
                        <Check className="w-3 h-3" />
                        Joriy tarifingiz
                      </span>
                    )}

                    {/* Badge 2: If user is NOT yet paid, show "Tavsiya etiladi" on Pro. If paid, hide it completely! */}
                    {!isPaidCustomer && isPro && !isCurrent && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-3.5 py-1 rounded-full shadow-lg shadow-violet-500/30">
                        Tavsiya etiladi
                      </span>
                    )}

                    {/* Card Header */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-inner ${
                            isPro
                              ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                              : isStandard
                              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                              : 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          <Icon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-gray-900 dark:text-white">{plan.name}</h3>
                          <span className="text-[11px] font-medium text-gray-500 dark:text-slate-400">
                            {plan.tier === 'free'
                              ? 'Sinov uchun'
                              : plan.tier === 'standard'
                              ? 'Yaratuvchilar uchun'
                              : 'Professional & Kanallar'}
                          </span>
                        </div>
                      </div>

                      {/* Price Display */}
                      <div className="pt-1">
                        {plan.discounted_price && plan.price > 0 && billingCycle === 'monthly' ? (
                          <div className="flex flex-col">
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl sm:text-4xl font-black text-amber-500 tracking-tight">
                                {plan.discounted_price.toLocaleString('uz-UZ')}
                              </span>
                              <span className="text-base font-bold text-gray-400 line-through">
                                {plan.price.toLocaleString('uz-UZ')}
                              </span>
                              <span className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-slate-400">
                                so&apos;m/oy
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                              10% ilk video chegirmasi faol!
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tight">
                              {plan.price === 0 ? 'Bepul' : (monthlyEquivalent ?? plan.price).toLocaleString('uz-UZ')}
                            </span>
                            {plan.price > 0 && (
                              <span className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-slate-400">
                                so&apos;m/oy
                              </span>
                            )}
                          </div>
                        )}

                        {monthlyEquivalent !== null && (
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                            Yillik to'lov: {plan.price.toLocaleString('uz-UZ')} so'm
                          </p>
                        )}

                        {/* Unit price callout */}
                        {perMinuteCost > 0 ? (
                          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-500/20">
                            <span>~{perMinuteCost} so'm / daqiqa</span>
                            {isStandard && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">— eng qulay!</span>}
                          </div>
                        ) : (
                          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-500/10 text-gray-600 dark:text-gray-300 text-xs font-bold border border-gray-500/20">
                            <span>0 so'm / har oy 5 daqiqa</span>
                          </div>
                        )}
                      </div>

                      {/* Feature Checklist */}
                      <ul className="space-y-2.5 text-xs sm:text-sm text-gray-600 dark:text-slate-300 pt-3 border-t border-black/5 dark:border-white/10">
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                          <span>
                            <strong className="text-gray-900 dark:text-white">Oyiga {plan.monthly_minutes} daqiqa</strong> oylik kvota (oy oxirida yangilanadi)
                          </span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                          <span>1 video — maksimal 120 daqiqagacha</span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                          <span>{plan.priority ? 'Ustuvor yuqori tezlikdagi navbat' : 'Standart qayta ishlash navbati'}</span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                          <span>{isPro ? 'Studiya darajasidagi Azure TTS ovozlar' : 'Tabiiy, tiniq AI ovozlar'}</span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                          <span>Video sifati: <strong className="text-gray-900 dark:text-white">{plan.max_resolution}</strong> gacha</span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                          <span>Video tahlil va xulosalar — cheklovsiz</span>
                        </li>
                      </ul>
                    </div>

                    {/* Bottom CTA & Payment Buttons */}
                    <div className="pt-6 space-y-2">
                      <button
                        onClick={() => plan.id !== 'free' && handleSubscribe(plan.id, 'click')}
                        disabled={plan.id === 'free' || isCurrent || subscribing === plan.id}
                        className={`w-full py-3 rounded-2xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-sm ${
                          plan.id === 'free' || isCurrent
                            ? 'bg-black/5 dark:bg-white/5 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-95 shadow-lg shadow-violet-600/25'
                        }`}
                      >
                        {subscribing === plan.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Kutilmoqda...
                          </>
                        ) : isCurrent ? (
                          'Joriy tarif'
                        ) : plan.id === 'free' ? (
                          'Bepul tarif'
                        ) : (
                          'Click orqali to\'lash'
                        )}
                      </button>

                      {plan.id !== 'free' && !isCurrent && (
                        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                          <button
                            onClick={() => handleSubscribe(plan.id, 'payme')}
                            disabled={subscribing === plan.id}
                            className="py-2 px-1 rounded-xl font-bold text-[11px] text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition text-center truncate bg-white/50 dark:bg-white/[0.02]"
                          >
                            Payme
                          </button>
                          <button
                            onClick={() => handleSubscribe(plan.id, 'uzum')}
                            disabled={subscribing === plan.id}
                            className="py-2 px-1 rounded-xl font-bold text-[11px] text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition text-center truncate bg-white/50 dark:bg-white/[0.02]"
                          >
                            Uzum
                          </button>
                          <button
                            onClick={() => handleSubscribe(plan.id, 'paynet')}
                            disabled={subscribing === plan.id}
                            className="py-2 px-1 rounded-xl font-bold text-[11px] text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition text-center truncate bg-white/50 dark:bg-white/[0.02]"
                          >
                            Paynet
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {/* Kuymaydigan Daqiqa Paketlari (Minute Packs) */}
        <div id="minute-packs" className="space-y-6 pt-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              <Check className="w-3.5 h-3.5" />
              <span>Muddatsiz va Kuymas Paketlar</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
              Kuymaydigan Daqiqa Paketlari
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 max-w-xl mx-auto">
              Obunasiz yoki obunangizga qo'shimcha tarzda oling. Bir martalik to'lov — xarid qilingan daqiqalar <strong className="text-emerald-600 dark:text-emerald-400">hech qachon kuymaydi</strong>, keyingi oylarga cheklovsiz o'tadi!
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 items-stretch">
            {packs.map((p) => {
              const isStarter = p.minutes === 15
              const isPopular = p.minutes === 70
              const isBestValue = p.minutes === 350
              const isAlreadyBought = Boolean(isStarter && p.already_purchased)
              const perMin = Math.round(p.price / p.minutes)

              return (
                <div
                  key={p.minutes}
                  className={`rounded-3xl border transition duration-200 ${
                    isStarter
                      ? 'border-emerald-500/50 bg-emerald-500/[0.04]'
                      : isPopular
                      ? 'border-violet-500/50 bg-violet-500/[0.04]'
                      : isBestValue
                      ? 'border-amber-500/50 bg-amber-500/[0.04]'
                      : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/[0.03]'
                  } backdrop-blur p-4 flex flex-col justify-between items-center text-center relative h-full`}
                >
                  {/* Top Badge area */}
                  <div className="h-6 flex items-center justify-center w-full mb-1">
                    {isStarter ? (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        Starter (1 marta)
                      </span>
                    ) : isPopular ? (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30">
                        Eng mashhur
                      </span>
                    ) : isBestValue ? (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                        Eng tejamkor
                      </span>
                    ) : (
                      <span className="h-4 block" aria-hidden="true" />
                    )}
                  </div>

                  {/* Value and Price */}
                  <div className="flex flex-col items-center justify-center my-auto py-2">
                    <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                      +{p.minutes}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-slate-500 font-semibold mt-0.5">
                      daqiqa
                    </span>
                    {p.discounted_price ? (
                      <div className="flex flex-col items-center mt-2">
                        <span className="text-sm font-bold text-amber-500">
                          {p.discounted_price.toLocaleString('uz-UZ')} so&apos;m
                        </span>
                        <span className="text-[11px] text-gray-400 line-through">
                          {p.price.toLocaleString('uz-UZ')} so&apos;m
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-violet-600 dark:text-violet-400 mt-2">
                        {p.price.toLocaleString('uz-UZ')} so&apos;m
                      </span>
                    )}
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                      ~{perMin} so'm / daq
                    </span>
                  </div>

                  {/* Bottom Action Buttons */}
                  <div className="w-full space-y-1.5 mt-auto pt-2">
                    <button
                      onClick={() => handleBuyPack(p.minutes, 'click')}
                      disabled={buyingPack === p.minutes || isAlreadyBought}
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
                        className="py-1 px-0.5 rounded-lg text-[10px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Payme
                      </button>
                      <button
                        onClick={() => handleBuyPack(p.minutes, 'uzum')}
                        disabled={buyingPack === p.minutes || isAlreadyBought}
                        className="py-1 px-0.5 rounded-lg text-[10px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Uzum
                      </button>
                      <button
                        onClick={() => handleBuyPack(p.minutes, 'paynet')}
                        disabled={buyingPack === p.minutes || isAlreadyBought}
                        className="py-1 px-0.5 rounded-lg text-[10px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-black/10 dark:border-white/10 transition text-center truncate disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Paynet
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Taqqoslash Bloki: Oddiy Studiya vs GapirAI */}
        <div className="space-y-4 pt-10">
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
              Nega GapirAI tanlanadi?
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
              An'anaviy ovoz yozish studiyasi va GapirAI sun'iy intellekti solishtirmasi
            </p>
          </div>

          <div className="bg-white/80 dark:bg-white/[0.03] border border-black/5 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-xs sm:text-sm text-left">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                  <th className="p-3.5 sm:p-4 font-bold text-gray-500 dark:text-slate-400">Xususiyat</th>
                  <th className="p-3.5 sm:p-4 font-bold text-gray-400 dark:text-slate-500">Oddiy Studiya</th>
                  <th className="p-3.5 sm:p-4 font-bold text-violet-600 dark:text-violet-400 bg-violet-500/[0.06]">GapirAI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                <tr>
                  <td className="p-3.5 sm:p-4 font-medium text-gray-900 dark:text-white">1 soatlik video narxi</td>
                  <td className="p-3.5 sm:p-4 text-rose-600 dark:text-rose-400 font-semibold">250 000 — 500 000 so'm</td>
                  <td className="p-3.5 sm:p-4 text-emerald-600 dark:text-emerald-400 font-bold bg-violet-500/[0.06]">
                    ~8 400 — 15 000 so'm (95% tejash!)
                  </td>
                </tr>
                <tr>
                  <td className="p-3.5 sm:p-4 font-medium text-gray-900 dark:text-white">Tayyor bo'lish vaqti</td>
                  <td className="p-3.5 sm:p-4 text-gray-500 dark:text-slate-400">3 — 7 ish kuni</td>
                  <td className="p-3.5 sm:p-4 text-gray-900 dark:text-white font-bold bg-violet-500/[0.06]">
                    1 — 2 daqiqada tayyor
                  </td>
                </tr>
                <tr>
                  <td className="p-3.5 sm:p-4 font-medium text-gray-900 dark:text-white">Daqiqalar muddati</td>
                  <td className="p-3.5 sm:p-4 text-gray-500 dark:text-slate-400">Mavjud emas</td>
                  <td className="p-3.5 sm:p-4 text-emerald-600 dark:text-emerald-400 font-bold bg-violet-500/[0.06]">
                    Paketlar kuymaydi (muddatsiz) • Obunada oylik kvota
                  </td>
                </tr>
                <tr>
                  <td className="p-3.5 sm:p-4 font-medium text-gray-900 dark:text-white">Video tahlil va xulosalar</td>
                  <td className="p-3.5 sm:p-4 text-gray-500 dark:text-slate-400">Qo'shimcha to'lov</td>
                  <td className="p-3.5 sm:p-4 text-gray-900 dark:text-white font-bold bg-violet-500/[0.06]">
                    100% tekin va avtomatik
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 100% Qoniqish Kafolati Banneri */}
        <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/25 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
              100% Xavfsiz To'lov va Qoniqish Kafolati
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
              Barcha to'lovlar Click, Payme, Uzum va Paynet orqali rasmiy fiskal soliq cheki bilan qabul qilinadi. Agar video qayta ishlashda texnik nosozlik kuzatilsa, sarflangan daqiqangiz <strong className="text-emerald-600 dark:text-emerald-400">100% to'liq balansingizga avtomatik qaytariladi</strong>.
            </p>
          </div>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-4 pt-6">
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
              Ko'p beriladigan savollar
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
              Tariflar va daqiqa paketlari bo'yicha muhim ma'lumotlar
            </p>
          </div>

          <div className="space-y-2.5 max-w-3xl mx-auto">
            {[
              {
                q: "Obunadagi daqiqalar oy oxirida nima bo'ladi (kuyadimi)?",
                a: "Ha, obuna (Standart, Pro) har oy uchun ajratiladigan oylik kvotadir va yangi to'lov davrida yangilanadi (foydalanilmagan qoldiq keyingi oyga o'tmaydi, ya'ni kuyadi). Agar sizga muddatsiz, hech qachon kuymaydigan daqiqalar kerak bo'lsa, 'Kuymaydigan Daqiqa Paketlari' bo'limidan bir martalik paket xarid qilishingiz mumkin — ularning muddati cheksiz!",
              },
              {
                q: "Alohida xarid qilingan daqiqa paketlari qachondir kuydimi yoki o'chib ketadimi?",
                a: "Yo'q! Paket sifatida sotib olingan barcha daqiqalar (Starter, 35, 70, 140, 350 daqiqa) hech qachon kuymaydi. Ular hisobingizda muddatsiz saqlanadi va obunangiz tugasa ham saqlanib qoladi.",
              },
              {
                q: "Oylik obunadagi daqiqalar bilan paket daqiqalari qanday sarflanadi?",
                a: "Tizim har doim foydalanuvchi foydasiga ishlaydi: avval oylik obuna bergan daqiqalar ishlatiladi (chunki ular oy oxirida yangilanadi). Agar oylik kvota tugasa, xarid qilingan kuymas paket daqiqalaringiz sarflana boshlaydi.",
              },
              {
                q: "Video davomiyligi qanday hisoblanadi?",
                a: "Faqat videoning haqiqiy uzunligi (masalan: 12 daqiqa 40 soniya) hisoblanadi. Hech qanday yashirin ortiqcha yaxlitlash yoki qo'shimcha to'lovlar olinmaydi.",
              },
              {
                q: "To'lovlar qanday tizimlar orqali amalga oshiriladi?",
                a: "Siz Click, Payme, Uzum Bank yoki Paynet orqali o'zingizning Uzcard, Humo yoki Visa kartangiz bilan to'lov qilishingiz mumkin. Har bir to'lovga rasmiy elektron chek taqdim etiladi.",
              },
              {
                q: "Obunani bekor qilish yoki boshqa tarifga o'tish mumkinmi?",
                a: "Ha, istagan vaqtda tarifingizni o'zgartirishingiz yoki to'xtatishingiz mumkin. Hech qanday majburiy bog'lanish yoki jarimalar mavjud emas.",
              },
            ].map((faq, idx) => {
              const isOpen = openFaq === idx
              return (
                <div
                  key={idx}
                  className="bg-white/80 dark:bg-white/[0.03] border border-black/5 dark:border-white/10 rounded-2xl overflow-hidden transition"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-4 text-left flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-gray-900 dark:text-white"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180 text-violet-500' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-gray-600 dark:text-slate-300 leading-relaxed border-t border-black/5 dark:border-white/5">
                      {faq.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <DonateCTA variant="line" className="pt-2 pb-6" />
      </div>

      {/* Uzum Account Modal */}
      {uzumAccount && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setUzumAccount(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-[#1b1b20]"
            onClick={(e) => e.stopPropagation()}
          >
            <UzumAccountCard
              account={uzumAccount.account}
              amount={uzumAccount.amount}
              deeplink={uzumAccount.deeplink}
            />
            <button
              onClick={() => setUzumAccount(null)}
              className="mt-3 w-full rounded-xl bg-black/5 py-2.5 text-sm font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300"
            >
              Yopish
            </button>
          </div>
        </div>
      )}

      {/* Paynet Order Modal */}
      {paynetOrder && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPaynetOrder(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-[#1b1b20]"
            onClick={(e) => e.stopPropagation()}
          >
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

      {/* Insufficient Minutes Modal */}
      {showInsufficientMinutes && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowInsufficientMinutes(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-[#1b1b20]"
            onClick={(e) => e.stopPropagation()}
          >
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
                  const rec = shortfallMinutes
                    ? packs.find((p) => p.minutes >= shortfallMinutes) || packs[packs.length - 1]
                    : packs[0]
                  const recPlan = shortfallMinutes
                    ? shortfallMinutes <= 350
                      ? plans.find((p) => p.id === 'standard') || {
                          id: 'standard',
                          name: 'Standart',
                          monthly_minutes: 350,
                          price: 49000,
                        }
                      : plans.find((p) => p.id === 'pro') || {
                          id: 'pro',
                          name: 'Pro',
                          monthly_minutes: 600,
                          price: 199000,
                        }
                    : null
                  return rec ? (
                    <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <p>
                        Tavsiya etilgan paket:{' '}
                        <strong className="text-violet-600 dark:text-violet-400">+{rec.minutes} daqiqa</strong> (
                        {rec.price.toLocaleString('uz-UZ')} so'm). Ortib qolgan daqiqalar kuymaydi!
                      </p>
                      {recPlan && (
                        <p>
                          Yoki oylik tejamkorlik uchun{' '}
                          <strong className="text-indigo-600 dark:text-indigo-400">{recPlan.name} tarifiga</strong> (
                          {recPlan.monthly_minutes} daqiqa/oy — {recPlan.price.toLocaleString('uz-UZ')} so'm)
                          o'tishingiz mumkin.
                        </p>
                      )}
                    </div>
                  ) : null
                })()}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                Bu videoni dublyaj qilish uchun oylik byudjetingiz yetmayapti. Qo'shimcha daqiqa paketini sotib oling —
                kuymaydi, muddatsiz saqlanadi.
              </p>
            )}

            <button
              onClick={scrollToPacks}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-bold text-white transition hover:opacity-90 shadow-lg shadow-violet-500/25"
            >
              Qo'shimcha kuymas daqiqa olish
            </button>

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
  { minutes: 15, price: 4900, one_time: true },
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
  )
}

const DEFAULT_PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Bepul',
    price: 0,
    monthly_minutes: 5,
    priority: false,
    tts_tier: 'edge',
    tier: 'free',
    period_days: 30,
    max_resolution: '360p',
  },
  {
    id: 'standard',
    name: 'Standart',
    price: 49000,
    monthly_minutes: 350,
    priority: false,
    tts_tier: 'edge',
    tier: 'standard',
    period_days: 30,
    max_resolution: '720p',
  },
  {
    id: 'standard_yearly',
    name: 'Standart (yillik)',
    price: 490000,
    monthly_minutes: 350,
    priority: false,
    tts_tier: 'edge',
    tier: 'standard',
    period_days: 365,
    max_resolution: '720p',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 199000,
    monthly_minutes: 600,
    priority: true,
    tts_tier: 'premium',
    tier: 'pro',
    period_days: 30,
    max_resolution: '1080p',
  },
  {
    id: 'pro_yearly',
    name: 'Pro (yillik)',
    price: 1990000,
    monthly_minutes: 600,
    priority: true,
    tts_tier: 'premium',
    tier: 'pro',
    period_days: 365,
    max_resolution: '1080p',
  },
]
