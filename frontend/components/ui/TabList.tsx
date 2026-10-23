'use client'

import { KeyboardEvent, ReactNode, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
  icon?: LucideIcon
}

interface Props<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** tab/panel id'lari shundan yasaladi: `${idBase}-tab-${id}`, `${idBase}-panel` */
  idBase: string
  label: string
  className?: string
  tabClassName?: (active: boolean) => string
}

/** WAI-ARIA tabs naqshi: role=tablist/tab, aria-selected, aria-controls,
 * faqat tanlangan tab Tab tugmasi bilan fokuslanadi, ←/→/Home/End almashtiradi.
 * Panelni chaqiruvchi o'zi `tabPanelProps(idBase, value)` bilan o'raydi. */
export default function TabList<T extends string>({
  items, value, onChange, idBase, label, className = '', tabClassName,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    onChange(items[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={className}>
      {items.map((item, i) => {
        const active = item.id === value
        const Icon = item.icon
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${item.id}`}
            aria-selected={active}
            aria-controls={`${idBase}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={tabClassName?.(active)}
          >
            {Icon && <Icon aria-hidden="true" size={14} />}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function tabPanelProps(idBase: string, value: string) {
  return {
    role: 'tabpanel' as const,
    id: `${idBase}-panel`,
    'aria-labelledby': `${idBase}-tab-${value}`,
  }
}
