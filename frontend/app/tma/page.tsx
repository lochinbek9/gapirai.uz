'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import {
  Youtube, Loader2, CheckCircle2, XCircle, Clock, Download, Sparkles,
} from 'lucide-react'
import {
  createJob, listJobs, Job, STATUS_LABELS, formatDuration, getDownloadUrl,
} from '@/lib/api'
import { useTma } from './TmaProvider'

const ACTIVE_STATUSES = new Set([
  'pending', 'downloading', 'transcribing', 'translating', 'syncing', 'synthesizing', 'merging',
])

function looksLikeYoutube(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url.trim())
}

function JobRow({ job, onDownload }: { job: Job; onDownload: (j: Job) => void }) {
  const active = ACTIVE_STATUSES.has(job.status)
  const done = job.status === 'completed'
  const failed = job.status === 'failed'

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3.5 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {done ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : failed ? <XCircle className="h-5 w-5 text-red-500" />
            : <Loader2 className="h-5 w-5 animate-spin text-violet-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{job.video_title || 'Video'}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {STATUS_LABELS[job.status] || job.status}
            {job.video_duration ? ` · ${formatDuration(job.video_duration)}` : ''}
          </p>
          {active && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.max(3, job.progress || 0)}%` }} />
            </div>
          )}
          {failed && job.error_message && (
            <p className="mt-1 text-xs text-red-500">{job.error_message}</p>
          )}
        </div>
        {done && (
          <button
            onClick={() => onDownload(job)}
            className="shrink-0 rounded-xl bg-violet-500 px-3 py-1.5 text-xs font-bold text-white active:scale-95"
          >
            <Download className="mr-1 inline h-3.5 w-3.5" />
            Yuklab olish
          </button>
        )}
      </div>
    </div>
  )
}

export default function TmaHome() {
  const { user, webApp } = useTma()
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      setJobs(await listJobs())
    } catch {
      /* ignore transient */
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Faol job bo'lsa har 5s yangilab turadi.
  useEffect(() => {
    const hasActive = jobs.some((j) => ACTIVE_STATUSES.has(j.status))
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(refresh, 5000)
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [jobs, refresh])

  async function submit() {
    setError(null)
    setNotice(null)
    const value = url.trim()
    if (!looksLikeYoutube(value)) {
      setError('YouTube havolasini kiriting.')
      return
    }
    setSubmitting(true)
    try {
      await createJob(value)
      setUrl('')
      setNotice('Navbatga qo‘shildi. Tayyor bo‘lganda shu yerda ko‘rasiz.')
      webApp.HapticFeedback?.notificationOccurred('success')
      refresh()
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data?.detail
        if (e.response?.status === 402) {
          setError(typeof d === 'object' ? d?.message : 'Daqiqa yetishmayapti. Tarifni yangilang.')
        } else if (e.response?.status === 429) {
          setError(typeof d === 'string' ? d : 'Kunlik dublyaj chegarasiga yetdingiz.')
        } else {
          setError(typeof d === 'string' ? d : 'Xatolik yuz berdi. Qayta urinib ko‘ring.')
        }
      } else {
        setError('Xatolik yuz berdi.')
      }
      webApp.HapticFeedback?.notificationOccurred('error')
    } finally {
      setSubmitting(false)
    }
  }

  function download(job: Job) {
    webApp.openLink(getDownloadUrl(job.job_id))
  }

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <header className="mb-5 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-violet-500" />
        <h1 className="text-lg font-black">GapirAI</h1>
        <span className="ml-auto text-xs text-gray-400">{user.name}</span>
      </header>

      <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
        <label className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
          <Youtube className="h-3.5 w-3.5" /> YouTube havolasi
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          inputMode="url"
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 dark:border-white/15 dark:bg-white/5"
        />
        <button
          onClick={submit}
          disabled={submitting}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Dublyaj qilish
        </button>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        {notice && <p className="mt-2 text-xs text-green-600 dark:text-green-400">{notice}</p>}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
          <Clock className="h-3.5 w-3.5" /> Videolarim
        </h2>
        <div className="space-y-2.5">
          {jobs.length === 0 && (
            <p className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400 dark:border-white/10">
              Hali video yo‘q. Yuqoridan havola yuboring.
            </p>
          )}
          {jobs.map((j) => (
            <JobRow key={j.job_id} job={j} onDownload={download} />
          ))}
        </div>
      </section>
    </div>
  )
}
