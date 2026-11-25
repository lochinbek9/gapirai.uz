'use client'
import { useState } from 'react'
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, CalendarDays, CheckSquare, ChevronDown, Lightbulb, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import type { BrainBoardState } from '@/hooks/useBrainBoard'
import { SuggestionRow } from '@/components/brain/IdeaTasks'
import { CopyButton, DURATIONS, DurationBadge, VersionButton, formatDuration } from '@/components/brain/TaskTools'
import {
  BrainTask, archiveTask, createColumn, createTask, deleteColumn, deleteTask, moveTask, restoreTask, switchTaskVersion, updateColumn, updateTask,
} from '@/lib/brain'

const INPUT = 'w-full rounded-lg border border-ui-rule bg-ui-surface p-2.5 text-sm font-normal text-ui-ink'
/** Davomiylik filtri: [qiymat, nomi, mos kelishi] */
const DURATION_FILTERS: [string, string, (m: number | null) => boolean][] = [
  ['', 'Barcha davomiyliklar', () => true],
  ['15', '15 daqiqagacha', (m) => !!m && m <= 15],
  ['30', '16–30 daqiqa', (m) => !!m && m > 15 && m <= 30],
  ['60', '31–60 daqiqa', (m) => !!m && m > 30 && m <= 60],
  ['long', '1 soatdan uzoq', (m) => !!m && m > 60],
  ['none', 'Belgilanmagan', (m) => !m],
]
const today = () => new Date().toLocaleDateString('en-CA')

function AddForm({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (value.trim()) { onAdd(value.trim()); setValue('') } }}>
      <input aria-label={placeholder} placeholder={placeholder} value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} className={INPUT} />
      <button type="submit" aria-label="Qoʻshish" className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-ui-rule text-ui-muted hover:text-ui-ink"><Plus aria-hidden="true" className="h-4 w-4" /></button>
    </form>
  )
}

function TaskDialog({ task, state, onClose, onOpenSource }: {
  task: BrainTask; state: BrainBoardState; onClose: () => void; onOpenSource: (task: BrainTask) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [due, setDue] = useState(task.due_date ?? '')
  const [duration, setDuration] = useState(task.duration_minutes ?? 0)
  const [labels, setLabels] = useState(task.labels.join(', '))
  const [checklist, setChecklist] = useState(task.checklist)
  const [column, setColumn] = useState(task.column_id!)

  const save = async () => {
    if (!title.trim()) return
    const ok = await state.run(async () => {
      await updateTask(task.id, {
        title, description, due_date: due || null, duration_minutes: duration || null, checklist,
        labels: labels.split(',').map((l) => l.trim()).filter(Boolean).slice(0, 10),
      })
      if (column !== task.column_id) await moveTask(task.id, column)
    })
    if (ok) onClose()
  }
  const switchVersion = (to: 'original' | 'edited') => state.run(async () => {
    const next = await switchTaskVersion(task.id, to)
    setTitle(next.title)
    setDescription(next.description)
  })
  const act = (action: () => Promise<unknown>) => { state.run(action); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Vazifa" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="my-8 w-full max-w-lg space-y-3 rounded-card border border-ui-rule bg-ui-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ui-ink">Vazifa</h2>
          <button type="button" onClick={onClose} aria-label="Yopish" className="text-ui-muted hover:text-ui-ink"><X aria-hidden="true" className="h-5 w-5" /></button>
        </div>
        <label className="block text-sm font-medium">Sarlavha<input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={`${INPUT} mt-1`} /></label>
        <label className="block text-sm font-medium">Tavsif<textarea rows={4} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} className={`${INPUT} mt-1`} /></label>
        <div className="flex items-center gap-3">
          {task.version && <VersionButton version={task.version} onSwitch={switchVersion} />}
          <span className="ml-auto"><CopyButton title={title} description={description} /></span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Ustun
            <select value={column} onChange={(e) => setColumn(e.target.value)} className={`${INPUT} mt-1`}>
              {state.board?.columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Davomiyligi
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${INPUT} mt-1`}>
              <option value={0}>Belgilanmagan</option>
              {Array.from(new Set(duration ? [...DURATIONS, duration] : DURATIONS)).sort((a, b) => a - b)
                .map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Muddat<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${INPUT} mt-1`} /></label>
        </div>
        <label className="block text-sm font-medium">Yorliqlar (vergul bilan)<input value={labels} onChange={(e) => setLabels(e.target.value)} className={`${INPUT} mt-1`} /></label>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Nazorat roʻyxati</legend>
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={item.done} aria-label={item.text}
                onChange={() => setChecklist(checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)))} />
              <span className={`flex-1 text-sm ${item.done ? 'text-ui-muted line-through' : 'text-ui-ink'}`}>{item.text}</span>
              <button type="button" aria-label="Bandni oʻchirish" onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} className="text-ui-muted hover:text-red-500"><X aria-hidden="true" className="h-4 w-4" /></button>
            </div>
          ))}
          <AddForm placeholder="Yangi band" onAdd={(text) => setChecklist((list) => [...list, { text, done: false }])} />
        </fieldset>
        {task.idea_title && (
          <div className="rounded-lg bg-ui-ground p-3 text-sm">
            <p className="text-xs text-ui-muted">Manba: {task.analysis_title}</p>
            <button type="button" onClick={() => { onClose(); onOpenSource(task) }} className="mt-1 text-left font-medium text-ui-accent-ink hover:underline">{task.idea_title}</button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" onClick={save} className="ui-btn ui-btn-primary">Saqlash</button>
          {task.ai_model && <button type="button" onClick={() => act(() => moveTask(task.id, null))} className="ui-btn ui-btn-secondary">Takliflarga qaytarish</button>}
          <button type="button" onClick={() => act(() => archiveTask(task.id))} className="ml-auto flex items-center gap-1.5 text-sm font-medium text-ui-muted hover:text-ui-ink"><Archive aria-hidden="true" className="h-4 w-4" />Arxivga</button>
        </div>
      </div>
    </div>
  )
}

/** Bitta fikrning vazifalari bir guruh; qoʻlda yaratilganlari alohida. Tartib -- birinchi vazifa boʻyicha. */
function groupByIdea(tasks: BrainTask[]) {
  const groups = new Map<string, BrainTask[]>()
  tasks.forEach((t) => {
    const key = t.idea_key ? `${t.analysis_id}:${t.idea_key}` : t.id
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  })
  return Array.from(groups, ([key, items]) => ({ key, items }))
}

export default function TaskBoard({ state, onOpenSource }: { state: BrainBoardState; onOpenSource: (task: BrainTask) => void }) {
  const [query, setQuery] = useState('')
  const [durationFilter, setDurationFilter] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  // Ustunlar sukut boʻyicha yigʻiq
  const [expanded, setExpanded] = useState<string[]>([])
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const board = state.board
  if (!board) return <p role="status" className="py-16 text-center text-sm text-ui-muted">Yuklanmoqda…</p>

  const q = query.trim().toLowerCase()
  const matchesDuration = DURATION_FILTERS.find(([value]) => value === durationFilter)![2]
  const filtering = !!q || !!durationFilter
  const visible = (t: BrainTask) => matchesDuration(t.duration_minutes)
    && (!q || [t.title, t.description, t.idea_title ?? '', ...t.labels].join(' ').toLowerCase().includes(q))
  const active = board.tasks.filter((t) => !t.archived_at)
  const suggestions = active.filter((t) => !t.column_id && visible(t))
  const archived = board.tasks.filter((t) => t.archived_at && visible(t)).sort((a, b) => b.archived_at!.localeCompare(a.archived_at!))
  const open = active.find((t) => t.id === openId && t.column_id)

  const drop = (columnId: string, beforeId?: string) => {
    const id = dragId
    setDragId(null)
    if (!id || id === beforeId) return
    const others = active.filter((t) => t.column_id === columnId && t.id !== id).sort((a, b) => a.position - b.position)
    const found = beforeId ? others.findIndex((t) => t.id === beforeId) : -1
    const index = found >= 0 ? found : others.length
    // Darhol ko'rsatiladi, keyin server holati bilan almashtiriladi
    const order = [...others.slice(0, index).map((t) => t.id), id, ...others.slice(index).map((t) => t.id)]
    state.setBoard({ ...board, tasks: board.tasks.map((t) => order.includes(t.id) ? { ...t, column_id: columnId, position: order.indexOf(t.id) } : t) })
    state.run(() => moveTask(id, columnId, index))
  }

  /** Alohida va guruh ichidagi vazifa bir xil: ochiladi va istalgan ustunga sudraladi */
  const card = (columnId: string, t: BrainTask, grouped = false) => {
    const done = t.checklist.filter((c) => c.done).length
    return (
      <li key={t.id} draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); setDragId(t.id) }}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(columnId, t.id) }}
        className={dragId === t.id ? 'opacity-40' : ''}>
        <button type="button" onClick={() => setOpenId(t.id)} className="w-full cursor-grab rounded-lg border border-ui-rule bg-ui-surface p-3 text-left hover:border-ui-muted/60">
          {t.labels.length > 0 && (
            <span className="mb-1.5 flex flex-wrap gap-1">{t.labels.map((l) => <span key={l} className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-ui-accent-ink">{l}</span>)}</span>
          )}
          <span className="block text-sm font-medium text-ui-ink">{t.title}</span>
          {!grouped && t.idea_title && <span className="mt-1 line-clamp-1 block text-xs text-ui-muted">{t.idea_title}</span>}
          {(t.duration_minutes || t.due_date || t.checklist.length > 0) && (
            <span className="mt-2 flex flex-wrap gap-3 text-xs text-ui-muted">
              {t.duration_minutes && <DurationBadge minutes={t.duration_minutes} />}
              {t.due_date && <span className={`flex items-center gap-1 ${t.due_date < today() ? 'text-red-500' : ''}`}><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />{t.due_date.split('-').reverse().join('.')}</span>}
              {t.checklist.length > 0 && <span className="flex items-center gap-1"><CheckSquare aria-hidden="true" className="h-3.5 w-3.5" />{done}/{t.checklist.length}</span>}
            </span>
          )}
        </button>
      </li>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap gap-2">
      <label className="relative block min-w-[200px] max-w-md flex-1">
        <span className="sr-only">Vazifa qidirish</span>
        <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Vazifa, yorliq yoki fikr" className={`${INPUT} pl-9`} />
      </label>
      <select aria-label="Davomiylik boʻyicha saralash" value={durationFilter} onChange={(e) => setDurationFilter(e.target.value)} className={`${INPUT} !w-auto`}>
        {DURATION_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      </div>

      <div className="flex items-start gap-3 overflow-x-auto pb-3">
        {board.columns.map((column, ci) => {
          const tasks = active.filter((t) => t.column_id === column.id).sort((a, b) => a.position - b.position)
          // Qidiruvda mos vazifasi bor ustun oʻzi ochiladi
          const isOpen = expanded.includes(column.id) || (filtering && tasks.some(visible))
          return (
            <section key={column.id} aria-label={column.title}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); drop(column.id) }}
              className="flex w-[290px] shrink-0 flex-col gap-2 rounded-card bg-ui-ground p-3">
              <header className="flex items-center gap-1">
                <h3 className="min-w-0 flex-1 text-sm font-semibold text-ui-ink">
                  <button type="button" aria-expanded={isOpen} className="flex w-full items-center gap-1.5 py-1 text-left"
                    onClick={() => setExpanded((list) => list.includes(column.id) ? list.filter((x) => x !== column.id) : [...list, column.id])}>
                    <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-ui-muted transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    <span className="truncate">{column.title}</span>
                    <span className="font-normal text-ui-muted">{tasks.length}</span>
                  </button>
                </h3>
                {isOpen && ([
                  ['Chapga surish', ArrowLeft, ci > 0, () => state.run(() => updateColumn(column.id, { index: ci - 1 }))],
                  ['Oʻngga surish', ArrowRight, ci < board.columns.length - 1, () => state.run(() => updateColumn(column.id, { index: ci + 1 }))],
                  ['Nomini oʻzgartirish', Pencil, true, () => { const name = prompt('Ustun nomi', column.title); if (name?.trim()) state.run(() => updateColumn(column.id, { title: name.trim() })) }],
                  ['Ustunni oʻchirish', Trash2, board.columns.length > 1, () => { if (confirm('Ustun oʻchirilsinmi? Vazifalari boshqa ustunga koʻchadi.')) state.run(() => deleteColumn(column.id)) }],
                ] as const).map(([label, Icon, enabled, action]) => (
                  <button key={label} type="button" aria-label={label} title={label} disabled={!enabled} onClick={action} className="p-1 text-ui-muted hover:text-ui-ink disabled:opacity-25">
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                ))}
              </header>
              {isOpen && (
                <>
                  <ul className="flex min-h-[48px] flex-col gap-2">
                    {groupByIdea(tasks.filter(visible)).map(({ key, items }) => {
                      if (items.length === 1) return card(column.id, items[0])
                      const groupId = `${column.id}:${key}`
                      const shown = filtering || openGroups.includes(groupId)
                      return (
                        <li key={groupId} className="rounded-lg border border-ui-rule bg-ui-surface"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(column.id, items[0].id) }}>
                          <button type="button" aria-expanded={shown} className="flex w-full items-start gap-2 p-3 text-left"
                            onClick={() => setOpenGroups((list) => list.includes(groupId) ? list.filter((x) => x !== groupId) : [...list, groupId])}>
                            <ChevronDown aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 text-ui-muted transition-transform ${shown ? '' : '-rotate-90'}`} />
                            <span className="min-w-0 flex-1 text-sm font-medium text-ui-ink">{items[0].idea_title}</span>
                            <span className="rounded-full bg-ui-ground px-2 text-xs text-ui-muted">{items.length}</span>
                          </button>
                          {shown && <ul className="flex flex-col gap-2 border-t border-ui-rule p-2">{items.map((t) => card(column.id, t, true))}</ul>}
                        </li>
                      )
                    })}
                  </ul>
                  <AddForm placeholder="Yangi vazifa" onAdd={(title) => state.run(() => createTask(title, column.id))} />
                </>
              )}
            </section>
          )
        })}
        {board.columns.length < 12 && (
          <div className="w-[240px] shrink-0"><AddForm placeholder="Yangi ustun" onAdd={(name) => state.run(() => createColumn(name))} /></div>
        )}
      </div>

      <details className="rounded-card border border-ui-rule p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold text-ui-ink">
          <Lightbulb aria-hidden="true" className="h-4 w-4" />Takliflar <span className="font-normal text-ui-muted">{suggestions.length}</span>
        </summary>
        {suggestions.length === 0 ? (
          <p className="mt-3 text-sm text-ui-muted">Fikrni tanlanganlarga qoʻshsangiz, takliflar shu yerda paydo boʻladi.</p>
        ) : (
          <ul className="mt-3 grid items-start gap-2 md:grid-cols-2 lg:grid-cols-3">{suggestions.map((t) => <SuggestionRow key={t.id} task={t} state={state} />)}</ul>
        )}
      </details>

      <details className="rounded-card border border-ui-rule p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold text-ui-ink">
          <Archive aria-hidden="true" className="h-4 w-4" />Arxiv <span className="font-normal text-ui-muted">{archived.length}</span>
        </summary>
        {archived.length === 0 ? (
          <p className="mt-3 text-sm text-ui-muted">Arxiv boʻsh.</p>
        ) : (
          <ul className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {archived.map((t) => (
              <li key={t.id} className="flex items-start gap-2 rounded-lg border border-ui-rule p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ui-ink">{t.title}</p>
                  <p className="mt-0.5 text-xs text-ui-muted">{board.columns.find((c) => c.id === t.column_id)?.title ?? 'Taklif'}{t.idea_title ? ` · ${t.idea_title}` : ''}</p>
                </div>
                <button type="button" title="Tiklash" aria-label={`Tiklash: ${t.title}`} onClick={() => state.run(() => restoreTask(t.id))}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ui-rule text-ui-muted hover:text-ui-ink">
                  <ArchiveRestore aria-hidden="true" className="h-4 w-4" />
                </button>
                <button type="button" title="Oʻchirish" aria-label={`Oʻchirish: ${t.title}`}
                  onClick={() => { if (confirm('Vazifa oʻchirilsinmi? Uni qaytarib boʻlmaydi.')) state.run(() => deleteTask(t.id)) }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ui-rule text-ui-muted hover:text-red-500">
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>

      {open && <TaskDialog key={open.id} task={open} state={state} onClose={() => setOpenId(null)} onOpenSource={onOpenSource} />}
    </div>
  )
}
