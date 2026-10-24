'use client'

import Link from 'next/link'
import { LayoutDashboard, LogIn } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import ThemeToggle from '@/components/ThemeToggle'
import MobileNavMenu from '@/components/MobileNavMenu'
import { LINES, type LineId } from './lines'

interface Props {
  /** Bosh sahifada liniya tugmalari formadagi rejimni almashtiradi; boshqa sahifalarda /?mode= ga olib boradi */
  onLineSelect?: (line: LineId) => void
  activeLine?: LineId
  current?: 'videos' | 'pricing'
}

const NAV_LINK =
  'inline-flex min-h-10 items-center rounded-[4px] px-2.5 font-sign text-[15px] font-bold uppercase tracking-wide text-metro-plaque-ink/85 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-plaque-ink'

/** Granit polosa: bekatdagi yo'nalish taxtasi. Har doim to'q fonda -- shuning uchun logoning och varianti. */
export default function SiteHeader({ onLineSelect, activeLine, current }: Props) {
  const { isLoggedIn } = useAuth()

  return (
    <header className="sticky top-0 z-50 w-full bg-metro-plaque text-metro-plaque-ink">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="GapirAI.uz — bosh sahifa" className="flex shrink-0 items-center">
          <img src="/logodark.webp" alt="" width={132} height={34} className="h-8 w-auto sm:h-9" />
        </Link>

        <nav aria-label="Asosiy menyu" className="ml-4 hidden flex-1 items-center gap-1 md:flex">
          <ul className="hidden items-center gap-1 lg:flex" aria-label="Xizmatlar">
            {(Object.keys(LINES) as LineId[]).map((id) => {
              const line = LINES[id]
              const dot = <span aria-hidden className={`mr-2 inline-block h-3 w-3 rounded-full ${line.bg}`} />
              const active = activeLine === id
              return (
                <li key={id}>
                  {onLineSelect ? (
                    <button type="button" onClick={() => onLineSelect(id)} aria-pressed={active} className={`${NAV_LINK} ${active ? 'text-white' : ''}`}>
                      {dot}
                      {line.name}
                    </button>
                  ) : (
                    <Link href={`/?mode=${id}`} className={NAV_LINK}>
                      {dot}
                      {line.name}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
          <span aria-hidden className="mx-2 hidden h-6 w-px bg-metro-plaque-ink/25 lg:block" />
          <Link href="/videos" aria-current={current === 'videos' ? 'page' : undefined} className={`${NAV_LINK} ${current === 'videos' ? 'text-white underline underline-offset-8' : ''}`}>
            Ommaviy videolar
          </Link>
          <Link href="/pricing" aria-current={current === 'pricing' ? 'page' : undefined} className={`${NAV_LINK} ${current === 'pricing' ? 'text-white underline underline-offset-8' : ''}`}>
            Tariflar
          </Link>
          <Link href="/donate" className={NAV_LINK}>
            Donat
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-metro-plaque-ink px-3.5 font-sign text-[15px] font-bold uppercase tracking-wide text-metro-plaque transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-metro-plaque focus-visible:ring-metro-plaque-ink"
          >
            {isLoggedIn ? <LayoutDashboard aria-hidden="true" className="h-4 w-4" /> : <LogIn aria-hidden="true" className="h-4 w-4" />}
            {isLoggedIn ? (
              <>
                <span className="hidden sm:inline">Mening videolarim</span>
                <span className="sm:hidden">Videolarim</span>
              </>
            ) : (
              'Kirish'
            )}
          </Link>
          <ThemeToggle tone="bar" />
          <MobileNavMenu tone="bar" />
        </div>
      </div>
    </header>
  )
}
