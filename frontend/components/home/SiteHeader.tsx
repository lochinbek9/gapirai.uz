'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import ThemeToggle from '@/components/ThemeToggle'
import MobileNavMenu from '@/components/MobileNavMenu'

const NAV = 'inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-ui-muted transition hover:bg-ui-ground hover:text-ui-ink'

export default function SiteHeader({ current }: { current?: 'videos' | 'pricing' }) {
  const { isLoggedIn } = useAuth()
  return (
    <header className="sticky top-0 z-50 w-full border-b border-ui-rule bg-ui-surface/90 backdrop-blur supports-[backdrop-filter]:bg-ui-surface/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" aria-label="GapirAI.uz — bosh sahifa" className="mr-4 flex shrink-0 items-center">
          <img src="/logo.webp" alt="" width={120} height={32} className="h-8 w-auto dark:hidden" />
          <img src="/logodark.webp" alt="" width={120} height={32} className="hidden h-8 w-auto dark:block" />
        </Link>
        <nav aria-label="Asosiy menyu" className="hidden items-center gap-1 md:flex">
          <Link href="/videos" aria-current={current === 'videos' ? 'page' : undefined} className={`${NAV} ${current === 'videos' ? 'text-ui-ink' : ''}`}>Ommaviy videolar</Link>
          <Link href="/pricing" aria-current={current === 'pricing' ? 'page' : undefined} className={`${NAV} ${current === 'pricing' ? 'text-ui-ink' : ''}`}>Tariflar</Link>
          <a href="https://t.me/gapirai_uz_bot" target="_blank" rel="noopener noreferrer" className={NAV}>
            Telegram bot<span className="sr-only"> (yangi oynada)</span>
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {isLoggedIn ? (
            <Link href="/dashboard" className="ui-btn ui-btn-primary min-h-9 px-3.5 text-sm">
              <span className="hidden sm:inline">Mening videolarim</span>
              <span className="sm:hidden">Videolarim</span>
            </Link>
          ) : (
            <>
              <Link href="/login" className="ui-btn ui-btn-secondary hidden min-h-9 px-3.5 text-sm sm:inline-flex">Kirish</Link>
              <Link href="/register" className="ui-btn ui-btn-primary min-h-9 px-3.5 text-sm">Bepul boshlash</Link>
            </>
          )}
          <ThemeToggle tone="plain" />
          <MobileNavMenu tone="plain" />
        </div>
      </div>
    </header>
  )
}
