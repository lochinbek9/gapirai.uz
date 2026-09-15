'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useJobPolling } from '@/hooks/useJobPolling'
import SubtitleResult from '@/components/SubtitleResult'

/** "Subtitr" rejimi natija sahifasi (2026-09-16) -- video/[id]'dan ATAYLAB
 * alohida: u yerda pleer/rezolyutsiya/feedback kabi dublyajga xos ko'p
 * mantiq bor, subtitr-only job'lar uchun bularning hech biri tegishli emas
 * (job.output_video_url yo'q). Shu sabab StepProgress ham ishlatilmaydi --
 * u TTS/MERGE bosqichlarini ham ko'rsatadi, subtitr rejimida ular umuman
 * ishlamaydi (backend/workers/tasks.py TRANSLATE'dan keyin darhol
 * to'xtaydi) -- shunchaki job.status_message ko'rsatiladi. */
export default function SubtitlePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { job, error, is404 } = useJobPolling(id)

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white dark:from-[#15121f] dark:to-[#0f0f10]">
      <div className="mx-auto max-w-lg px-4 py-10">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 dark:text-gray-400">
          <ArrowLeft className="h-4 w-4" /> Bosh sahifa
        </Link>

        {is404 ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Job topilmadi.</p>
        ) : !job ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            <p className="text-xs text-gray-400">{error || 'Yuklanmoqda...'}</p>
          </div>
        ) : job.status === 'completed' ? (
          <SubtitleResult job={job} onReset={() => router.push('/')} />
        ) : job.status === 'failed' ? (
          <div className="space-y-4 text-center">
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6">
              <h3 className="font-bold text-red-600 dark:text-red-400 mb-2">Xatolik yuz berdi</h3>
              <p className="text-sm text-red-500/80 dark:text-red-400/80">{job.error_message || 'Subtitr yaratib bo‘lmadi.'}</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3.5 rounded-2xl border border-black/10 dark:border-white/10 text-sm font-bold text-gray-600 dark:text-gray-300"
            >
              Qayta boshlash
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-12 h-12 rounded-full border-t-2 border-violet-500 animate-spin" />
              <div className="w-8 h-8 rounded-full border-t-2 border-indigo-400 animate-spin-slow" />
            </div>
            {job.video_title && (
              <h2 className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1">{job.video_title}</h2>
            )}
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
              {job.status_message || 'Subtitr yaratilmoqda...'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
