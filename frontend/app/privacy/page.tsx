'use client'
import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-12 px-4 sm:px-6 relative overflow-hidden">
      {/* Glow effects */}
      <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-3xl z-10 space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition duration-200"
        >
          <ArrowLeft className="w-4 h-4" /> Bosh sahifaga qaytish
        </Link>

        <div className="bg-slate-900/50 border border-slate-800/80 rounded-[32px] p-6 sm:p-10 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-800/80 pb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">Maxfiylik siyosati</h1>
              <p className="text-xs text-slate-500">Oxirgi yangilanish: 2026-yil 4-avgust</p>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-6">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">1. Biz to'playdigan ma'lumotlar</h2>
              <p>
                Platformamizdan foydalanganingizda, xizmat ko'rsatish sifatini oshirish maqsadida quyidagi ma'lumotlarni to'playmiz:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Siz kiritgan YouTube video manzillari va davomiyligi;</li>
                <li>Tizimga kirish uchun foydalanadigan login va elektron pochta manzili;</li>
                <li>To'lov tafsilotlari (to'lovlar bevosita Click to'lov shlyuzi orqali amalga oshiriladi va biz kartangiz ma'lumotlarini saqlamaymiz).</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">2. Ma'lumotlardan foydalanish</h2>
              <p>To'plangan ma'lumotlar faqat quyidagi maqsadlarda ishlatiladi:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Dublyaj va tarjima jarayonini amalga oshirish;</li>
                <li>Hisob-kitoblar va to'lovlarni amalga oshirish hamda tasdiqlash;</li>
                <li>Texnik muammolarni bartaraf etish va foydalanuvchilarni qo'llab-quvvatlash.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">3. Ma'lumotlar xavfsizligi</h2>
              <p>
                Biz sizning shaxsiy ma'lumotlaringiz xavfsizligini ta'minlash uchun SSL shifrlash va zamonaviy xavfsizlik protokollaridan foydalanamiz. Biroq, internet orqali ma'lumot uzatishning 100% xavfsizligini kafolatlab bo'lmaydi.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">4. Uchinchi shaxslarga ma'lumot uzatish</h2>
              <p>
                Xizmat ko'rsatish jarayonida matnlarni tarjima qilish uchun OpenAI va nutq sintezi uchun Microsoft Azure xizmatlariga faqatgina videodagi matnli ma'lumotlar uzatiladi. Sizning shaxsiy ma'lumotlaringiz uchinchi shaxslarga sotilmaydi.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
