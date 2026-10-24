const STEPS = [
  ['Havolani qoʻying', 'YouTube havolasi yoki qurilmangizdagi video. Bitta video 120 daqiqagacha.'],
  ['Nutq aniqlanadi', 'Gaplar matnga aylanadi, spikerning ovozi erkak yoki ayol ekani aniqlanadi.'],
  ['Tarjima va ovoz', 'Matn tabiiy oʻzbek tiliga oʻgiriladi va video vaqtiga mos ovozlashtiriladi.'],
  ['Tayyor', 'Videoni saytda koʻring yoki MP4 qilib yuklab oling. Jarayon sahifada koʻrinib turadi.'],
]

/** Tartib maʼlumot tashiydi (har bosqich oldingisiga bogʻliq), shuning uchun raqamlar bor. */
export default function HowItWorks() {
  return (
    <section id="qanday-ishlaydi" aria-labelledby="how-title" className="scroll-mt-20 border-t border-ui-rule bg-ui-ground">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h2 id="how-title" className="max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-ui-ink sm:text-4xl">
          Havoladan tayyor videogacha
        </h2>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="relative">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-ui-rule bg-ui-surface text-sm font-semibold text-ui-ink tabular-nums">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-ui-ink">{title}</h3>
              <p className="mt-2 text-base leading-relaxed text-ui-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
