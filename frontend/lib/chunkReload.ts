// Deploy'dan keyin oldindan ochiq turgan tab yangi sahifaga o'tganda o'chirilgan eski
// JS bo'lagini (chunk) so'raydi -> ChunkLoadError -> "Nimadur noto'g'ri ketdi".
// reset() buni tuzata olmaydi (bo'lak serverda yo'q), faqat sahifani to'liq qayta
// yuklash yordam beradi. Cheksiz qayta yuklanishdan himoya: 30 soniyada bir martadan ko'p emas.

const CHUNK_ERROR = /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
const KEY = 'gapirai.chunk-reload-at'
const WINDOW_MS = 30_000

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: string; message?: string }
  return CHUNK_ERROR.test(`${e.name ?? ''} ${e.message ?? ''}`)
}

// Chunk xatosi bo'lsa va yaqinda qayta yuklanmagan bo'lsa -- sahifani qayta yuklaydi (true qaytaradi).
export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) return false
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < WINDOW_MS) return false
    window.sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // sessionStorage yo'q (maxfiy rejim) -- baribir bir marta urinib ko'ramiz
  }
  window.location.reload()
  return true
}

// Xato oynasida ko'rsatiladigan qisqa sabab (foydalanuvchi skrinshot yuborsa -- tashxis uchun)
export function errorSummary(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const e = error as { name?: string; message?: string }
  return `${e.name || 'Error'}: ${(e.message || '').slice(0, 140)}`
}
