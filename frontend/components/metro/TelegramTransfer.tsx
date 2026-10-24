import { SpineStop } from './Spine'

/** "Peresadka": xuddi shu xizmat Telegram bot orqali. */
export default function TelegramTransfer() {
  return (
    <SpineStop id="telegram" title="Telegram orqali ham">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <p className="max-w-[60ch] text-lg leading-relaxed text-metro-muted">
          Botga YouTube havolasini yoki videoning o&apos;zini yuboring — dublaj tayyor bo&apos;lgach, natija o&apos;sha chatga keladi.
        </p>
        <a
          href="https://t.me/gapirai_uz_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="m-btn"
        >
          @gapirai_uz_bot ni ochish
          <span className="sr-only"> (yangi oynada)</span>
        </a>
      </div>
    </SpineStop>
  )
}
