'use client'
import Link from 'next/link'
import { Send, Youtube, Instagram, Mail, ShieldCheck, Info, Smartphone, Apple, Heart } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="w-full relative z-10 border-t border-black/5 dark:border-white/10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl transition-colors mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">

          {/* Column 1: Brand Info */}
          <div className="space-y-4">
            <Link href="/" aria-label="GapirAI.uz — bosh sahifa" className="inline-block transition duration-300 hover:scale-105">
              <img src="/logo.webp" alt="" width={160} height={40} className="h-10 w-auto object-contain dark:hidden" style={{ maxWidth: "200px", maxHeight: "48px", height: "auto" }} />
              <img src="/logodark.webp" alt="" width={160} height={40} className="h-10 w-auto object-contain hidden dark:block" style={{ maxWidth: "200px", maxHeight: "48px", height: "auto" }} />
            </Link>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed font-medium">
              Videolarni sun&apos;iy intellekt yordamida yuqori sifatda avtomatik o&apos;zbek tiliga dublyaj qiluvchi birinchi innovatsion platforma.
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold pt-2">
              © {new Date().getFullYear()} GapirAI.uz. Barcha huquqlar himoyalangan.
            </p>
          </div>

          {/* Column 2: Biz haqimizda */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
              <Info aria-hidden="true" className="w-3.5 h-3.5" /> Biz haqimizda
            </h2>
            <ul className="space-y-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              <li>
                <Link href="/about" className="inline-block py-1 hover:text-blue-700 dark:hover:text-blue-300 transition">Loyiha haqida</Link>
              </li>
              <li>
                <Link href="/#qanday-ishlaydi" className="inline-block py-1 hover:text-blue-700 dark:hover:text-blue-300 transition">Qanday ishlaydi?</Link>
              </li>
              <li>
                <Link href="/videos" className="inline-block py-1 hover:text-blue-700 dark:hover:text-blue-300 transition">Ommaviy videolar</Link>
              </li>
              <li>
                <Link href="/donate" className="inline-flex items-center gap-1 py-1 font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition">
                  <Heart aria-hidden="true" className="w-3.5 h-3.5" fill="currentColor" /> Loyihani qo‘llab-quvvatlash
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Community & Terms */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5" /> Hamjamiyat va qoidalar
            </h2>
            <ul className="space-y-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              <li>
                <a
                  href="https://t.me/gapir_uz_muhokama"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block py-1 hover:text-blue-700 dark:hover:text-blue-300 transition"
                >
                  Hamjamiyat <span className="sr-only">(Telegram guruhi, yangi oynada)</span>
                </a>
              </li>
              <li>
                <Link href="/terms" className="inline-block py-1 hover:text-blue-700 dark:hover:text-blue-300 transition">Foydalanish shartlari</Link>
              </li>
              <li>
                <Link href="/privacy" className="inline-block py-1 hover:text-blue-700 dark:hover:text-blue-300 transition">Maxfiylik siyosati</Link>
              </li>
              <li>
                <Link href="/faq" className="inline-block py-1 hover:text-blue-700 dark:hover:text-blue-300 transition">Yordam va savollar</Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Ijtimoiy tarmoqlar */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
              Ijtimoiy tarmoqlarimiz
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
              Bizni tarmoqlarda kuzatib boring va yangiliklardan xabardor bo&apos;ling:
            </p>
            <div className="flex items-center gap-2.5 pt-1">
              <a
                href="https://t.me/gapirai_uz"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram kanalimiz (yangi oynada)"
                className="w-11 h-11 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 transition duration-300 shadow-sm"
              >
                <Send aria-hidden="true" className="w-4 h-4" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube kanalimiz (yangi oynada)"
                className="w-11 h-11 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 transition duration-300 shadow-sm"
              >
                <Youtube aria-hidden="true" className="w-4 h-4" />
              </a>
              <a
                href="https://www.instagram.com/gapirai_uz/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram sahifamiz (yangi oynada)"
                className="w-11 h-11 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 transition duration-300 shadow-sm"
              >
                <Instagram aria-hidden="true" className="w-4 h-4" />
              </a>
              <a
                href="mailto:lodexgroups@gmail.com"
                aria-label="Bizga email yozing"
                className="w-11 h-11 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 transition duration-300 shadow-sm"
              >
                <Mail aria-hidden="true" className="w-4 h-4" />
              </a>
            </div>
          </div>

        </div>

        <div className="mt-10 pt-8 border-t border-black/5 dark:border-white/10 flex flex-col sm:flex-row sm:items-center gap-4">
          <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest shrink-0">
            Telefonga o&apos;rnatish
          </h2>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/install#android"
              className="flex items-center gap-2.5 h-11 px-4 rounded-xl bg-gray-900 text-white hover:bg-black dark:bg-white/10 dark:hover:bg-white/20 border border-black/5 dark:border-white/10 transition"
            >
              <Smartphone aria-hidden="true" className="w-4 h-4 shrink-0" />
              <span className="leading-none text-left">
                <span className="block text-[11px] opacity-80">Ilova (PWA)</span>
                <span className="block text-sm font-bold">Android</span>
              </span>
            </Link>
            <Link
              href="/install#ios"
              className="flex items-center gap-2.5 h-11 px-4 rounded-xl bg-gray-900 text-white hover:bg-black dark:bg-white/10 dark:hover:bg-white/20 border border-black/5 dark:border-white/10 transition"
            >
              <Apple aria-hidden="true" className="w-4 h-4 shrink-0" />
              <span className="leading-none text-left">
                <span className="block text-[11px] opacity-80">Ilova (PWA)</span>
                <span className="block text-sm font-bold">iPhone</span>
              </span>
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest shrink-0">
            To&apos;lov turlari
          </h2>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center justify-center h-11 w-24 px-3 rounded-xl bg-gray-100 border border-black/5 dark:border-white/10">
              <img src="/logos/click.png" alt="Click" className="max-h-6 max-w-full w-auto object-contain" />
            </div>
            <div className="flex items-center justify-center h-11 w-24 px-3 rounded-xl bg-gray-100 border border-black/5 dark:border-white/10">
              <img src="/logos/payme.png" alt="Payme" className="max-h-6 max-w-full w-auto object-contain" />
            </div>
            <div className="flex items-center justify-center h-11 w-24 px-3 rounded-xl bg-gray-100 border border-black/5 dark:border-white/10">
              <img src="/logos/uzum.png" alt="Uzum" className="max-h-6 max-w-full w-auto object-contain" />
            </div>
            <div className="flex items-center justify-center h-11 w-24 px-3 rounded-xl bg-gray-100 border border-black/5 dark:border-white/10">
              <img src="/logos/paynetlogo.png" alt="Paynet" className="max-h-6 max-w-full w-auto object-contain" />
            </div>
          </div>
          <Link
            href="/terms#tolovlar"
            className="inline-block py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-300 transition underline underline-offset-2"
          >
            To&apos;lov usullari va xavfsizlik haqida batafsil
          </Link>
        </div>
      </div>
    </footer>
  )
}
