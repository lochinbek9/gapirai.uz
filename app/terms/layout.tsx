import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Foydalanish shartlari — Ommaviy oferta",
  description: "GapirAI.uz AI dublyaj platformasi ommaviy ofertasi: xizmat shartlari, tariflar va to'lov usullari (Click, Payme), qaytarish shartlari hamda firibgarlik xavfini cheklash va nazorat qilish choralari.",
  alternates: { canonical: '/terms' },
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
