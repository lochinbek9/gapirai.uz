'use client'
import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'

export type NodeKind = 'channel' | 'analysis' | 'idea'
export interface GraphNode { id: string; kind: NodeKind; label: string; selected?: boolean; dimmed?: boolean }
export interface GraphLink { source: string; target: string }

interface Point { x: number; y: number; vx: number; vy: number }

const RADIUS: Record<NodeKind, number> = { channel: 15, analysis: 10, idea: 6 }
const COLOR: Record<NodeKind, string> = { channel: '#8b5cf6', analysis: '#3b82f6', idea: '#10b981' }
const short = (s: string) => (s.length > 34 ? `${s.slice(0, 33)}…` : s)

/** Obsidian uslubidagi kuch-yo'naltirilgan graph (tashqi kutubxonasiz, SVG).
 *  Chiziqlar faqat berilgan `links` bo'yicha -- o'zi hech qanday bog'lanish qo'shmaydi. */
export default function BrainGraph({
  nodes, links, activeId, onSelect,
}: {
  nodes: GraphNode[]
  links: GraphLink[]
  activeId: string | null
  onSelect: (id: string | null) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const points = useRef(new Map<string, Point>())
  const alpha = useRef(1)
  const drag = useRef<{ id: string | null; x: number; y: number; moved: boolean } | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  // true -- graf doim maydonga sig'adigan o'lchamda; foydalanuvchi surgan/kattalashtirganda o'chadi
  const [auto, setAuto] = useState(true)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // Yangi tugunlar spiral bo'ylab joylanadi; mavjudlarining o'rni saqlanadi
  nodes.forEach((n, i) => {
    if (!points.current.has(n.id)) {
      const a = i * 2.39996
      const r = 24 * Math.sqrt(i + 1)
      points.current.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 })
    }
  })

  const signature = nodes.map((n) => n.id).join('|') + links.length
  const data = useRef({ nodes, links })
  data.current = { nodes, links }

  useEffect(() => {
    alpha.current = 1
    let frame = 0
    const step = () => {
      frame = requestAnimationFrame(step)
      if (alpha.current < 0.02) return
      const { nodes: ns, links: ls } = data.current
      const a = alpha.current
      const pts = ns.map((n) => points.current.get(n.id)!)
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          let dx = pts[j].x - pts[i].x
          let dy = pts[j].y - pts[i].y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1 }
          if (d2 > 250_000) continue
          const f = (2200 * a) / Math.max(d2, 100)
          pts[i].vx -= dx * f; pts[i].vy -= dy * f
          pts[j].vx += dx * f; pts[j].vy += dy * f
        }
      }
      for (const l of ls) {
        const s = points.current.get(l.source)
        const t = points.current.get(l.target)
        if (!s || !t) continue
        const dx = t.x - s.x
        const dy = t.y - s.y
        const d = Math.hypot(dx, dy) || 1
        const f = ((d - 80) / d) * 0.06 * a
        s.vx += dx * f; s.vy += dy * f
        t.vx -= dx * f; t.vy -= dy * f
      }
      ns.forEach((n, i) => {
        const p = pts[i]
        if (drag.current?.id === n.id) { p.vx = 0; p.vy = 0; return }
        p.vx = (p.vx - p.x * 0.012 * a) * 0.82
        p.vy = (p.vy - p.y * 0.012 * a) * 0.82
        p.x += Math.max(-25, Math.min(25, p.vx))
        p.y += Math.max(-25, Math.min(25, p.vy))
      })
      alpha.current *= 0.985
      setTick((v) => v + 1)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [signature])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /** Barcha tugun va yozuvlar sig'adigan ko'rinish */
  const fitted = () => {
    const pts = nodes.map((n) => points.current.get(n.id)!)
    if (!pts.length || !size.w) return { x: 0, y: 0, k: 1 }
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    // yozuvlar uchun chekka; tepada legenda, pastda tugmalar uchun joy
    const minX = Math.min(...xs) - 110, maxX = Math.max(...xs) + 110
    const minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 40
    const k = Math.min(1.6, size.w / (maxX - minX), (size.h - 110) / (maxY - minY))
    return { k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k }
  }
  const shown = auto ? fitted() : view
  const shownRef = useRef(shown)
  shownRef.current = shown

  const zoom = (factor: number) => {
    const v = shownRef.current
    setAuto(false)
    setView({ x: v.x * factor, y: v.y * factor, k: v.k * factor })
  }

  // React'ning onWheel'i passive -- sahifa aylanib ketmasligi uchun qo'lda ulanadi
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = el.getBoundingClientRect()
      const mx = e.clientX - box.left - box.width / 2
      const my = e.clientY - box.top - box.height / 2
      const v = shownRef.current
      const k = Math.max(0.1, Math.min(4, v.k * Math.exp(-e.deltaY * 0.0015)))
      const next = { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
      shownRef.current = next
      setAuto(false)
      setView(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const down = (e: React.PointerEvent, id: string | null) => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true; d.x = e.clientX; d.y = e.clientY
    // Qo'l bilan surishda joriy (avtomatik) ko'rinish muzlatiladi
    if (auto) { setView(shown); setAuto(false) }
    if (d.id) {
      const p = points.current.get(d.id)!
      p.x += dx / shown.k; p.y += dy / shown.k
      alpha.current = Math.max(alpha.current, 0.3)
      setTick((v) => v + 1)
    } else {
      setView((v) => { const base = auto ? shown : v; return { ...base, x: base.x + dx, y: base.y + dy } })
    }
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) onSelect(d.id)
  }

  const focus = hover ?? activeId
  const near = new Set<string>()
  if (focus && nodes.some((n) => n.id === focus)) {
    near.add(focus)
    links.forEach((l) => {
      if (l.source === focus) near.add(l.target)
      if (l.target === focus) near.add(l.source)
    })
  }

  return (
    <div className="relative h-[65vh] min-h-[420px] overflow-hidden rounded-card border border-ui-rule bg-ui-ground">
      <svg
        ref={svgRef}
        role="img"
        aria-label={`Miyya grafi: ${nodes.length} tugun`}
        className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={(e) => down(e, null)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => { drag.current = null }}
      >
        <svg x="50%" y="50%" overflow="visible">
          <g transform={`translate(${shown.x} ${shown.y}) scale(${shown.k})`}>
            {links.map((l) => {
              const s = points.current.get(l.source)
              const t = points.current.get(l.target)
              if (!s || !t) return null
              const on = near.size > 0 && (l.source === focus || l.target === focus)
              return (
                <line key={`${l.source}>${l.target}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke="currentColor" className="text-ui-muted"
                  strokeOpacity={on ? 0.8 : near.size ? 0.08 : 0.3} strokeWidth={on ? 1.6 : 1} />
              )
            })}
            {nodes.map((n) => {
              const p = points.current.get(n.id)!
              const faded = (near.size > 0 && !near.has(n.id)) || n.dimmed
              const showLabel = n.kind !== 'idea' || near.has(n.id) || shown.k > 1.25
              return (
                <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={faded ? 0.22 : 1}
                  className="cursor-pointer"
                  onPointerDown={(e) => down(e, n.id)}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}>
                  {(n.selected || n.id === activeId) && (
                    <circle r={RADIUS[n.kind] + 4} fill="none" strokeWidth={2}
                      stroke={n.id === activeId ? 'currentColor' : '#f59e0b'} className="text-ui-ink" />
                  )}
                  <circle r={RADIUS[n.kind]} fill={COLOR[n.kind]} />
                  {showLabel && (
                    <text y={RADIUS[n.kind] + 14} textAnchor="middle" fill="currentColor"
                      className="pointer-events-none text-ui-ink" fontSize={n.kind === 'idea' ? 10 : 11}
                      fontWeight={n.kind === 'channel' ? 600 : 400}>
                      {short(n.label)}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-3 rounded-lg bg-ui-surface/90 px-3 py-1.5 text-xs text-ui-muted">
        {([['channel', 'Kanal'], ['analysis', 'Tahlil'], ['idea', 'Fikr']] as const).map(([kind, name]) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[kind] }} />{name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-amber-500" />Tanlangan
        </span>
      </div>
      <div className="absolute bottom-3 right-3 flex gap-1">
        {([['Kattalashtirish', Plus, () => zoom(1.25)], ['Kichiklashtirish', Minus, () => zoom(0.8)], ['Maydonga sigʻdirish', Maximize2, () => setAuto(true)]] as const).map(([label, Icon, action]) => (
          <button key={label} type="button" aria-label={label} title={label} onClick={action}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ui-rule bg-ui-surface text-ui-muted hover:text-ui-ink">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  )
}
