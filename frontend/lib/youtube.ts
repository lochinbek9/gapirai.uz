// frontend/app/video-analysis/[id]/page.tsx VA frontend/app/learn/[id]/page.tsx
// ikkalasi ham YouTube URL'dan video ID ajratib olishi kerak (YouTubePlayer
// uchun) -- shu yerda yagona manba.
export function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{11})/)
  return m ? m[1] : null
}
