'use client'
import Link from 'next/link'
import { Send, Youtube, Instagram, Mail, Smartphone, Apple } from 'lucide-react'

const COL_TITLE = 'font-sign text-base font-bold uppercase tracking-[0.06em] text-metro-plaque-ink/70'
const LINK = 'inline-block py-1.5 text-base text-metro-plaque-ink hover:text-white hover:underline underline-offset-4'
const SOCIAL = 'flex h-11 w-11 items-center justify-center rounded-[6px] text-metro-plaque-ink shadow-[inset_0_0_0_2px_rgb(var(--m-plaque-ink)/0.25)] transition hover:text-white hover:shadow-[inset_0_0_0_2px_rgb(var(--m-plaque-ink)/0.7)]'

/** Chiqish taxtasi: bekatdan chiqishdagi yo'nalish ko'rsatkichi kabi -- granit fon, ustunlar. */
export default function Footer() {
  return (
    <footer className="relative z-10 w-full border-t-[10px] border-metro-red bg-metro-plaque text-metro-plaque-ink">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <Link href="/" aria-label="GapirAI.uz — bosh sahifa" className="inline-block">
              <img src="/logodark.webp" alt="" width={160} height={40} className="h-10 w-auto" />
            </Link>
            <p className="max-w-[34ch] text-base leading-relaxed text-metro-plaque-ink/80">
              Videolarni sun&apos;iy intellekt yordamida o&apos;zbek tiliga dublyaj qiluvchi platforma.
            </p>
            <p className="text-sm text-metro-plaque-ink/70">© {new Date().getFullYear()} GapirAI.uz. Barcha huquqlar himoyalangan.</p>
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
              <Link href="/install#android" className="inline-flex h-11 items-center gap-2 rounded-[6px] bg-metro-plaque-ink px-4 font-sign text-base font-bold uppercase tracking-wide text-metro-plaque hover:bg-white">
                <Smartphone aria-hidden="true" className="h-4 w-4" /> Android
              </Link>
              <Link href="/install#ios" className="inline-flex h-11 items-center gap-2 rounded-[6px] bg-metro-plaque-ink px-4 font-sign text-base font-bold uppercase tracking-wide text-metro-plaque hover:bg-white">
                <Apple aria-hidden="true" className="h-4 w-4" /> iPhone
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-metro-plaque-ink/20 pt-8 sm:flex-row sm:items-center">
          <h2 className={`${COL_TITLE} shrink-0`}>To&apos;lov</h2>
          <ul className="flex flex-wrap items-center gap-2.5" aria-label="Qabul qilinadigan to'lov usullari">
            {[
              ['/logos/click.png', 'Click'],
              ['/logos/payme.png', 'Payme'],
              ['/logos/uzum.png', 'Uzum'],
              ['/logos/paynetlogo.png', 'Paynet'],
            ].map(([src, name]) => (
              <li key={name} className="flex h-11 w-24 items-center justify-center rounded-[6px] bg-white px-3">
                <img src={src} alt={name} className="max-h-6 w-auto max-w-full object-contain" />
              </li>
            ))}
          </ul>
          <Link href="/terms#tolovlar" className="text-sm text-metro-plaque-ink/80 underline underline-offset-4 hover:text-white sm:ml-auto">
            To&apos;lov usullari va xavfsizlik
          </Link>
        </div>
      </div>
    </footer>
  )
}
