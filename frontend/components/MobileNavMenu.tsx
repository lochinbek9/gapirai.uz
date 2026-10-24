'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CreditCard, Heart, Info, Menu, PlaySquare, X } from 'lucide-react'

const LINKS = [
  { href: '/videos', label: 'Ommaviy videolar', icon: PlaySquare },
  { href: '/pricing', label: 'Tariflar', icon: CreditCard },
  { href: '/donate', label: 'Donat', icon: Heart },
  { href: '/about', label: 'Loyiha haqida', icon: Info },
]

/** Telefon header'i uchun ixcham menyu: ilgari faqat ikonali (32px) havolalar
 * edi va "Haqida" umuman ko'rinmasdi. Disclosure naqshi: aria-expanded,
 * Escape / tashqariga bosish yopadi. */
export default function MobileNavMenu({ tone = 'default' }: { tone?: 'default' | 'plain' }) {
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
        className={tone === 'plain'
          ? 'flex items-center justify-center w-9 h-9 rounded-lg text-ui-muted hover:bg-ui-ground hover:text-ui-ink transition'
          : 'flex items-center justify-center w-10 h-10 bg-ui-surface hover:bg-white dark:hover:bg-white/20 border border-ui-rule text-ui-ink rounded-xl shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'}
      >
        {open ? <X aria-hidden="true" className="w-5 h-5" /> : <Menu aria-hidden="true" className="w-5 h-5" />}
      </button>
      {open && (
        <nav
          id="mobile-nav-menu"
          aria-label="Asosiy menyu"
          className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-ui-rule bg-ui-surface p-1.5 shadow-[0_12px_32px_rgb(0_0_0/0.12)] z-50"
        >
          <ul>
            {LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 min-h-11 px-3 rounded-lg text-[15px] font-medium text-ui-ink hover:bg-ui-ground"
                >
                  <Icon aria-hidden="true" className="w-4 h-4 shrink-0 text-ui-muted" />
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
