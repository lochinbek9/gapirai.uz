'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CreditCard, Heart, Info, Menu, PlaySquare, X } from 'lucide-react'

const LINKS = [
  { href: '/videos', label: 'Ommaviy videolar', icon: PlaySquare, iconClass: 'text-violet-500' },
  { href: '/pricing', label: 'Tariflar', icon: CreditCard, iconClass: 'text-violet-500' },
  { href: '/donate', label: 'Donat', icon: Heart, iconClass: 'text-rose-500' },
  { href: '/about', label: 'Loyiha haqida', icon: Info, iconClass: 'text-blue-500' },
]

/** Telefon header'i uchun ixcham menyu: ilgari faqat ikonali (32px) havolalar
 * edi va "Haqida" umuman ko'rinmasdi. Disclosure naqshi: aria-expanded,
 * Escape / tashqariga bosish yopadi. */
export default function MobileNavMenu({ tone = 'default' }: { tone?: 'default' | 'bar' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative md:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
        aria-label={open ? 'Menyuni yopish' : 'Menyu'}
        className={tone === 'bar'
          ? 'flex items-center justify-center w-10 h-10 rounded-[6px] text-metro-plaque-ink shadow-[inset_0_0_0_2px_rgb(var(--m-plaque-ink)/0.25)] hover:shadow-[inset_0_0_0_2px_rgb(var(--m-plaque-ink)/0.7)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-plaque-ink'
          : 'flex items-center justify-center w-10 h-10 bg-white/90 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-slate-200 dark:border-white/15 text-slate-800 dark:text-white rounded-xl shadow-sm transition backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500'}
      >
        {open ? <X aria-hidden="true" className="w-5 h-5" /> : <Menu aria-hidden="true" className="w-5 h-5" />}
      </button>
      {open && (
        <nav
          id="mobile-nav-menu"
          aria-label="Asosiy menyu"
          className="absolute right-0 top-full mt-2 w-60 rounded-[6px] border border-metro-rule bg-metro-surface p-1.5 shadow-[0_12px_32px_rgb(0_0_0/0.18)] z-50"
        >
          <ul>
            {LINKS.map(({ href, label, icon: Icon, iconClass }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 min-h-11 px-3 rounded-[4px] font-sign text-base font-bold uppercase tracking-wide text-metro-ink hover:bg-metro-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-blue"
                >
                  <Icon aria-hidden="true" className={`w-4 h-4 shrink-0 ${iconClass}`} {...(href === '/donate' ? { fill: 'currentColor' } : {})} />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
