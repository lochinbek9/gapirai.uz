import { Send } from 'lucide-react'

export default function TelegramSection() {
  return (
    <section aria-labelledby="tg-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="ui-dark grid gap-8 p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center dark:border dark:border-ui-rule dark:!bg-ui-ground dark:!text-ui-ink">
        <div>
          <h2 id="tg-title" className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Telegram orqali ham</h2>
          <p className="mt-3 max-w-[56ch] text-lg leading-relaxed opacity-75">
            Botga YouTube havolasini yoki videoning oʻzini yuboring — dublaj tayyor boʻlgach, natija oʻsha chatga keladi.
          </p>
        </div>
        <a
          href="https://t.me/gapirai_uz_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-white px-5 text-base font-medium text-[rgb(11_13_18)] transition hover:opacity-90"
        >
          <Send aria-hidden="true" className="h-4 w-4" /> @gapirai_uz_bot ni ochish
          <span className="sr-only"> (yangi oynada)</span>
        </a>
      </div>
    </section>
  )
}
