// Mirrors backend/api/routes.py's _is_valid_youtube_url exactly (same host
// whitelist) — the backend is the real gate (400 "Faqat YouTube URL qabul
// qilinadi." otherwise); this is only a client-side UX check so the user
// gets instant feedback instead of a round-trip for an obviously bad URL.
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

export function isValidYoutubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Mirrors frontend/app/video-analysis/[id]/page.tsx's extractYouTubeId regex exactly.
export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{11})/);
  return match ? match[1] : null;
}

// Ulashilgan matndan (YouTube ilovasi: "Mana bu videoni koʻring https://youtu.be/xyz?si=...")
// birinchi YouTube havolasini ajratib oladi.
export function findYoutubeUrl(text: string | null | undefined): string | null {
  for (const candidate of String(text || '').match(/https?:\/\/\S+/g) || []) {
    const url = candidate.replace(/[)\]}>.,!?'"]+$/, '');
    if (isValidYoutubeUrl(url)) return url;
  }
  return null;
}
