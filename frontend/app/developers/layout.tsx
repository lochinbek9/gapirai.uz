import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'GapirAI API — dasturchilar uchun',
  description:
    "Videolarni oʻzbekchaga dublaj va subtitr qilishni oʻz saytingiz, kurs platformangiz yoki Telegram botingizga ulang: REST API, webhook va API kalitlar.",
  alternates: { canonical: '/developers' },
}

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
