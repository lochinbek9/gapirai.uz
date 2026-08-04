'use client'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-12 px-4 sm:px-6 relative overflow-hidden">
      {/* Glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-3xl z-10 space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition duration-200"
        >
          <ArrowLeft className="w-4 h-4" /> Bosh sahifaga qaytish
        </Link>

        <div className="bg-slate-900/50 border border-slate-800/80 rounded-[32px] p-6 sm:p-10 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-800/80 pb-6">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">Foydalanish shartlari</h1>
              <p className="text-xs text-slate-500">Oxirgi yangilanish: 2026-yil 4-avgust</p>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-6">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">1. Umumiy qoidalar</h2>
              <p>
                Xadichai.uz platformasidan foydalanish orqali siz mazkur Foydalanish shartlariga to'liq rozilik bildirasiz. Agar siz ushbu shartlarga rozi bo'lmasangiz, platforma xizmatlaridan foydalanmasligingiz so'raladi.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">2. Xizmat tavsifi</h2>
              <p>
                Xadichai.uz foydalanuvchilarga YouTube va boshqa manbalardagi xorijiy video kontentlarni o'zbek tiliga sun'iy intellekt (AI) yordamida avtomatik ravishda tarjima va dublyaj qilish imkonini beradi. Tizim tarjima natijasini kafolatlamaydi va sinxron ovozlashtirishda kichik xatolar bo'lishi tabiiy hol hisoblanadi.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">3. Foydalanish cheklovlari</h2>
              <p>Foydalanuvchilarga quyidagilar qat'iyan taqiqlanadi:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Qonunga xilof, zo'ravonlik, nafrat uyg'otuvchi yoki kattalar uchun mo'ljallangan kontentlarni dublyaj qilish;</li>
                <li>Platforma infratuzilmasiga zarar yetkazish, sun'iy yuklamalar (DDoS) hosil qilish yoki tizimni skanerlash;</li>
                <li>Dublyaj natijalarini uchinchi shaxslarning mualliflik huquqlarini buzgan holda tijoriy maqsadlarda tarqatish.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">4. To'lovlar va qaytarish shartlari</h2>
              <p>
                Davomiyligi 1 soatdan kam bo'lgan videolar bepul taqdim etiladi. 1 soatdan ortiq davom etadigan videolarni qayta ishlash uchun Click to'lov tizimi orqali to'lov amalga oshirilishi lozim. Xizmat ko'rsatilgandan so'ng, to'langan mablag'lar qaytarilmaydi.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-white">5. Javobgarlikni cheklash</h2>
              <p>
                Xadichai.uz ma'lumotlar yo'qolishi, uchinchi shaxslar tomonidan kontent bloklanishi yoki platformadan foydalanish natijasida kelib chiqadigan bilvosita zararlar uchun javobgarlikni o'z zimmasiga olmaydi.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
