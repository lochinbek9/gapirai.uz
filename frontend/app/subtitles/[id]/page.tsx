'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PageShell from '@/components/PageShell'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
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
    <PageShell>
      <div className="mx-auto max-w-xl px-4 pb-24 pt-6 sm:px-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ui-muted transition hover:text-ui-ink">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Mening videolarim
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-ui-ink">Oʻzbekcha subtitr</h1>
        {job?.video_title && <p className="mt-1.5 line-clamp-2 text-[15px] text-ui-muted">{job.video_title}</p>}

        <div className="mt-8">
          {is404 ? (
            <p className="py-16 text-center text-[15px] text-ui-muted">Bunday subtitr topilmadi.</p>
          ) : !job ? (
            <div className="flex items-center justify-center gap-3 py-16 text-[15px] text-ui-muted" role="status">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
              {error || 'Yuklanmoqda...'}
            </div>
          ) : job.status === 'completed' ? (
            <SubtitleResult job={job} onReset={() => router.push('/')} />
          ) : job.status === 'failed' ? (
            <div className="space-y-4" role="alert">
              <div className="rounded-control border border-ui-red/30 bg-ui-red/[0.05] p-5">
                <h2 className="font-semibold text-ui-ink">Subtitr tayyor boʻlmadi</h2>
                <p className="mt-1.5 text-[15px] text-ui-muted">{job.error_message || 'Subtitr yaratib boʻlmadi.'}</p>
              </div>
              <button type="button" onClick={() => router.push('/')} className="ui-btn ui-btn-secondary w-full">
                Qayta boshlash
              </button>
            </div>
          ) : (
            <div className="ui-card flex flex-col items-center gap-3 px-6 py-14 text-center" role="status">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-ui-muted" />
              <p className="text-base font-medium text-ui-ink">{job.status_message || 'Subtitr tayyorlanmoqda...'}</p>
              <p className="max-w-xs text-sm text-ui-muted">Tayyor boʻlgach sahifa avtomatik yangilanadi.</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
