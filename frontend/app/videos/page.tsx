import type { Metadata } from 'next'
import VideosClient from './VideosClient'

export const metadata: Metadata = {
  title: "Ommaviy videolar",
  description: "O'zbek tiliga sun'iy intellekt yordamida dublaj qilingan videolar — bepul tomosha qiling.",
  alternates: { canonical: '/videos' },
  openGraph: {
    title: "Ommaviy videolar | GapirAI.uz",
    description: "O'zbek tiliga sun'iy intellekt yordamida dublaj qilingan videolar — bepul tomosha qiling.",
    url: "https://gapirai.uz/videos",
    siteName: "GapirAI.uz",
    locale: "uz_UZ",
    type: "website",
    images: [{ url: "https://gapirai.uz/logo.webp", width: 256, height: 256, alt: "GapirAI.uz logotipi" }],
  },
}

export default function VideosPage() {
  return <VideosClient />
}
