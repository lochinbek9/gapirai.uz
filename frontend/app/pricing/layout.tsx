import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Tarif rejalari",
  description: "GapirAI.uz tarif rejalari — bepul tarifda oyiga 5 daqiqa dublyaj; ko'proq kerak bo'lsa oylik obuna yoki qo'shimcha daqiqa paketlari.",
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: "Tarif rejalari | GapirAI.uz",
    description: "Bepul tarifda oyiga 5 daqiqa dublyaj; ko'proq kerak bo'lsa oylik obuna yoki qo'shimcha daqiqa paketlari.",
    url: "https://gapirai.uz/pricing",
    siteName: "GapirAI.uz",
    locale: "uz_UZ",
    type: "website",
    images: [{ url: "https://gapirai.uz/logo.webp", width: 256, height: 256, alt: "GapirAI.uz logotipi" }],
  },
  twitter: {
    card: "summary",
    title: "Tarif rejalari | GapirAI.uz",
    description: "Bepul tarifda oyiga 5 daqiqa dublyaj; ko'proq kerak bo'lsa oylik obuna yoki qo'shimcha daqiqa paketlari.",
    images: ["https://gapirai.uz/logo.webp"],
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
