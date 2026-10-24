import { LINES, type LineId } from './lines'
import { SpineStop } from './Spine'

const ROWS: { id: LineId; gives: string; detail: string; cost: string; action: string }[] = [
  {
    id: 'dub',
    gives: "O'zbekcha ovozli MP4 video",
    detail: "Ovoz spikerning jinsiga moslab tanlanadi, video vaqtiga sinxronlanadi. Ko'ring, yuklab oling yoki qayta yarating.",
    cost: 'Video davomiyligicha daqiqa',
    action: 'Dublajni boshlash',
  },
  {
    id: 'subtitle',
    gives: "O'zbekcha subtitr: .srt va .vtt",
    detail: "Ovozsiz, tezroq. Video o'zbek tilida bo'lsa — tarjimasiz, faqat matnga aylantiriladi.",
    cost: 'Video davomiyligicha daqiqa',
    action: 'Subtitr yaratish',
  },
  {
    id: 'analyze',
    gives: 'Xulosa, asosiy fikrlar, konspekt va test',
    detail: "Uzun ma'ruza yoki kursni o'qishdan oldin qisqa ko'rinishda oling. Natija tilini o'zingiz tanlaysiz.",
    cost: 'Daqiqa sarflamaydi',
    action: 'Tahlil qilish',
  },
]

export default function LinesSection({ onPick, activeLine }: { onPick: (line: LineId) => void; activeLine: LineId }) {
  return (
    <SpineStop id="liniyalar" title="Uchta liniya, bitta havola">
      <ul className="divide-y-2 divide-metro-rule border-y-2 border-metro-rule">
        {ROWS.map((row) => {
          const line = LINES[row.id]
          return (
            <li key={row.id} className="grid gap-4 py-7 sm:grid-cols-[180px_1fr_auto] sm:items-center sm:gap-8">
              <div className="flex items-center gap-3">
                <span aria-hidden className={`h-3 w-12 rounded-full ${line.bg}`} />
                <span className={`font-sign text-2xl font-extrabold uppercase ${line.text}`}>{line.name}</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-metro-ink sm:text-xl">{row.gives}</h3>
                <p className="mt-1 max-w-[62ch] text-base leading-relaxed text-metro-muted">{row.detail}</p>
                <p className="mt-2 font-sign text-sm font-bold uppercase tracking-wide text-metro-ink">{row.cost}</p>
              </div>
              {/* Bir vaqtda faqat bitta liniya rangi faol: tanlangan xizmat to'ldirilgan, qolganlari kontur */}
              <button
                type="button"
                onClick={() => onPick(row.id)}
                className={`m-btn w-full sm:w-auto ${activeLine === row.id ? line.btn : 'm-btn-ghost'}`}
              >
                {activeLine !== row.id && <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${line.bg}`} />}
                {row.action}
              </button>
            </li>
          )
        })}
      </ul>
    </SpineStop>
  )
}
