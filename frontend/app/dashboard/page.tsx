'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { listJobs, deleteJob, Job, STATUS_LABELS, formatDuration, getVideoUrl } from '@/lib/api'
import {
  Youtube, Plus, LogOut, Clock, CheckCircle2, XCircle,
  Loader2, Trash2, Play, User2, Mic2, MicOff
} from 'lucide-react'

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; icon: React.ReactNode }> = {
    completed: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
    pending: { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: <Clock className="w-3 h-3" /> },
  }
  const def = { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: <Loader2 className="w-3 h-3 animate-spin" /> }
  const { color, icon } = cfg[status] || def
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${color}`}>
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
    <div className="group bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-2xl overflow-hidden transition-all">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-slate-800 overflow-hidden">
        {job.video_thumbnail ? (
          <img src={thumbnail} alt={job.video_title || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Youtube className="w-12 h-12 text-slate-600" />
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
          {duration}
        </div>
        {/* Play overlay */}
        {isReady && (
          <Link href={`/video/${job.job_id}`} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
            <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
              <Play className="w-6 h-6 text-slate-900 ml-1" />
            </div>
          </Link>
        )}
        {/* Gender badge */}
        {job.speaker_gender && (
          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
            {job.speaker_gender === 'female' ? <Mic2 className="w-3 h-3 text-pink-400" /> : <Mic2 className="w-3 h-3 text-blue-400" />}
            {job.speaker_gender === 'female' ? 'Ayol' : 'Erkak'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-white font-medium text-sm line-clamp-2 mb-2 min-h-[2.5rem]">
          {job.video_title || 'Yuklanmoqda...'}
        </h3>
        <div className="flex items-center justify-between">
          <StatusBadge status={job.status} />
          <div className="flex items-center gap-2">
            {isReady && (
              <Link
                href={`/video/${job.job_id}`}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                Ko'rish →
              </Link>
            )}
            <button
              onClick={() => onDelete(job.job_id)}
              className="text-slate-500 hover:text-red-400 transition p-1 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      listJobs()
        .then(setJobs)
        .catch(console.error)
        .finally(() => setJobsLoading(false))

      // Jarayondagi joblarni yangilash
      const interval = setInterval(() => {
        listJobs().then(setJobs).catch(console.error)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [user])

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  const completedCount = jobs.filter(j => j.status === 'completed').length
  const processingCount = jobs.filter(j => !['completed', 'failed'].includes(j.status)).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">AI Dubber</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-300">
              <User2 className="w-4 h-4" />
              <span className="text-sm">{user.name}</span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
            >
              <Plus className="w-4 h-4" />
              Yangi
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition"
            >
              <LogOut className="w-4 h-4" />
              Chiqish
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-slate-400 text-sm mb-1">Jami</p>
            <p className="text-3xl font-bold text-white">{jobs.length}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-slate-400 text-sm mb-1">Tayyor</p>
            <p className="text-3xl font-bold text-green-400">{completedCount}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-slate-400 text-sm mb-1">Jarayonda</p>
            <p className="text-3xl font-bold text-blue-400">{processingCount}</p>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-6">Mening videolarim</h1>

        {/* Grid */}
        {jobsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20">
            <Youtube className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg mb-2">Hali video yo'q</p>
            <Link href="/" className="text-blue-400 hover:text-blue-300">
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
