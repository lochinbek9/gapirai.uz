import type { Metadata } from 'next'
import AboutClient from './AboutClient'

export const metadata: Metadata = {
  title: "Xadichai.uz Haqida — Sun'iy Intellekt Video Dublyaj Programmasi | Hadicha",
  description: "Xadichai.uz (Hadicha) platformasi va sun'iy intellekt (AI) yordamida videolarni o'zbek tiliga avtomatik dublyaj hamda tarjima qilish loyihasi haqida batafsil ma'lumot.",
  keywords: [
    "xadicha haqida",
    "hadicha uz haqida",
    "xadichai haqida",
    "hadichai haqida",
    "dublyaj programmasi loyihasi",
    "video dublyaj dasturi",
    "ai dublyaj texnologiyasi",
    "o'zbekcha ai dublyaj"
  ],
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "Xadichai.uz Haqida — Hadicha AI Video Dublyaj Programmasi",
    description: "YouTube va boshqa videolarni sun'iy intellekt kuchi bilan o'zbek tiliga avtomatik dublyaj qiluvchi innovatsion milliy loyiha.",
    url: "https://xadichai.uz/about",
    siteName: "Xadichai.uz (Hadicha Dublyaj)",
    locale: "uz_UZ",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Xadichai.uz Haqida — Hadicha AI Video Dublyaj Programmasi",
    description: "Videolarni AI yordamida o'zbek tiliga dublyaj qiluvchi dastur va platforma haqida.",
  },
}

export default function AboutPage() {
  return <AboutClient />
}
