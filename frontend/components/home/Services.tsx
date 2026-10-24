import { Check } from 'lucide-react'
import { SERVICES, type ServiceId } from './serviceList'

const ROWS: { id: ServiceId; title: string; detail: string; gets: string[]; cost: string; action: string }[] = [
  {
    id: 'dub',
    title: 'Oʻzbekcha ovozli video',
    detail: 'Nutq tarjima qilinib, spikerning jinsiga mos oʻzbekcha ovoz bilan qayta yoziladi.',
    gets: ['MP4 video', 'Saytdagi pleyerda subtitr', 'Qayta yaratish imkoni'],
    cost: 'Video davomiyligicha daqiqa',
    action: 'Dublajni boshlash',
  },
  {
    id: 'subtitle',
    title: 'Oʻzbekcha subtitr',
    detail: 'Ovozsiz, tezroq. Video oʻzbek tilida boʻlsa — tarjimasiz, faqat matnga aylantiriladi.',
    gets: ['.srt va .vtt fayllar', 'Vaqt kodlari bilan', 'YouTube havola yoki fayl'],
    cost: 'Video davomiyligicha daqiqa',
    action: 'Subtitr yaratish',
  },
  {
    id: 'analyze',
    title: 'Video tahlili',
    detail: 'Uzun maʼruza yoki kursni koʻrishdan oldin qisqa koʻrinishda oling.',
    gets: ['Xulosa va asosiy fikrlar', 'Konspekt', 'Test savollari'],
    cost: 'Daqiqa sarflamaydi',
    action: 'Tahlil qilish',
  },
]

export default function Services({ onPick, active }: { onPick: (id: ServiceId) => void; active: ServiceId }) {
  return (
    <section aria-labelledby="services-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="max-w-2xl">
        <h2 id="services-title" className="text-3xl font-semibold tracking-[-0.03em] text-ui-ink sm:text-4xl">
          Bitta havola — uch xil natija
        </h2>
        <p className="mt-3 text-lg text-ui-muted">Kerakli natijani tanlang: ovozli video, subtitr yoki qisqa tahlil.</p>
      </div>
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {ROWS.map((row) => {
          const Icon = SERVICES[row.id].icon
          const isActive = active === row.id
          return (
            <li key={row.id} className={`ui-card flex flex-col p-6 ${isActive ? 'ring-2 ring-ui-accent/60' : ''}`}>
              <div className="flex items-center gap-2.5 text-sm font-medium text-ui-muted">
                <Icon aria-hidden="true" className="h-4 w-4 text-ui-accent-ink" />
                {SERVICES[row.id].name}
              </div>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-ui-ink">{row.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-ui-muted">{row.detail}</p>
              <ul className="mt-5 space-y-2 text-sm text-ui-ink">
                {row.gets.map((g) => (
                  <li key={g} className="flex items-center gap-2">
                    <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-ui-accent-ink" /> {g}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-ui-rule pt-4 text-sm text-ui-muted">
                Narx: <span className="font-medium text-ui-ink">{row.cost}</span>
              </p>
              <button type="button" onClick={() => onPick(row.id)} className={`ui-btn mt-5 w-full ${isActive ? 'ui-btn-primary' : 'ui-btn-secondary'}`}>
                {row.action}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
