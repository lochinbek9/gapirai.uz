'use client'
import Link from 'next/link'
import PageShell, { PageTitle } from '@/components/PageShell'

export default function PrivacyPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-20">
        <PageTitle title="Maxfiylik siyosati" lead={<span className="text-base">Oxirgi yangilanish: 2026-yil 4-avgust</span>} />
        <div className="ui-prose mt-12 border-t border-ui-rule pt-10">
            <section>
              <h2>1. Biz to'playdigan ma'lumotlar</h2>
              <p>
                Platformamizdan foydalanganingizda, xizmat ko'rsatish sifatini oshirish maqsadida quyidagi ma'lumotlarni to'playmiz:
              </p>
              <ul>
                <li>Siz kiritgan YouTube video manzillari va davomiyligi;</li>
                <li>Tizimga kirish uchun foydalanadigan login va elektron pochta manzili;</li>
                <li>To'lov tafsilotlari (to'lovlar bevosita Click to'lov shlyuzi orqali amalga oshiriladi va biz kartangiz ma'lumotlarini saqlamaymiz).</li>
              </ul>
            </section>

            <section>
              <h2>2. Ma'lumotlardan foydalanish</h2>
              <p>To'plangan ma'lumotlar faqat quyidagi maqsadlarda ishlatiladi:</p>
              <ul>
                <li>Dublyaj va tarjima jarayonini amalga oshirish;</li>
                <li>Hisob-kitoblar va to'lovlarni amalga oshirish hamda tasdiqlash;</li>
                <li>Texnik muammolarni bartaraf etish va foydalanuvchilarni qo'llab-quvvatlash.</li>
              </ul>
            </section>

            <section>
              <h2>3. Ma'lumotlar xavfsizligi</h2>
              <p>
                Biz sizning shaxsiy ma'lumotlaringiz xavfsizligini ta'minlash uchun SSL shifrlash va zamonaviy xavfsizlik protokollaridan foydalanamiz. Biroq, internet orqali ma'lumot uzatishning 100% xavfsizligini kafolatlab bo'lmaydi.
              </p>
            </section>

            <section>
              <h2>4. Uchinchi shaxslarga ma'lumot uzatish</h2>
              <p>
                Xizmat ko'rsatish jarayonida matnlarni tarjima qilish uchun OpenAI va nutq sintezi uchun Microsoft Azure xizmatlariga faqatgina videodagi matnli ma'lumotlar uzatiladi. Sizning shaxsiy ma'lumotlaringiz uchinchi shaxslarga sotilmaydi.
              </p>
            </section>
        </div>
      </div>
    </PageShell>
  )
}

