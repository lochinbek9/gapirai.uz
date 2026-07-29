'use client'
import Link from 'next/link'
import { Send, Youtube, Instagram, Github, Mail, ShieldCheck, FileText, Users, Info } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="w-full relative z-10 border-t border-black/5 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-xl transition-colors mt-20">
      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">

          {/* Column 1: Brand Info */}
          <div className="space-y-4">
            <Link href="/" className="inline-block transition duration-300 hover:scale-105">
              <img src="/logo.png" alt="Xadichai.uz" className="h-10 w-auto object-contain dark:hidden" />
              <img src="/logodark.png" alt="Xadichai.uz" className="h-10 w-auto object-contain hidden dark:block" />
            </Link>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed font-medium">
              Videolarni Sun'iy Intellekt yordamida yuqori sifatda avtomatik o'zbek tiliga dublyaj qiluvchi birinchi innovatsion platforma.
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold pt-2">
              © {new Date().getFullYear()} Xadichai.uz. Barcha huquqlar himoyalangan.
            </p>
          </div>

          {/* Column 2: Biz haqimizda */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Biz haqimizda
            </h3>
            <ul className="space-y-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              <li>
                <Link href="/about" className="hover:text-red-600 dark:hover:text-red-400 transition">Loyiha haqida</Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-red-600 dark:hover:text-red-400 transition">Xizmatlarimiz</Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-red-600 dark:hover:text-red-400 transition">Qanday ishlaydi?</Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-red-600 dark:hover:text-red-400 transition">Afzalliklarimiz</Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Community & Terms */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Hamjamiyat va Qoidalar
            </h3>
            <ul className="space-y-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              <li>
                <a
                  href="https://t.me/xadichai_uz_jamiyati"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-red-600 dark:hover:text-red-400 transition inline-flex items-center gap-1"
                >
                  Hamjamiyat (Community)
                </a>
              </li>
              <li>
                <Link href="/" className="hover:text-red-600 dark:hover:text-red-400 transition">Foydalanish shartlari (Terms)</Link>
              </li>
              <li>
                <Link href="/" className="hover:text-red-600 dark:hover:text-red-400 transition">Maxfiylik siyosati</Link>
              </li>
              <li>
                <Link href="/" className="hover:text-red-600 dark:hover:text-red-400 transition">Yordam va Savollar (FAQ)</Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Ijtimoiy tarmoqlar */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">
              Ijtimoiy tarmoqlarimiz
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
              Bizni tarmoqlarda kuzatib boring va yangiliklardan xabardor bo'ling:
            </p>
            <div className="flex items-center gap-2.5 pt-1">
              <a
                href="https://t.me/xadichai_uz"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="w-9 h-9 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-red-500 hover:text-white dark:hover:bg-red-500 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 transition duration-300 shadow-sm"
              >
                <Send className="w-4 h-4" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="w-9 h-9 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-red-500 hover:text-white dark:hover:bg-red-500 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 transition duration-300 shadow-sm"
              >
                <Youtube className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-9 h-9 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-red-500 hover:text-white dark:hover:bg-red-500 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 transition duration-300 shadow-sm"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="mailto:support@xadichai.uz"
                aria-label="Email"
                className="w-9 h-9 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-red-500 hover:text-white dark:hover:bg-red-500 border border-black/5 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 transition duration-300 shadow-sm"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

        </div>
      </div>
    </footer>
  )
}
