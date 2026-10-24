import { STATIONS } from './lines'
import { SpineStop } from './Spine'

const DETAILS: Record<(typeof STATIONS)[number], string> = {
  Havola: "YouTube havolasini qo'ying yoki qurilmangizdagi videoni yuklang. Bitta video 120 daqiqagacha.",
  Nutq: "Videodagi gaplar matnga aylantiriladi, spikerning ovozi erkak yoki ayol ekani aniqlanadi.",
  Tarjima: "Matn tabiiy, so'zlashuvdagi o'zbek tiliga o'giriladi — so'zma-so'z emas.",
  Ovoz: "O'zbekcha ovoz yaratiladi va har bir gap videodagi o'z vaqtiga moslanadi.",
  Tayyor: "Videoni saytda ko'ring yoki MP4 qilib yuklab oling. Telegram bot ulangan bo'lsa, xabar keladi.",
}

export default function RouteSection() {
  return (
    <SpineStop id="qanday-ishlaydi" title="Havoladan tayyor videogacha — besh bekat">
      <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
        {STATIONS.map((name, i) => (
          <li key={name} className="relative border-t-[6px] border-metro-ink pt-6">
            {/* Ketma-ketlikni raqam yorlig'i emas, chiziqdagi bekat ko'rsatadi */}
            <span aria-hidden className={`absolute -top-[15px] left-0 h-6 w-6 rounded-full border-[5px] border-metro-ink ${i === STATIONS.length - 1 ? 'bg-metro-ink' : 'bg-metro-ground'}`} />
            <h3 className="font-sign text-2xl font-extrabold uppercase text-metro-ink">{name}</h3>
            <p className="mt-2 text-base leading-relaxed text-metro-muted">{DETAILS[name]}</p>
          </li>
        ))}
      </ol>
    </SpineStop>
  )
}
