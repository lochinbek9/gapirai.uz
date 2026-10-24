import { PLATFORM_STATS } from './stats'

// toLocaleString server va brauzerda turli probel beradi (hydration xatosi) -- qo'lda guruhlaymiz
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** Haqiqiy, sanali raqamlar (taxmin emas). */
export default function StatsStrip() {
  const items = [
    [fmt(PLATFORM_STATS.finishedDubs), 'video oʻzbek tiliga dublaj qilindi'],
    [fmt(PLATFORM_STATS.dubbedMinutes), 'daqiqa oʻzbekcha ovozga aylantirildi'],
    [fmt(PLATFORM_STATS.verifiedUsers), 'foydalanuvchi roʻyxatdan oʻtgan'],
  ]
  return (
    <section aria-label="Platforma raqamlarda" className="border-y border-ui-rule bg-ui-ground">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <dl className="grid gap-8 sm:grid-cols-3">
          {items.map(([value, label]) => (
            <div key={label}>
              <dd className="text-4xl font-semibold tracking-[-0.03em] text-ui-ink tabular-nums">{value}</dd>
              <dt className="mt-1 text-base text-ui-muted">{label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm text-ui-muted">{PLATFORM_STATS.asOf} holatiga, ichki va test hisoblarisiz.</p>
      </div>
    </section>
  )
}
