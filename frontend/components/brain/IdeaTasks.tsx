'use client'
import { useState } from 'react'
import { Archive, ChevronDown, Loader2, Pencil, Plus, RotateCw } from 'lucide-react'
import type { BrainBoardState } from '@/hooks/useBrainBoard'
import { CopyButton, DurationBadge, ICON_BUTTON, VersionButton } from '@/components/brain/TaskTools'
import { BrainTask, archiveTask, moveTask, retryGeneration, switchTaskVersion, updateTask } from '@/lib/brain'

const INPUT = 'w-full rounded-lg border border-ui-rule bg-ui-surface p-2 text-sm text-ui-ink'

export function SuggestionRow({ task, state }: { task: BrainTask; state: BrainBoardState }) {
  const first = state.board?.columns[0]?.id
  const [draft, setDraft] = useState<{ title: string; description: string } | null>(null)

  if (draft) {
    return (
      <li className="rounded-lg border border-ui-rule p-2.5">
        <form className="space-y-2" onKeyDown={(e) => e.key === 'Escape' && setDraft(null)}
          onSubmit={async (e) => {
            e.preventDefault()
            if (!draft.title.trim()) return
            // Saqlash muvaffaqiyatsiz boʻlsa yozilgan matn yoʻqolmaydi
            if (await state.run(() => updateTask(task.id, draft))) setDraft(null)
          }}>
          <input autoFocus required aria-label="Sarlavha" value={draft.title} maxLength={200}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={`${INPUT} font-medium`} />
          <textarea aria-label="Tavsif" rows={4} value={draft.description} maxLength={5000}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={INPUT} />
          <div className="flex gap-2">
            <button type="submit" className="ui-btn ui-btn-primary">Saqlash</button>
            <button type="button" onClick={() => setDraft(null)} className="ui-btn ui-btn-secondary">Bekor qilish</button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="space-y-2 rounded-lg border border-ui-rule p-2.5">
      <div>
        <p className="break-words text-sm font-medium text-ui-ink">{task.title}</p>
        {task.description && <p className="mt-0.5 break-words text-xs leading-relaxed text-ui-muted">{task.description}</p>}
        {task.duration_minutes && <p className="mt-1 flex text-xs text-ui-muted"><DurationBadge minutes={task.duration_minutes} /></p>}
      </div>
      {task.version && <VersionButton version={task.version} onSwitch={(v) => state.run(() => switchTaskVersion(task.id, v))} />}
      <div className="flex justify-end gap-1.5">
        <button type="button" title="Tahrirlash" aria-label={`Tahrirlash: ${task.title}`} className={ICON_BUTTON}
          onClick={() => setDraft({ title: task.title, description: task.description })}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </button>
        <CopyButton title={task.title} description={task.description} />
        <button type="button" title="Arxivga" aria-label={`Arxivga: ${task.title}`} className={ICON_BUTTON}
          onClick={() => state.run(() => archiveTask(task.id))}>
          <Archive aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" title="Vazifalarga qoʻshish" aria-label={`Vazifalarga qoʻshish: ${task.title}`} disabled={!first}
          onClick={() => state.run(() => moveTask(task.id, first!))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10">
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}

/** Bitta fikrning AI takliflari: holat, doskaga qo'shish (+) va arxivlash */
export default function IdeaTasks({ analysisId, ideaKey, state }: { analysisId: string; ideaKey: string; state: BrainBoardState }) {
  // Sukut boʻyicha yigʻiq; holat fikrga bogʻlangan, boshqa fikrga oʻtganda yana yigʻiq boʻladi
  const [openFor, setOpenFor] = useState<string | null>(null)
  const id = `${analysisId}:${ideaKey}`
  const open = openFor === id
  const board = state.board
  if (!board) return null
  const mine = board.tasks.filter((t) => t.analysis_id === analysisId && t.idea_key === ideaKey && !t.archived_at)
  const suggestions = mine.filter((t) => !t.column_id)
  const accepted = mine.length - suggestions.length
  const status = board.generations.find((g) => g.analysis_id === analysisId && g.idea_key === ideaKey)?.status
  if (!status) return null
  return (
    <div className="space-y-2">
      <button type="button" aria-expanded={open} onClick={() => setOpenFor(open ? null : id)}
        className="flex w-full items-center gap-2 rounded-lg py-1 text-left text-xs font-semibold text-ui-muted hover:text-ui-ink">
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span>Vazifa takliflari{suggestions.length > 0 && ` · ${suggestions.length}`}{accepted > 0 && ` · ${accepted} tasi doskada`}</span>
        {status === 'pending' && <Loader2 aria-label="Tayyorlanmoqda" className="h-4 w-4 animate-spin" />}
        {status === 'failed' && <span className="text-red-500">· xato</span>}
      </button>
      {open && (
        <>
          {status === 'pending' && (
            <p role="status" className="flex items-center gap-2 text-sm text-ui-muted"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Tayyorlanmoqda…</p>
          )}
          {status === 'done' && suggestions.length === 0 && <p className="text-sm text-ui-muted">Yangi taklif qolmagan.</p>}
          {status === 'failed' && (
            <button type="button" onClick={() => state.run(() => retryGeneration(analysisId, ideaKey))} className="flex items-center gap-1.5 text-sm font-medium text-ui-accent-ink">
              <RotateCw aria-hidden="true" className="h-4 w-4" />Tayyorlab boʻlmadi — qayta urinish
            </button>
          )}
          {suggestions.length > 0 && <ul className="space-y-1.5">{suggestions.map((t) => <SuggestionRow key={t.id} task={t} state={state} />)}</ul>}
        </>
      )}
    </div>
  )
}
