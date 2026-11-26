'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, Eye, EyeOff, FileText, ListPlus, Loader2, Play, Search, Star, X } from 'lucide-react'
import PageShell from '@/components/PageShell'
import BrainGraph, { GraphLink, GraphNode } from '@/components/brain/BrainGraph'
import IdeaTasks from '@/components/brain/IdeaTasks'
import SelectAllDialog, { SelectAllResult } from '@/components/brain/SelectAllDialog'
import TaskBoard from '@/components/brain/TaskBoard'
import { useAuth } from '@/hooks/useAuth'
import { useBrainBoard } from '@/hooks/useBrainBoard'
import { formatDuration } from '@/lib/api'
import { BrainAnalysis, BrainIdea, IdeaPatch, getBrain, selectAllIdeas, updateBrainIdea } from '@/lib/brain'
import { formatTashkentDate } from '@/lib/timestamp'

type Mode = 'all' | 'selected'
type CardKind = 'ideas' | 'analyses'
type Idea = BrainIdea & { id: string; analysis: BrainAnalysis }

const channelId = (name: string) => `c:${name}`
const analysisNodeId = (a: BrainAnalysis) => `a:${a.analysis_id}`
const ideaId = (a: BrainAnalysis, key: string) => `i:${a.analysis_id}:${key}`
const title = (a: BrainAnalysis) => a.title || 'Nomsiz tahlil'

function timeLabel(idea: Idea) {
  if (idea.timestamp == null) return null
  if (idea.analysis.source_type === 'document') return `${Math.round(idea.timestamp)}-bet`
  const s = Math.floor(idea.timestamp)
  const mm = String(Math.floor(s / 60) % 60).padStart(s >= 3600 ? 2 : 1, '0')
  return `${s >= 3600 ? `${Math.floor(s / 3600)}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`
}

const BTN = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ui-rule px-3 text-sm font-medium transition hover:border-ui-muted/60'
const SEG = (on: boolean) => `min-h-9 rounded-lg px-3.5 text-sm font-medium transition ${on ? 'bg-ui-surface text-ui-ink shadow-sm' : 'text-ui-muted hover:text-ui-ink'}`

/** Fikr amallari sukut boʻyicha yigʻiq; holati (tanlangan, yashirilgan) sarlavhada koʻrinadi */
function IdeaActions({ idea, onPatch, children }: { idea: Idea; onPatch: (idea: Idea, patch: IdeaPatch) => void; children?: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-xs font-semibold text-ui-muted hover:text-ui-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 -rotate-90 transition-transform group-open:rotate-0" />
        Amallar
        {idea.selected && <Star aria-label="Tanlangan" className="h-4 w-4 fill-amber-500 text-amber-500" />}
        {idea.hidden && <EyeOff aria-label="Grafdan yashirilgan" className="h-4 w-4" />}
      </summary>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" aria-pressed={idea.selected} onClick={() => onPatch(idea, { selected: !idea.selected })}
          className={`${BTN} ${idea.selected ? 'border-amber-500/50 bg-amber-500/10 text-ui-ink' : 'text-ui-muted'}`}>
          <Star aria-hidden="true" className={`h-4 w-4 ${idea.selected ? 'fill-amber-500 text-amber-500' : ''}`} />
          {idea.selected ? 'Tanlanganlardan chiqarish' : 'Tanlanganlarga qoʻshish'}
        </button>
        <button type="button" aria-pressed={idea.hidden} onClick={() => onPatch(idea, { hidden: !idea.hidden })} className={`${BTN} text-ui-muted`}>
          {idea.hidden ? <Eye aria-hidden="true" className="h-4 w-4" /> : <EyeOff aria-hidden="true" className="h-4 w-4" />}
          {idea.hidden ? 'Grafda koʻrsatish' : 'Grafdan yashirish'}
        </button>
      </div>
      {children && <div className="mt-2">{children}</div>}
    </details>
  )
}

/** Videoni loyiha ichida, kerakli soniyadan ochadi */
function Player({ videoId, start }: { videoId: string; start: number }) {
  return (
    <iframe
      key={`${videoId}:${start}`}
      className="aspect-video w-full rounded-lg border border-ui-rule"
      src={`https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&rel=0`}
      title="Video parchasi"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  )
}

function NoteEditor({ idea, onPatch }: { idea: Idea; onPatch: (idea: Idea, patch: IdeaPatch) => void }) {
  const [note, setNote] = useState(idea.note)
  const [tags, setTags] = useState(idea.tags.join(', '))
  const dirty = note.trim() !== idea.note || tags !== idea.tags.join(', ')
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); onPatch(idea, { note, tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12) }) }}>
      <label className="block text-sm font-medium text-ui-ink">Mening izohim
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={5000}
          className="mt-1 w-full rounded-lg border border-ui-rule bg-ui-surface p-2.5 text-sm font-normal" />
      </label>
      <label className="block text-sm font-medium text-ui-ink">Teglar (vergul bilan)
        <input value={tags} onChange={(e) => setTags(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ui-rule bg-ui-surface p-2.5 text-sm font-normal" />
      </label>
      <button type="submit" disabled={!dirty} className="ui-btn ui-btn-primary disabled:opacity-40">Saqlash</button>
    </form>
  )
}

function AnalysisInfo({ a }: { a: BrainAnalysis }) {
  const facts = [
    a.source_type === 'document' ? (a.pages ? `Hujjat · ${a.pages} bet` : 'Hujjat') : a.duration ? formatDuration(a.duration) : null,
    a.video_language ? `Asl til: ${a.video_language.toUpperCase()}` : null,
    a.created_at ? `Tahlil: ${formatTashkentDate(a.created_at)}` : null,
    `${a.ideas.length} fikr`,
    a.chapters_count ? `${a.chapters_count} bob` : null,
  ].filter(Boolean)
  return (
    <div className="space-y-1.5">
      {a.source_type === 'video' && (
        <p className="text-sm text-ui-muted">
          Kanal:{' '}
          {a.channel ? (
            a.channel.url
              ? <a href={a.channel.url} target="_blank" rel="noreferrer" className="font-medium text-ui-accent-ink hover:underline">{a.channel.name}</a>
              : <span className="font-medium text-ui-ink">{a.channel.name}</span>
          ) : 'maʼlumot olinmadi'}
        </p>
      )}
      <p className="text-xs text-ui-muted">{facts.join(' · ')}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/video-analysis/${a.analysis_id}`} className="font-medium text-ui-accent-ink hover:underline">Tahlilni ochish</Link>
        {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-ui-muted hover:underline">YouTubeʼda</a>}
      </div>
    </div>
  )
}

export default function BrainPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<BrainAnalysis[] | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('all')
  const [cardKind, setCardKind] = useState<CardKind>('ideas')
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState('')
  const [tag, setTag] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [section, setSection] = useState<'graph' | 'tasks'>('graph')
  const tasks = useBrainBoard(!!user)
  const reloadTasks = tasks.reload

  // Ichki bo'lim URL'da -- sahifa yangilanganda ham saqlanadi
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'tasks') setSection('tasks') }, [])
  const showSection = (next: 'graph' | 'tasks') => {
    setSection(next)
    window.history.replaceState({}, '', next === 'tasks' ? '/brain?tab=tasks' : '/brain')
  }

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading, router])

  const load = useCallback(() => {
    getBrain().then((d) => { setData(d); setError('') }).catch((e) => {
      setError(e?.response?.status === 404 ? 'Bu boʻlim siz uchun ochiq emas.' : 'Maʼlumotlarni yuklab boʻlmadi.')
    })
  }, [])
  useEffect(() => { if (user) load() }, [user, load])

  const patch = useCallback(async (idea: Idea, change: IdeaPatch) => {
    try {
      const saved = await updateBrainIdea(idea.analysis.analysis_id, idea.key, change)
      setData((prev) => prev && prev.map((a) => a.analysis_id !== idea.analysis.analysis_id ? a
        : { ...a, ideas: a.ideas.map((i) => (i.key === idea.key ? { ...i, ...saved } : i)) }))
      setError('')
      if (change.selected !== undefined) reloadTasks()
    } catch {
      setError('Oʻzgarish saqlanmadi. Qayta urinib koʻring.')
    }
  }, [reloadTasks])

  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [selectResult, setSelectResult] = useState<SelectAllResult | null>(null)
  const selectAll = useCallback(async (analysisId: string, name: string) => {
    setSelectingId(analysisId)
    try {
      const { selected } = await selectAllIdeas(analysisId)
      setData((prev) => prev && prev.map((a) => a.analysis_id !== analysisId ? a
        : { ...a, ideas: a.ideas.map((i) => (selected.includes(i.key) ? { ...i, selected: true } : i)) }))
      setError('')
      setSelectResult({ analysisId, title: name, keys: selected })
      reloadTasks()
    } catch {
      setError('Vazifalar yaratilmadi. Qayta urinib koʻring.')
    } finally {
      setSelectingId(null)
    }
  }, [reloadTasks])

  const all = useMemo<Idea[]>(() => (data ?? []).flatMap((a) => a.ideas.map((i) => ({ ...i, id: ideaId(a, i.key), analysis: a }))), [data])
  const channels = useMemo(() => Array.from(new Set((data ?? []).map((a) => a.channel?.name).filter(Boolean) as string[])).sort(), [data])
  const tags = useMemo(() => Array.from(new Set(all.flatMap((i) => i.tags))).sort(), [all])

  const q = query.trim().toLowerCase()
  const matches = (i: Idea) =>
    (mode === 'all' || i.selected) && (showHidden || !i.hidden) &&
    (!channel || i.analysis.channel?.name === channel) && (!tag || i.tags.includes(tag)) &&
    (!q || [i.title, i.description, i.note, title(i.analysis), i.analysis.channel?.name ?? '', ...i.tags].join(' ').toLowerCase().includes(q))
  const ideas = all.filter(matches)
  const filtering = !!(q || tag) || mode === 'selected'
  // Fikri yo'q (yoki hammasi yashirilgan) tahlillar faqat filtrsiz "Barcha" ko'rinishida qoladi
  const analyses = (data ?? []).filter((a) =>
    ideas.some((i) => i.analysis.analysis_id === a.analysis_id) || (!filtering && (!channel || a.channel?.name === channel)))

  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const seenChannels = new Set<string>()
  analyses.forEach((a) => {
    nodes.push({ id: analysisNodeId(a), kind: 'analysis', label: title(a) })
    if (a.channel) {
      const id = channelId(a.channel.name)
      if (!seenChannels.has(id)) { seenChannels.add(id); nodes.push({ id, kind: 'channel', label: a.channel.name }) }
      links.push({ source: id, target: analysisNodeId(a) })
    }
  })
  ideas.forEach((i) => {
    nodes.push({ id: i.id, kind: 'idea', label: i.title, selected: i.selected, dimmed: i.hidden })
    links.push({ source: analysisNodeId(i.analysis), target: i.id })
  })

  const activeIdea = all.find((i) => i.id === activeId)
  const activeAnalysis = data?.find((a) => analysisNodeId(a) === activeId)
  const activeChannel = activeId?.startsWith('c:') ? activeId.slice(2) : null

  const open = (id: string | null, play: number | null = null) => { setActiveId(id); setPlaying(play) }
  const openFromCard = (id: string, play: number | null = null) => {
    open(id, play)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const playIdea = (i: Idea) => (i.analysis.video_id && i.timestamp != null ? Math.floor(i.timestamp) : null)

  if (loading || !user || (!data && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ui-surface" role="status">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-ui-muted" />
        <span className="sr-only">Yuklanmoqda</span>
      </div>
    )
  }

  const selectedCount = all.filter((i) => i.selected).length

  const hasUnselected = (a: BrainAnalysis) => a.ideas.some((i) => !i.selected && !i.hidden)
  const selectAllButton = (a: BrainAnalysis) => hasUnselected(a) && (
    <button type="button" disabled={selectingId !== null} onClick={() => selectAll(a.analysis_id, title(a))}
      className={`${BTN} py-1.5 text-left text-ui-accent-ink disabled:opacity-50`}>
      {selectingId === a.analysis_id
        ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
        : <ListPlus aria-hidden="true" className="h-4 w-4 shrink-0" />}
      Hammasini tanlab, vazifa yaratish
    </button>
  )
  // Hali birorta fikri tanlanmagan tahlillar: ulardan vazifa chiqmagan
  const untouched = analyses.filter((a) => hasUnselected(a) && !a.ideas.some((i) => i.selected))

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-ink">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Mening videolarim
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-ui-ink sm:text-4xl">Miyya</h1>
        <p className="mt-2 text-[15px] text-ui-muted">Tahlillaringizdan chiqqan fikrlar: tahlil → fikrlar → miyya.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-ui-red-ink">
            {error} <button type="button" onClick={load} className="font-medium underline">Qayta yuklash</button>
          </p>
        )}

        <div role="group" aria-label="Boʻlim" className="mt-6 inline-flex gap-1 rounded-control bg-ui-ground p-1">
          <button type="button" aria-pressed={section === 'graph'} onClick={() => showSection('graph')} className={SEG(section === 'graph')}>Fikrlar grafi</button>
          <button type="button" aria-pressed={section === 'tasks'} onClick={() => showSection('tasks')} className={SEG(section === 'tasks')}>
            Vazifalar · {tasks.board?.tasks.filter((t) => t.column_id && !t.archived_at).length ?? 0}
          </button>
        </div>
        {tasks.error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-ui-red-ink">{tasks.error}</p>}

        {selectResult && (
          <SelectAllDialog result={selectResult} state={tasks} onClose={() => setSelectResult(null)}
            onShowTasks={() => { setSelectResult(null); showSection('tasks') }} />
        )}

        {section === 'tasks' && (
          <TaskBoard state={tasks} onOpenSource={(t) => {
            showSection('graph'); setMode('all')
            open(`i:${t.analysis_id}:${t.idea_key}`)
          }} />
        )}

        {section === 'graph' && data && data.length === 0 && (
          <div className="mt-8 rounded-card border border-dashed border-ui-rule px-6 py-16 text-center">
            <p className="text-lg font-semibold text-ui-ink">Miyya hali boʻsh</p>
            <p className="mt-1 text-[15px] text-ui-muted">Video tahlil qiling — asosiy fikrlar shu yerda paydo boʻladi.</p>
            <Link href="/?mode=analyze" className="ui-btn ui-btn-primary mt-6">Video tahlil qilish</Link>
          </div>
        )}

        {section === 'graph' && data && data.length > 0 && (
          <>
            <div ref={topRef} className="mt-6 flex scroll-mt-24 flex-wrap items-center gap-2">
              <div role="group" aria-label="Graf turi" className="inline-flex gap-1 rounded-control bg-ui-ground p-1">
                <button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')} className={SEG(mode === 'all')}>Barcha fikrlar · {all.length}</button>
                <button type="button" aria-pressed={mode === 'selected'} onClick={() => setMode('selected')} className={SEG(mode === 'selected')}>Tanlangan · {selectedCount}</button>
              </div>
              <label className="relative min-w-[200px] flex-1">
                <span className="sr-only">Qidirish</span>
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Fikr, izoh, teg, video yoki kanal"
                  className="min-h-10 w-full rounded-lg border border-ui-rule bg-ui-surface pl-9 pr-3 text-sm" />
              </label>
              {channels.length > 0 && (
                <select aria-label="Kanal" value={channel} onChange={(e) => setChannel(e.target.value)} className="min-h-10 max-w-[220px] rounded-lg border border-ui-rule bg-ui-surface px-2 text-sm">
                  <option value="">Barcha kanallar</option>
                  {channels.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {(tags.length > 0 || tag) && (
                <select aria-label="Teg" value={tag} onChange={(e) => setTag(e.target.value)} className="min-h-10 rounded-lg border border-ui-rule bg-ui-surface px-2 text-sm">
                  <option value="">Barcha teglar</option>
                  {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
              )}
              <label className="flex min-h-10 items-center gap-2 text-sm text-ui-muted">
                <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
                Yashirilganlar · {all.filter((i) => i.hidden).length}
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div>
                <BrainGraph key={mode} nodes={nodes} links={links} activeId={activeId} onSelect={(id) => open(id)} />
                {nodes.length === 0 && (
                  <p className="mt-2 text-sm text-ui-muted">
                    {mode === 'selected' && selectedCount === 0 ? 'Hali fikr tanlanmagan. Kartochkadagi “Amallar”ni ochib, “Tanlanganlarga qoʻshish”ni bosing.' : 'Filtrga mos fikr topilmadi.'}
                  </p>
                )}
              </div>

              <aside aria-label="Tanlangan tugun" aria-live="polite" className="ui-card max-h-[65vh] min-h-[200px] space-y-4 overflow-y-auto p-5">
                {!activeIdea && !activeAnalysis && !activeChannel && (
                  <p className="text-sm text-ui-muted">Grafdagi nuqtani yoki pastdagi kartochkani tanlang. Surish uchun torting, kattalashtirish uchun gʻildirakdan foydalaning.</p>
                )}
                {(activeIdea || activeAnalysis || activeChannel) && (
                  <button type="button" onClick={() => open(null)} aria-label="Yopish" className="float-right text-ui-muted hover:text-ui-ink"><X aria-hidden="true" className="h-4 w-4" /></button>
                )}
                {activeIdea && (
                  <>
                    <h2 className="text-lg font-semibold text-ui-ink">{activeIdea.title}</h2>
                    {activeIdea.description && <p className="text-sm leading-relaxed text-ui-muted">{activeIdea.description}</p>}
                    {playing != null && activeIdea.analysis.video_id ? (
                      <Player videoId={activeIdea.analysis.video_id} start={playing} />
                    ) : timeLabel(activeIdea) && (
                      activeIdea.analysis.video_id
                        ? <button type="button" onClick={() => setPlaying(playIdea(activeIdea))} className={`${BTN} text-ui-accent-ink`}><Play aria-hidden="true" className="h-4 w-4" />{timeLabel(activeIdea)} dan koʻrish</button>
                        : <p className="text-sm text-ui-muted">{timeLabel(activeIdea)}</p>
                    )}
                    <IdeaActions key={activeIdea.id} idea={activeIdea} onPatch={patch}>
                      <IdeaTasks analysisId={activeIdea.analysis.analysis_id} ideaKey={activeIdea.key} state={tasks} />
                    </IdeaActions>
                    <NoteEditor key={activeIdea.id} idea={activeIdea} onPatch={patch} />
                    <div className="border-t border-ui-rule pt-3">
                      <button type="button" onClick={() => open(analysisNodeId(activeIdea.analysis))} className="mb-1.5 text-left text-sm font-semibold text-ui-ink hover:underline">{title(activeIdea.analysis)}</button>
                      <AnalysisInfo a={activeIdea.analysis} />
                    </div>
                  </>
                )}
                {activeAnalysis && (
                  <>
                    {activeAnalysis.thumbnail && <img src={activeAnalysis.thumbnail} alt="" className="aspect-video w-full rounded-lg object-cover" />}
                    <h2 className="text-lg font-semibold text-ui-ink">{title(activeAnalysis)}</h2>
                    <AnalysisInfo a={activeAnalysis} />
                    {selectAllButton(activeAnalysis)}
                    {activeAnalysis.summary && <p className="text-sm leading-relaxed text-ui-muted">{activeAnalysis.summary}</p>}
                    <ul className="space-y-1">
                      {all.filter((i) => i.analysis.analysis_id === activeAnalysis.analysis_id).map((i) => (
                        <li key={i.id} className="flex items-start gap-2">
                          <button type="button" aria-pressed={i.selected} aria-label={i.selected ? 'Tanlanganlardan chiqarish' : 'Tanlanganlarga qoʻshish'} onClick={() => patch(i, { selected: !i.selected })} className="p-1">
                            <Star aria-hidden="true" className={`h-4 w-4 ${i.selected ? 'fill-amber-500 text-amber-500' : 'text-ui-muted'}`} />
                          </button>
                          <button type="button" onClick={() => open(i.id)} className={`py-1 text-left text-sm hover:underline ${i.hidden ? 'text-ui-muted line-through' : 'text-ui-ink'}`}>{i.title}</button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {activeChannel && (
                  <>
                    <h2 className="text-lg font-semibold text-ui-ink">{activeChannel}</h2>
                    <ul className="space-y-2">
                      {data.filter((a) => a.channel?.name === activeChannel).map((a) => (
                        <li key={a.analysis_id}><button type="button" onClick={() => open(analysisNodeId(a))} className="text-left text-sm text-ui-ink hover:underline">{title(a)}</button></li>
                      ))}
                    </ul>
                  </>
                )}
              </aside>
            </div>

            <div role="group" aria-label="Kartochka turi" className="mb-4 mt-10 inline-flex gap-1 rounded-control bg-ui-ground p-1">
              <button type="button" aria-pressed={cardKind === 'ideas'} onClick={() => setCardKind('ideas')} className={SEG(cardKind === 'ideas')}>Fikrlar · {ideas.length}</button>
              <button type="button" aria-pressed={cardKind === 'analyses'} onClick={() => setCardKind('analyses')} className={SEG(cardKind === 'analyses')}>Tahlillar · {analyses.length}</button>
            </div>

            {cardKind === 'ideas' && untouched.length > 0 && (
              <ul className="mb-4 space-y-2">
                {untouched.map((a) => (
                  <li key={a.analysis_id} className="ui-card flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="min-w-0 flex-1 basis-60 text-sm text-ui-muted">
                      <span className="font-semibold text-ui-ink">{title(a)}</span> — fikr tanlanmagan, shuning uchun vazifa yoʻq.
                    </p>
                    {selectAllButton(a)}
                  </li>
                ))}
              </ul>
            )}

            <ul className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cardKind === 'ideas' ? ideas.map((i) => (
                <li key={i.id} className={`ui-card flex flex-col gap-3 p-4 ${i.hidden ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    {timeLabel(i) && (i.analysis.video_id ? (
                      <button type="button" onClick={() => openFromCard(i.id, playIdea(i))} title="Shu joydan koʻrish" className="rounded-md bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-ui-accent-ink hover:bg-blue-500/20">{timeLabel(i)}</button>
                    ) : <span className="rounded-md bg-ui-ground px-2 py-0.5 text-xs text-ui-muted">{timeLabel(i)}</span>)}
                    <button type="button" onClick={() => openFromCard(i.id)} className="text-left text-sm font-semibold text-ui-ink hover:underline">{i.title}</button>
                  </div>
                  <p className="text-sm leading-relaxed text-ui-muted">{i.description}</p>
                  {i.note && <p className="whitespace-pre-wrap rounded-lg bg-ui-ground p-2.5 text-sm text-ui-ink">{i.note}</p>}
                  {i.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {i.tags.map((t) => <button key={t} type="button" onClick={() => setTag(t)} className="rounded-full bg-ui-ground px-2 py-0.5 text-xs text-ui-muted hover:text-ui-ink">#{t}</button>)}
                    </div>
                  )}
                  <p className="line-clamp-1 text-xs text-ui-muted">{title(i.analysis)}{i.analysis.channel ? ` · ${i.analysis.channel.name}` : ''}</p>
                  <IdeaActions idea={i} onPatch={patch}>
                    {i.selected && <IdeaTasks analysisId={i.analysis.analysis_id} ideaKey={i.key} state={tasks} />}
                  </IdeaActions>
                </li>
              )) : analyses.map((a) => (
                <li key={a.analysis_id} className="ui-card flex flex-col overflow-hidden">
                  {a.thumbnail ? <img src={a.thumbnail} alt="" className="aspect-video w-full object-cover" />
                    : <div className="flex aspect-video items-center justify-center bg-ui-ground"><FileText aria-hidden="true" className="h-10 w-10 text-ui-muted" /></div>}
                  <div className="space-y-2 p-4">
                    <button type="button" onClick={() => openFromCard(analysisNodeId(a))} className="line-clamp-2 text-left text-sm font-semibold text-ui-ink hover:underline">{title(a)}</button>
                    <AnalysisInfo a={a} />
                    {selectAllButton(a)}
                    {a.summary && <p className="line-clamp-4 text-sm text-ui-muted">{a.summary}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PageShell>
  )
}
