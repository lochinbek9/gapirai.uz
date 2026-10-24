import { PLATFORM_STATS } from './stats'
import { SpineStop } from './Spine'

// toLocaleString server va brauzerda turli probel beradi (hydration xatosi) -- qo'lda guruhlaymiz
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')

/** Bekatdagi ma'lumot taxtasi: haqiqiy, sanali raqamlar (taxmin emas). */
export default function StationBoard() {
  const rows = [
    ['Tayyor dublajlar', fmt(PLATFORM_STATS.finishedDubs)],
    ["O'zbekchaga o'girilgan daqiqalar", fmt(PLATFORM_STATS.dubbedMinutes)],
    ["Ro'yxatdan o'tgan foydalanuvchilar", fmt(PLATFORM_STATS.verifiedUsers)],
  ]
  return (
    <SpineStop id="raqamlar" title="Bekat taxtasi">
      <div className="m-plaque overflow-hidden outline outline-1 outline-offset-2 outline-metro-brass">
        <dl className="divide-y divide-metro-plaque-ink/15">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-6 px-5 py-4 sm:px-8 sm:py-5">
              <dt className="font-sign text-lg font-bold uppercase tracking-wide text-metro-plaque-ink/80 sm:text-xl">{label}</dt>
              <dd className="font-sign text-3xl font-extrabold text-white m-num sm:text-4xl">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t-[6px] border-metro-red px-5 py-3 text-sm text-metro-plaque-ink/80 sm:px-8">
          {PLATFORM_STATS.asOf} holatiga. Ichki va test hisoblari hisobga olinmagan.
        </p>
      </div>
    </SpineStop>
  )
}
