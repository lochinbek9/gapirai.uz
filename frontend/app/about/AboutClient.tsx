'use client'

import Link from 'next/link'
import { AudioLines, Captions, Languages, Mic, Send, Sparkles } from 'lucide-react'
import PageShell, { PageTitle } from '@/components/PageShell'
import StatsStrip from '@/components/home/StatsStrip'
import HowItWorks from '@/components/home/HowItWorks'
import DonateCTA from '@/components/DonateCTA'

const FACTS = [
  { icon: Mic, title: 'Nutqni aniqlash', text: 'Videodagi gaplar vaqt kodlari bilan matnga aylantiriladi.' },
  { icon: Languages, title: 'Tabiiy tarjima', text: 'Matn sunʼiy intellekt yordamida tabiiy oʻzbek tiliga oʻgiriladi.' },
  { icon: AudioLines, title: 'Mos ovoz', text: 'Spikerning jinsi aniqlanib, unga mos oʻzbekcha ovoz tanlanadi.' },
  { icon: Captions, title: 'Subtitr', text: 'Ovozsiz variant: .srt va .vtt fayllar, oʻzbekcha videolar uchun ham.' },
  { icon: Sparkles, title: 'Tezkor tahlil', text: 'Xulosa, asosiy fikrlar, konspekt va test savollari — daqiqa sarflamaydi.' },
  { icon: Send, title: 'Telegram', text: 'Bot havola yoki videoning oʻzini qabul qiladi, natijani chatga yuboradi.' },
]

export default function AboutClient() {
  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <PageTitle
          title="GapirAI.uz haqida"
          lead={
            <>
              GapirAI.uz (Gapir AI) — ingliz tilidagi va boshqa xorijiy videolarni oʻzbek tiliga dublyaj (dublaj) qiluvchi onlayn dastur.
              Maqsadimiz — dunyo bilimlarini har bir oʻzbekzabon uchun ona tilida ochiq qilish.
            </>
          }
        >
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="ui-btn ui-btn-primary">Video yuborish</Link>
            <Link href="/videos" className="ui-btn ui-btn-secondary">Ommaviy videolar</Link>
          </div>
        </PageTitle>

        <ul className="mt-16 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FACTS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon aria-hidden="true" className="h-5 w-5 text-ui-accent-ink" />
              <h2 className="mt-3 text-lg font-semibold text-ui-ink">{title}</h2>
              <p className="mt-1.5 text-base leading-relaxed text-ui-muted">{text}</p>
            </li>
          ))}
        </ul>
      </div>

      <StatsStrip />
      <HowItWorks />

      <section aria-labelledby="mission-title" className="border-t border-ui-rule">
        <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
          <h2 id="mission-title" className="text-3xl font-semibold tracking-[-0.03em] text-ui-ink">Nima uchun</h2>
          <p className="mt-5 text-lg leading-relaxed text-ui-muted">
            Eng yaxshi maʼruzalar, kurslar va ilmiy-ommabop videolar asosan ingliz va boshqa tillarda. GapirAI.uz ularni brauzerda yoki
            Telegramʼda, hech narsa oʻrnatmasdan, mahalliy toʻlov tizimlari orqali oʻzbek tilida koʻrish imkonini beradi.
            Natija avtomatik tayyorlanadi, shuning uchun tarjima va ovozda kichik xatolar boʻlishi mumkin — fikringizni yozsangiz, tuzatamiz.
          </p>
          <DonateCTA variant="line" className="mt-8 justify-start" />
        </div>
      </section>
    </PageShell>
  )
}
