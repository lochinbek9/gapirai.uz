'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { listJobs, deleteJob, Job, STATUS_LABELS, formatDuration, getVideoUrl, getPlans, subscribeToPlan, CurrentSubscription } from '@/lib/api'
import PushOptIn from '@/components/PushOptIn'
import BillingCard from '@/components/billing/BillingCard'
import DonateCTA from '@/components/DonateCTA'
import {
  Youtube, Plus, LogOut, Clock, CheckCircle2, XCircle,
  Loader2, Trash2, Play, User2, Mic2, MicOff, Crown
} from 'lucide-react'

const PLAN_NAMES: Record<string, string> = { free: 'Bepul', standard: 'Standart', pro: 'Pro' }

function PlanCard({ sub, onRenew, renewing }: { sub: CurrentSubscription | null; onRenew: () => void; renewing: boolean }) {
  if (!sub) return null
  const planName = PLAN_NAMES[sub.plan] || sub.plan
  const expiresSoon = sub.expires_at && new Date(sub.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5 border border-black/5 dark:border-white/5 shadow-inner flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5" />
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase tracking-wider">Joriy tarif</p>
          <p className="text-lg font-black text-gray-900 dark:text-white">{planName}</p>
        </div>
        <div className="sm:ml-3 text-xs text-gray-500 dark:text-gray-400 space-y-0.5 w-full sm:w-auto">
          {sub.minutes && (
            <>
              <p>
                <span className="font-bold text-gray-800 dark:text-gray-200">{sub.minutes.monthly_remaining}</span>
                {' / '}{sub.minutes.monthly_cap} daqiqa qoldi (oylik)
              </p>
              {sub.minutes.purchased > 0 && (
                <p className="text-violet-500 dark:text-violet-400 font-semibold">
                  + {sub.minutes.purchased} sotib olingan daqiqa
                </p>
              )}
            </>
          )}
          {sub.plan !== 'free' && sub.expires_at && (
            <p className={expiresSoon ? 'text-amber-500 font-bold' : ''}>
              {new Date(sub.expires_at).toLocaleDateString('uz-UZ')} gacha
            </p>
          )}
        </div>
      </div>
      <Link
        href="/pricing"
        onClick={sub.plan !== 'free' && expiresSoon ? (e) => { e.preventDefault(); onRenew() } : undefined}
        className="flex items-center justify-center gap-2 btn-premium text-xs font-bold px-4 py-2.5 rounded-xl shadow-md w-full sm:w-auto"
      >
        {renewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
        {sub.plan === 'free' ? "Tarifni oshirish" : expiresSoon ? 'Yangilash' : 'Tariflarni ko\'rish'}
      </Link>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; icon: React.ReactNode }> = {
    completed: { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: <XCircle className="w-3 h-3" /> },
    pending: { color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', icon: <Clock className="w-3 h-3" /> },
  }
  const def = { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: <Loader2 className="w-3 h-3 animate-spin" /> }
  const { color, icon } = cfg[status] || def
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${color}`}>
      {icon}
      {STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}
    </span>
  )
}

function VideoCard({ job, onDelete }: { job: Job; onDelete: (id: string) => void }) {
  const thumbnail = job.video_thumbnail || `https://img.youtube.com/vi/${job.job_id}/mqdefault.jpg`
  const duration = job.video_duration ? formatDuration(job.video_duration) : '--:--'
  const isReady = job.status === 'completed'

  return (
    <div className="group glass-card hover:translate-y-[-2px] hover:shadow-xl hover:border-indigo-500/20 rounded-2xl overflow-hidden transition-all duration-300">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black/10 dark:bg-slate-900/60 overflow-hidden">
        {job.video_thumbnail ? (
          <img src={thumbnail} alt={job.video_title || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black/5 dark:bg-white/[0.02]">
            <Youtube className="w-12 h-12 text-slate-400 dark:text-slate-700" />
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-2.5 right-2.5 bg-black/75 text-white text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold tracking-tighter">
          {duration}
        </div>
        {/* Play overlay */}
        {isReady && (
          <Link href={`/video/${job.job_id}`} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
            <div className="w-12 h-12 bg-white/95 rounded-2xl flex items-center justify-center shadow-lg transition transform translate-y-2 group-hover:translate-y-0 duration-300">
              <Play className="w-5 h-5 text-indigo-600 fill-indigo-600 ml-0.5" />
            </div>
          </Link>
        )}
        {/* Gender badge */}
        {job.speaker_gender && (
          <div className="absolute top-2.5 left-2.5 bg-black/70 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-sm">
            {job.speaker_gender === 'female' ? <Mic2 className="w-3 h-3 text-pink-400" /> : <Mic2 className="w-3 h-3 text-indigo-400" />}
            {job.speaker_gender === 'female' ? 'Ayol' : 'Erkak'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-gray-900 dark:text-white font-bold text-sm line-clamp-2 mb-3 min-h-[2.5rem]">
          {job.video_title || 'Yuklanmoqda...'}
        </h3>
        <div className="flex items-center justify-between">
          <StatusBadge status={job.status} />
          <div className="flex items-center gap-2">
            {isReady && (
              <Link
                href={`/video/${job.job_id}`}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-bold"
              >
                Ko'rish →
              </Link>
            )}
            <button
              onClick={() => onDelete(job.job_id)}
              className="text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 transition p-1.5 rounded-xl"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null)
  const [renewing, setRenewing] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      listJobs()
        .then(setJobs)
        .catch(console.error)
        .finally(() => setJobsLoading(false))

      getPlans().then((res) => setSubscription(res.current)).catch(console.error)

      const interval = setInterval(() => {
        listJobs().then(setJobs).catch(console.error)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [user])

  async function handleRenew() {
    if (!subscription || subscription.plan === 'free') return
    setRenewing(true)
    const paymentWindow = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
    try {
      const res = await subscribeToPlan(subscription.plan)
      if (res.success && res.payment_url) {
        if (paymentWindow) paymentWindow.location.href = res.payment_url
        else window.location.href = res.payment_url
      } else if (paymentWindow) {
        paymentWindow.close()
      }
    } catch {
      if (paymentWindow) paymentWindow.close()
    } finally {
      setRenewing(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu videoni o'chirishni tasdiqlaysizmi?")) return
    await deleteJob(id)
    setJobs((prev) => prev.filter((j) => j.job_id !== id))
  }

  function handleLogout() {
    logout()
    router.push('/')
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#050101] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  const completedCount = jobs.filter(j => j.status === 'completed').length
  const processingCount = jobs.filter(j => !['completed', 'failed'].includes(j.status)).length

  return (
    <div className="min-h-screen relative flex flex-col transition-colors duration-300">
      <MeshBackground />

      {/* Header */}
      <header className="border-b border-black/5 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-xl sticky top-0 z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 group shrink-0">
            <img src="/logo.webp" alt="GapirAI.uz" width={120} height={32} className="h-8 sm:h-12 md:h-16 w-auto object-contain dark:hidden transition duration-300 group-hover:scale-105" />
            <img src="/logodark.webp" alt="GapirAI.uz" width={120} height={32} className="h-8 sm:h-12 md:h-16 w-auto object-contain hidden dark:block transition duration-300 group-hover:scale-105" />
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-gray-600 dark:text-gray-300 transition-colors">
              <User2 className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-xs font-bold truncate max-w-[120px]">{user.name}</span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 sm:gap-2 btn-premium text-xs font-bold px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-md whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline">Yangi video</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 sm:gap-2 text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 text-xs font-bold transition px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline">Chiqish</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-6 sm:py-8 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-6 mb-6 sm:mb-8">
          <div className="glass-card rounded-2xl p-3 sm:p-5 border border-black/5 dark:border-white/5 shadow-inner">
            <p className="text-gray-500 dark:text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Jami</p>
            <p className="text-xl sm:text-3xl font-black text-gray-900 dark:text-white">{jobs.length}</p>
          </div>
          <div className="glass-card rounded-2xl p-3 sm:p-5 border border-black/5 dark:border-white/5 shadow-inner">
            <p className="text-gray-500 dark:text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Tayyor</p>
            <p className="text-xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">{completedCount}</p>
          </div>
          <div className="glass-card rounded-2xl p-3 sm:p-5 border border-black/5 dark:border-white/5 shadow-inner">
            <p className="text-gray-500 dark:text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Jarayonda</p>
            <p className="text-xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">{processingCount}</p>
          </div>
        </div>

        <PlanCard sub={subscription} onRenew={handleRenew} renewing={renewing} />
        <BillingCard />
        <PushOptIn />
        <DonateCTA className="mb-6" />

        <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-6 transition-colors">Mening videolarim</h1>

        {/* Grid */}
        {jobsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 glass-card rounded-3xl p-8 border border-black/5 dark:border-white/5">
            <Youtube className="w-16 h-16 text-gray-300 dark:text-slate-800 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-500 dark:text-gray-400 font-bold mb-2">Hali video yo'q</p>
            <Link href="/" className="text-blue-500 hover:underline text-xs font-bold uppercase tracking-wider">
              Birinchi videoni dublyaj qiling →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {jobs.map((job) => (
              <VideoCard key={job.job_id} job={job} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
