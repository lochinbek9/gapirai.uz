import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'GapirAI',
  robots: { index: false, follow: false },
}

export default function TmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <div className="min-h-screen bg-ui-surface text-ui-ink">
        {children}
      </div>
    </>
  )
}
