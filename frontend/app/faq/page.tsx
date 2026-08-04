'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const FAQS = [
  {
    q: "Xadichai.uz qanday ishlaydi?",
    a: "Platformamizga xorijiy tildagi YouTube video havolasini kiritganingizda, tizim avtomatik ravishda audioni ajratib oladi, nutqni matnga aylantiradi (OpenAI Whisper), o'zbek tiliga professional darajada tarjima qiladi (GPT-4o) hamda eng so'nggi ovoz sintezi (Azure Speech AI) yordamida o'zbek tilida tabiiy ovoz beradi."
  },
  {
    q: "Platformadan foydalanish bepulmi?",
    a: "Ha, davomiyligi 1 soat (60 daqiqa) gacha bo'lgan videolarni o'zbek tiliga o'girish to'liq bepul. 1 soatdan uzun videolarni dublyaj qilish uchun esa Click tizimi orqali to'lov amalga oshirilishi talab qilinadi."
  },
  {
    q: "Dublyaj qilish qancha vaqt oladi?",
    a: "O'rtacha hisobda videoni qayta ishlash davomiyligi video uzunligining 30% ini tashkil qiladi. Masalan, 10 daqiqalik video taxminan 3 daqiqa ichida tayyor bo'ladi. Jarayon davomida taxminiy vaqt ekranda ko'rsatib turiladi."
  },
  {
    q: "Dublyaj jarayonini bekor qilsa bo'ladimi?",
    a: "Ha, jarayon davomida xohlagan vaqtingizda 'Jarayonni bekor qilish' tugmasini bosib, ishni to'xtatishingiz mumkin. Agar video bepul bo'lsa, hech qanday to'lov yo'qolmaydi."
  },
  {
    q: "Agar dublyaj jarayonida xatolik yuz bersa nima bo'ladi?",
    a: "Agar tizimda yoki tarjimada xatolik yuz bersa, tizim avtomatik ravishda jarayonni qayta tiklashga (retry) harakat qiladi. Agar butunlay muvaffaqiyatsiz bo'lsa, to'liq xatolik sababi ekranda ko'rsatiladi va siz bosh sahifaga qaytib qaytadan urinib ko'rishingiz mumkin."
  }
]

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-12 px-4 sm:px-6 relative overflow-hidden">
      {/* Glow effects */}
      <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/3 w-96 h-96 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />

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
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">Yordam va Savollar (FAQ)</h1>
              <p className="text-xs text-slate-500">Eng ko'p beriladigan savollarga javoblar</p>
            </div>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, i) => {
              const isOpen = openIndex === i
              return (
                <div
                  key={i}
                  className="border border-slate-800/80 bg-slate-950/40 rounded-2xl overflow-hidden transition-all duration-300"
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="w-full px-5 py-4 flex items-center justify-between text-left text-xs sm:text-sm font-bold text-slate-100 hover:text-white transition"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-rose-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-400 border-t border-slate-800/40 leading-relaxed">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
