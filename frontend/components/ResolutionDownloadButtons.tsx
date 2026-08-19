'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Loader2, Lock, RotateCw } from 'lucide-react'
import { getJobResolutions, requestResolution, ResolutionOption } from '@/lib/api'

interface ResolutionDownloadButtonsProps {
  jobId: string
}

const POLL_INTERVAL_MS = 4000

function triggerDownload(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function ResolutionDownloadButtons({ jobId }: ResolutionDownloadButtonsProps) {
  const [resolutions, setResolutions] = useState<ResolutionOption[] | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const refresh = async () => {
    try {
      const res = await getJobResolutions(jobId)
      setResolutions(res.resolutions)
      return res.resolutions
    } catch {
      return null
    }
  }

  useEffect(() => {
    refresh()
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const startPolling = (resolution: string) => {
    if (pollTimers.current[resolution]) return
    pollTimers.current[resolution] = setInterval(async () => {
      const updated = await refresh()
      const opt = updated?.find((r) => r.resolution === resolution)
      if (opt && (opt.status === 'ready' || opt.status === 'failed')) {
        clearInterval(pollTimers.current[resolution])
        delete pollTimers.current[resolution]
        setBusy((b) => ({ ...b, [resolution]: false }))
      }
    }, POLL_INTERVAL_MS)
  }

  const handleClick = async (opt: ResolutionOption) => {
    if (!opt.available) return
    setBusy((b) => ({ ...b, [opt.resolution]: true }))
    try {
      const res = await requestResolution(jobId, opt.resolution)
      if (res.status === 'ready' && res.download_url) {
        triggerDownload(res.download_url)
        setBusy((b) => ({ ...b, [opt.resolution]: false }))
        refresh()
      } else {
        startPolling(opt.resolution)
        refresh()
      }
    } catch {
      setBusy((b) => ({ ...b, [opt.resolution]: false }))
    }
  }

  if (!resolutions) {
    return (
      <div className="inline-flex items-center gap-2 text-slate-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Sifat variantlari yuklanmoqda...
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {resolutions.map((opt) => {
          const isBusy = busy[opt.resolution] || opt.status === 'processing'
          const isReady = opt.status === 'ready'
          const isFailed = opt.status === 'failed'

          if (!opt.available) {
            return (
              <Link
                key={opt.resolution}
                href="/pricing"
                className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-400 px-5 py-3 rounded-xl font-bold border border-white/10 transition"
                title="Bu sifat yuqoriroq tarif rejasida mavjud"
              >
                <Lock className="w-4 h-4" />
                {opt.resolution}
              </Link>
            )
          }

          return (
            <button
              key={opt.resolution}
              onClick={() => handleClick(opt)}
              disabled={isBusy}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition hover:scale-105 disabled:hover:scale-100"
            >
              {isBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isFailed ? (
                <RotateCw className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {opt.resolution}
              {isBusy && !isReady && (
                <span className="text-xs font-normal text-blue-100">tayyorlanmoqda...</span>
              )}
              {isFailed && !isBusy && (
                <span className="text-xs font-normal text-blue-100">qayta urinish</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
