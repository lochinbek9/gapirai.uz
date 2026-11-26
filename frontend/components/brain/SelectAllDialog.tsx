'use client'
import { useEffect, useRef } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { BrainBoardState } from '@/hooks/useBrainBoard'

export interface SelectAllResult { analysisId: string; title: string; keys: string[] }

/** "Hammasini tanlab, vazifa yaratish" bosilgach: jarayon va natija */
export default function SelectAllDialog({ result, state, onClose, onShowTasks }: {
  result: SelectAllResult; state: BrainBoardState; onClose: () => void; onShowTasks: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal() }, [])

  const mine = (x: { analysis_id: string | null; idea_key: string | null }) =>
    x.analysis_id === result.analysisId && result.keys.includes(x.idea_key ?? '')
  const generations = state.board?.generations.filter(mine) ?? []
  const done = generations.filter((g) => g.status === 'done').length
  const failed = generations.filter((g) => g.status === 'failed').length
  const finished = done + failed >= result.keys.length
  const count = state.board?.tasks.filter(mine).length ?? 0

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="select-all-title"
      className="ui-card m-auto w-[calc(100%-2rem)] max-w-md bg-ui-surface p-6 text-ui-ink backdrop:bg-black/50">
      <div aria-live="polite" className="flex items-start gap-3">
        {finished
          ? <CheckCircle2 aria-hidden="true" className="h-6 w-6 shrink-0 text-emerald-500" />
          : <Loader2 aria-hidden="true" className="h-6 w-6 shrink-0 animate-spin text-ui-muted" />}
        <div className="min-w-0 space-y-1">
          <h2 id="select-all-title" className="text-lg font-semibold">{finished ? 'Vazifalar tayyor' : 'Vazifalar yaratilmoqda'}</h2>
          <p className="text-sm text-ui-muted">{result.title}</p>
          <p className="text-sm">{done} / {result.keys.length} fikr tayyor · {count} ta vazifa taklifi</p>
          {failed > 0 && <p className="text-sm text-ui-red-ink">{failed} ta fikrdan vazifa chiqmadi. Kartochkadagi “Amallar”dan qayta urinib koʻring.</p>}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => ref.current?.close()} className="ui-btn ui-btn-secondary">Yopish</button>
        <button type="button" onClick={onShowTasks} className="ui-btn ui-btn-primary">Vazifalarni koʻrish</button>
      </div>
    </dialog>
  )
}
