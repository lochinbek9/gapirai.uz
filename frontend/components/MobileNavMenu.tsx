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
export default function MobileNavMenu() {
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
        className="flex items-center justify-center w-10 h-10 bg-white/90 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-slate-200 dark:border-white/15 text-slate-800 dark:text-white rounded-xl shadow-sm transition backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        {open ? <X aria-hidden="true" className="w-5 h-5" /> : <Menu aria-hidden="true" className="w-5 h-5" />}
      </button>
      {open && (
        <nav
          id="mobile-nav-menu"
          aria-label="Asosiy menyu"
          className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50"
        >
          <ul>
            {LINKS.map(({ href, label, icon: Icon, iconClass }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 min-h-11 px-3 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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
