import type { Metadata } from 'next'
import { getApiUrl } from '@/lib/runtime-config'

// Ulashilgan havola Telegram/WhatsApp'da video nomi va rasmi bilan chiqsin. API anonim
// so'rovga faqat tayyor videoni (redakt qilingan) beradi -- boshqa holatda umumiy metadata.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const res = await fetch(`${getApiUrl()}/api/jobs/${encodeURIComponent(id)}`, { next: { revalidate: 300 } })
    if (!res.ok) return {}
    const job: { video_title?: string | null; video_thumbnail?: string | null } = await res.json()
    if (!job.video_title) return {}
    const title = `${job.video_title} — o'zbekcha dublyaj`
    const description = "GapirAI.uz orqali o'zbek tiliga dublyaj qilingan video. Ko'rish uchun bosing."
    const images = job.video_thumbnail ? [{ url: job.video_thumbnail, width: 1280, height: 720, alt: job.video_title }] : undefined
    return {
      title,
      description,
      openGraph: { title, description, url: `/video/${id}`, type: 'video.other', siteName: 'GapirAI.uz', images },
      twitter: { card: images ? 'summary_large_image' : 'summary', title, description, images: images?.map(i => i.url) },
    }
  } catch {
    return {}
  }
}

export default function VideoJobLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
