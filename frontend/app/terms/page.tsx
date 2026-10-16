'use client'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'

export default function TermsPage() {
  return (
    <div className="min-h-screen relative flex flex-col items-center py-12 px-4 sm:px-6 transition-colors duration-300">
      <MeshBackground />

      <div className="w-full max-w-3xl z-10 space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition duration-200"
        >
          <ArrowLeft className="w-4 h-4" /> Bosh sahifaga qaytish
        </Link>

        <div className="glass-card border border-black/5 dark:border-white/5 rounded-[32px] p-6 sm:p-10 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-black/5 dark:border-slate-800/80 pb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 dark:text-violet-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Foydalanish shartlari</h1>
              <p className="text-xs text-gray-500 dark:text-slate-500">
                Ommaviy oferta · Oxirgi yangilanish: 2026-yil 3-sentyabr
              </p>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-gray-600 dark:text-slate-300 leading-relaxed space-y-6">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">1. Umumiy qoidalar</h2>
              <p>
                Mazkur hujjat O'zbekiston Respublikasi Fuqarolik kodeksining 369-moddasiga muvofiq <strong>ommaviy oferta</strong> hisoblanadi. GapirAI.uz platformasida ro'yxatdan o'tish yoki uning xizmatlaridan foydalanish ushbu ofertani va Foydalanish shartlarini to'liq aksept qilish (qabul qilish) deb hisoblanadi. Agar siz ushbu shartlarga rozi bo'lmasangiz, platforma xizmatlaridan foydalanmasligingiz so'raladi.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">2. Xizmat tavsifi</h2>
              <p>
                GapirAI.uz foydalanuvchilarga YouTube va boshqa manbalardagi xorijiy video kontentlarni o'zbek tiliga sun'iy intellekt (AI) yordamida avtomatik ravishda tarjima va dublyaj qilish imkonini beradi. Tizim tarjima natijasini kafolatlamaydi va sinxron ovozlashtirishda kichik xatolar bo'lishi tabiiy hol hisoblanadi.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">3. Foydalanish cheklovlari</h2>
              <p>Foydalanuvchilarga quyidagilarni dublyaj qilish qat'iyan tavsiya etilmaydi:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Qonunga xilof, zo'ravonlik, nafrat uyg'otuvchi, terrorizm/ekstremizmni targ'ib qiluvchi yoki kattalar (18+) uchun mo'ljallangan kontent;</li>
                <li>Bolalarga nisbatan jinsiy zo'ravonlik/ekspluatatsiya tasvirlangan kontent (CSAM) — bunday kontent uchun dublyaj so'rovi <strong>hech qanday holatda</strong> bajarilmaydi va hisob qaydnomasi bloklanishi mumkin;</li>
                <li>Platforma infratuzilmasiga zarar yetkazish, sun'iy yuklamalar (DDoS) hosil qilish yoki tizimni skanerlash;</li>
                <li>Dublyaj natijalarini uchinchi shaxslarning mualliflik huquqlarini buzgan holda tijoriy maqsadlarda tarqatish.</li>
              </ul>
              <p>
                Yuqoridagi diniy, 18+, zo'ravonlik va shunga o'xshash kategoriyalar (CSAM bundan mustasno) uchun dublyaj
                jarayonining o'zi to'xtatilmaydi — video shaxsiy foydalanish uchun tayyorlanadi. Lekin bunday kontentni
                yubormaslikni so'raymiz; takroriy holatlarda hisob bloklanishi mumkin.
              </p>
            </section>

            <section id="tolovlar" className="space-y-3 scroll-mt-24">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">4. Tariflar, to'lovlar va to'lov usullari</h2>
              <p>
                GapirAI.uz xizmatlari oylik obuna tariflari va qo'shimcha daqiqa paketlari asosida taqdim etiladi. Sarf haqiqiy video davomiyligi (daqiqa) bo'yicha o'lchanadi:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Bepul (Free)</strong> — 0 so'm, oyiga 5 daqiqagacha dublyaj;</li>
                <li><strong>Standart</strong> — oyiga 49 000 so'm (yoki yiliga 490 000 so'm), oyiga 350 daqiqa;</li>
                <li><strong>Pro</strong> — oyiga 199 000 so'm (yoki yiliga 1 990 000 so'm), oyiga 600 daqiqa, premium ovoz va 1080p sifat.</li>
              </ul>
              <p>
                Oylik daqiqa hajmi tugagach, foydalanuvchi qo'shimcha daqiqa paketlarini sotib olishi mumkin: +35 daqiqa — 15 000 so'm, +70 daqiqa — 25 000 so'm, +140 daqiqa — 45 000 so'm, +350 daqiqa — 100 000 so'm. Sotib olingan daqiqalar muddatsiz bo'lib, keyingi oyga o'tadi. Bitta video uchun maksimal davomiylik — 120 daqiqa. Barcha narxlar yakuniy va O'zbekiston so'mida ko'rsatilgan.
              </p>
              <p className="font-semibold text-gray-800 dark:text-slate-200">To'lov usullari</p>
              <p>
                To'lovlar O'zbekiston Respublikasining milliy to'lov tizimlari orqali, so'mda amalga oshiriladi:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Click</strong> (click.uz) — UZCARD va HUMO kartalari;</li>
                <li><strong>Payme</strong> (payme.uz) — UZCARD va HUMO kartalari.</li>
              </ul>
              <p>
                To'lov to'lov tashkilotining himoyalangan sahifasida amalga oshiriladi. GapirAI.uz foydalanuvchining karta raqami, amal qilish muddati va maxfiy kodlarini (CVV/CVC, SMS-tasdiqlash kodi) <strong>ko'rmaydi, qabul qilmaydi va saqlamaydi</strong> — bu ma'lumotlar bevosita to'lov tizimi tomonidan PCI DSS xalqaro standartiga muvofiq qayta ishlanadi.
              </p>
              <p className="font-semibold text-gray-800 dark:text-slate-200">Avtomatik to'lov (ixtiyoriy)</p>
              <p>
                Foydalanuvchi o'z hisobida kartani bog'lab, <strong>avtomatik to'lov</strong>ni yoqishi mumkin:
                (a) <em>obunani avtomatik uzaytirish</em> — tarif muddati tugaganda bog'langan kartadan tarif
                narxi yechiladi; (b) <em>daqiqani avtomatik to'ldirish</em> — oylik daqiqa hajmi tugaganda
                dublyaj to'xtamasligi uchun mos daqiqa paketi avtomatik sotib olinadi. Avtomatik to'lov
                faqat foydalanuvchi kartani tasdiqlab, aniq rozilik bergandagina ishlaydi. Kartani bog'lashda
                SMS-kod orqali tasdiqlash talab qilinadi. Foydalanuvchi avtomatik to'lovni istalgan vaqtda
                hisobidagi sozlamalardan o'chirishi yoki kartani uzishi mumkin. Har bir avtomatik yechishdan
                so'ng foydalanuvchiga bildirishnoma yuboriladi. Kartadan to'lov amalga oshmasa, obuna bir
                necha kun imtiyozli muddat (grace) bilan saqlanadi, so'ng Bepul rejaga o'tkaziladi.
              </p>
              <p className="font-semibold text-gray-800 dark:text-slate-200">Qaytarish shartlari</p>
              <p>
                Xizmat ko'rsatilgunga qadar (dublyaj jarayoni boshlanmagan bo'lsa) foydalanuvchi to'lovni bekor qilishni so'rashi mumkin — mablag' o'sha karta hisobiga qaytariladi. Dublyaj yakunlangach yoki daqiqalar sarflanganidan so'ng to'langan mablag' qaytarilmaydi. Platforma tomonidagi texnik nosozlik tufayli xizmat ko'rsatilmagan taqdirda, sarflangan daqiqalar avtomatik ravishda foydalanuvchi hisobiga qaytariladi. Qaytarish bo'yicha murojaatlar: <a href="mailto:lodexgroups@gmail.com" className="text-violet-600 dark:text-violet-400 underline">lodexgroups@gmail.com</a>.
              </p>
            </section>

            <section id="firibgarlik" className="space-y-3 scroll-mt-24">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                5. Firibgarlik operatsiyalari xavfini cheklash va nazorat qilish choralari
              </h2>
              <p>
                GapirAI.uz platformasi (bundan keyin — "Ijrochi") O'zbekiston Respublikasi qonunchiligi hamda bank va to'lov tashkilotlari bilan tuzilgan Elektron tijorat shartnomasi (Договор ИЭ) talablariga muvofiq firibgarlik operatsiyalarining oldini olish va ularni cheklash choralarini ko'radi. Ijrochi shubhali operatsiyalarni bankning firibgarlikka qarshi kurash imkoniyatlaridan foydalangan holda nazorat qiladi va cheklaydi.
              </p>

              <details className="group rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3">
                <summary className="cursor-pointer list-none font-semibold text-gray-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Nazorat va cheklash usullari — batafsil</span>
                  <span className="text-violet-500 text-lg leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <ul className="list-disc pl-5 space-y-1 mt-3">
                  <li>to'lovlar va tranzaksiyalarni firibgarlik belgilari mavjudligiga tekshirish;</li>
                  <li>bank yoki to'lov tizimining xavfsizlik tizimida shubha uyg'otgan operatsiyalarni cheklash;</li>
                  <li>ma'lumotlarni uzatishning himoyalangan kanallari (SSL/TLS shifrlash) va zamonaviy axborot xavfsizligi vositalaridan foydalanish;</li>
                  <li>to'lov amalga oshirilayotganda foydalanuvchini identifikatsiya va verifikatsiya qilish (elektron pochta va/yoki telefon raqamini tasdiqlash);</li>
                  <li>firibgarlik xavfi aniqlanganda operatsiyani vaqtincha to'xtatib turish;</li>
                  <li>ruxsatsiz operatsiyalarning oldini olish uchun bank va to'lov tizimlari bilan hamkorlik qilish;</li>
                  <li>Elektron tijorat shartnomasi va Ijrochining ichki xavfsizlik qoidalariga rioya qilish.</li>
                </ul>
              </details>

              <p className="font-semibold text-gray-800 dark:text-slate-200">Foydalanuvchining majburiyatlari</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>o'zining shaxsiy ma'lumotlari, parollari va tasdiqlash kodlarini (SMS-kod, CVV/CVC) uchinchi shaxslarga oshkor qilmaslik;</li>
                <li>shubhali yoki ruxsatsiz operatsiyalar haqida zudlik bilan xabar berish: <a href="mailto:lodexgroups@gmail.com" className="text-violet-600 dark:text-violet-400 underline">lodexgroups@gmail.com</a>;</li>
                <li>elektron to'lov tizimlaridan xavfsiz foydalanish qoidalariga rioya qilish.</li>
              </ul>
              <p>
                Ijrochi firibgarlik belgilari yoki xavfsizlik talablarining buzilishi aniqlangan taqdirda operatsiyani cheklash yoki rad etish huquqini o'zida saqlab qoladi.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">6. Javobgarlikni cheklash</h2>
              <p>
                GapirAI.uz ma'lumotlar yo'qolishi, uchinchi shaxslar tomonidan kontent bloklanishi yoki platformadan foydalanish natijasida kelib chiqadigan bilvosita zararlar uchun javobgarlikni o'z zimmasiga olmaydi.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  );
}
