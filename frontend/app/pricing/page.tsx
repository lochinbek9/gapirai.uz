'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Crown, Loader2, Sparkles, Zap } from 'lucide-react'
import { getPlans, subscribeToPlan, PlanDef, CurrentSubscription } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

const PLAN_ICONS: Record<string, any> = { free: Sparkles, standard: Zap, pro: Crown }

export default function PricingPage() {
  const router = useRouter()
  const { isLoggedIn, loading: authLoading } = useAuth()
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [current, setCurrent] = useState<CurrentSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    getPlans()
      .then((res) => {
        setPlans(res.plans)
        setCurrent(res.current)
      })
      .catch(() => setError("Tariflarni yuklashda xatolik yuz berdi."))
      .finally(() => setLoading(false))
  }, [authLoading])

  const handleSubscribe = async (planId: string) => {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setSubscribing(planId)
    setError(null)
    const paymentWindow = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
    try {
      const res = await subscribeToPlan(planId)
      if (res.success && res.payment_url) {
        if (paymentWindow) paymentWindow.location.href = res.payment_url
        else window.location.href = res.payment_url
      } else {
        if (paymentWindow) paymentWindow.close()
        setError("To'lov havolasini yaratishda xatolik yuz berdi.")
      }
    } catch {
      if (paymentWindow) paymentWindow.close()
      setError("To'lov havolasini yaratishda xatolik yuz berdi.")
    } finally {
      setSubscribing(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-12 px-4 sm:px-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/3 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-5xl z-10 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition duration-200">
          <ArrowLeft className="w-4 h-4" /> Bosh sahifaga qaytish
        </Link>

        <div className="text-center space-y-3">
          <h1 className="text-2xl sm:text-3xl font-black">Tarif rejalari</h1>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            45 daqiqadan qisqa videolar har doim bepul. Uzunroq videolarni tez-tez dublyaj qilsangiz, oylik tarif arzonroq bo'ladi.
          </p>
        </div>

        {!isLoggedIn && !authLoading && (
          <p className="text-center text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 max-w-md mx-auto">
            Tarifga obuna bo'lish uchun{' '}
            <Link href="/login" className="underline hover:text-amber-300">kiring</Link>
            {' '}yoki{' '}
            <Link href="/register" className="underline hover:text-amber-300">ro'yxatdan o'ting</Link>.
          </p>
        )}

        {error && (
          <p className="text-center text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 max-w-md mx-auto">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-violet-400" /></div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-5">
            {(plans.length ? plans : DEFAULT_PLANS).map((plan) => {
              const Icon = PLAN_ICONS[plan.id] || Sparkles
              const isCurrent = current?.plan === plan.id
              const isPro = plan.id === 'pro'
              return (
                <div
                  key={plan.id}
                  className={`relative bg-slate-900/50 border rounded-[28px] p-6 flex flex-col gap-5 backdrop-blur-xl ${
                    isPro ? 'border-violet-500/50 shadow-[0_0_40px_-10px] shadow-violet-500/30' : 'border-slate-800/80'
                  }`}
                >
                  {isPro && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest bg-violet-500 text-white px-3 py-1 rounded-full">
                      Tavsiya etiladi
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black">{plan.name}</h3>
                      {isCurrent && <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Joriy tarif</span>}
                    </div>
                  </div>

                  <div>
                    <span className="text-3xl font-black">{plan.price === 0 ? 'Bepul' : plan.price.toLocaleString('uz-UZ')}</span>
                    {plan.price > 0 && <span className="text-sm text-slate-400"> so'm/oy</span>}
                  </div>

                  <ul className="space-y-2.5 text-sm text-slate-300 flex-1">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400 shrink-0" /> Oyiga {plan.videos_per_period} ta video, {plan.free_minutes} daqiqagacha</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400 shrink-0" /> {plan.priority ? 'Ustuvor navbat' : 'Standart navbat'}</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400 shrink-0" /> {plan.tts_tier === 'premium' ? 'Premium ovoz sifati' : "Standart ovoz (Edge)"}</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400 shrink-0" /> Video tahlil — cheklovsiz</li>
                  </ul>

                  <button
                    onClick={() => plan.id !== 'free' && handleSubscribe(plan.id)}
                    disabled={plan.id === 'free' || isCurrent || subscribing === plan.id}
                    className={`w-full py-3 rounded-2xl font-bold text-sm transition flex items-center justify-center gap-2 ${
                      plan.id === 'free' || isCurrent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90'
                    }`}
                  >
                    {subscribing === plan.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Kutilmoqda...</>
                    ) : isCurrent ? 'Joriy tarif' : plan.id === 'free' ? "Hozirgi tarif" : 'Tanlash'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

// Login qilinmagan foydalanuvchiga ham tarif tuzilmasini ko'rsatish uchun
// (backend /api/plans login talab qiladi) — narxlar backend/services/plans.py
// bilan bir xil, faqat ko'rsatish uchun.
const DEFAULT_PLANS: PlanDef[] = [
  { id: 'free', name: 'Bepul', price: 0, videos_per_period: 1, free_minutes: 45, priority: false, tts_tier: 'edge' },
  { id: 'standard', name: 'Standart', price: 49000, videos_per_period: 5, free_minutes: 60, priority: false, tts_tier: 'edge' },
  { id: 'pro', name: 'Pro', price: 149000, videos_per_period: 20, free_minutes: 90, priority: true, tts_tier: 'premium' },
]
