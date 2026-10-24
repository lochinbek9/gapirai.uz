'use client'
import Link from 'next/link'
import { Send, Youtube, Instagram, Mail, Smartphone, Apple } from 'lucide-react'

const COL_TITLE = 'text-sm font-medium text-ui-ink'
const LINK = 'inline-block py-1.5 text-[15px] text-ui-muted transition hover:text-ui-ink'
const SOCIAL = 'flex h-10 w-10 items-center justify-center rounded-lg border border-ui-rule text-ui-muted transition hover:bg-ui-surface hover:text-ui-ink'

export default function Footer() {
  return (
    <footer className="relative z-10 w-full border-t border-ui-rule bg-ui-ground text-ui-ink">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <Link href="/" aria-label="GapirAI.uz — bosh sahifa" className="inline-block">
              <img src="/logo.webp" alt="" width={128} height={32} className="h-8 w-auto dark:hidden" />
              <img src="/logodark.webp" alt="" width={128} height={32} className="hidden h-8 w-auto dark:block" />
            </Link>
            <p className="max-w-[34ch] text-[15px] leading-relaxed text-ui-muted">
              Videolarni sun&apos;iy intellekt yordamida o&apos;zbek tiliga dublyaj qiluvchi platforma.
            </p>
            <p className="text-sm text-ui-muted">© {new Date().getFullYear()} GapirAI.uz. Barcha huquqlar himoyalangan.</p>
          </div>

          <div>
            <h2 className={COL_TITLE}>Loyiha</h2>
            <ul className="mt-3 space-y-1">
              <li><Link href="/about" className={LINK}>Loyiha haqida</Link></li>
              <li><Link href="/#qanday-ishlaydi" className={LINK}>Qanday ishlaydi?</Link></li>
              <li><Link href="/videos" className={LINK}>Ommaviy videolar</Link></li>
              <li><Link href="/pricing" className={LINK}>Tariflar</Link></li>
              <li><Link href="/donate" className={LINK}>Loyihani qo&apos;llab-quvvatlash</Link></li>
            </ul>
          </div>

          <div>
            <h2 className={COL_TITLE}>Hamjamiyat va qoidalar</h2>
            <ul className="mt-3 space-y-1">
              <li>
                <a href="https://t.me/gapir_uz_muhokama" target="_blank" rel="noopener noreferrer" className={LINK}>
                  Hamjamiyat <span className="sr-only">(Telegram guruhi, yangi oynada)</span>
                </a>
              </li>
              <li><Link href="/terms" className={LINK}>Foydalanish shartlari</Link></li>
              <li><Link href="/privacy" className={LINK}>Maxfiylik siyosati</Link></li>
              <li><Link href="/faq" className={LINK}>Yordam va savollar</Link></li>
            </ul>
          </div>

          <div>
            <h2 className={COL_TITLE}>Ijtimoiy tarmoqlar</h2>
            <div className="mt-4 flex items-center gap-2.5">
              <a href="https://t.me/gapirai_uz" target="_blank" rel="noopener noreferrer" aria-label="Telegram kanalimiz (yangi oynada)" className={SOCIAL}>
                <Send aria-hidden="true" className="h-4 w-4" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube kanalimiz (yangi oynada)" className={SOCIAL}>
                <Youtube aria-hidden="true" className="h-4 w-4" />
              </a>
              <a href="https://www.instagram.com/gapirai_uz/" target="_blank" rel="noopener noreferrer" aria-label="Instagram sahifamiz (yangi oynada)" className={SOCIAL}>
                <Instagram aria-hidden="true" className="h-4 w-4" />
              </a>
              <a href="mailto:lodexgroups@gmail.com" aria-label="Bizga email yozing" className={SOCIAL}>
                <Mail aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
            <h2 className={`${COL_TITLE} mt-8`}>Telefonga o&apos;rnatish</h2>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <Link href="/install#android" className="ui-btn ui-btn-secondary min-h-10 px-3.5 text-sm">
                <Smartphone aria-hidden="true" className="h-4 w-4" /> Android
              </Link>
              <Link href="/install#ios" className="ui-btn ui-btn-secondary min-h-10 px-3.5 text-sm">
                <Apple aria-hidden="true" className="h-4 w-4" /> iPhone
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-ui-rule pt-8 sm:flex-row sm:items-center">
          <h2 className={`${COL_TITLE} shrink-0`}>To&apos;lov</h2>
          <ul className="flex flex-wrap items-center gap-2.5" aria-label="Qabul qilinadigan to'lov usullari">
            {[
              ['/logos/click.png', 'Click'],
              ['/logos/payme.png', 'Payme'],
              ['/logos/uzum.png', 'Uzum'],
              ['/logos/paynetlogo.png', 'Paynet'],
            ].map(([src, name]) => (
              <li key={name} className="flex h-10 w-24 items-center justify-center rounded-lg border border-ui-rule bg-white px-3">
                <img src={src} alt={name} className="max-h-6 w-auto max-w-full object-contain" />
              </li>
            ))}
          </ul>
          <Link href="/terms#tolovlar" className="text-sm text-ui-muted underline underline-offset-4 hover:text-ui-ink sm:ml-auto">
            To&apos;lov usullari va xavfsizlik
          </Link>
        </div>
      </div>
    </footer>
  )
}
