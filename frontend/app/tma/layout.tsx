import type { Metadata } from 'next'
import Script from 'next/script'
import TmaProvider from './TmaProvider'

export const metadata: Metadata = {
  title: 'GapirAI',
  robots: { index: false, follow: false },
}

export default function TmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <div className="min-h-screen bg-white text-gray-900 dark:bg-[#0f0f10] dark:text-gray-100">
        <TmaProvider>{children}</TmaProvider>
      </div>
    </>
  )
}
