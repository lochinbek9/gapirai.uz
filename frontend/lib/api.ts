import axios from 'axios'
import { getToken } from './auth'
import { getApiUrl } from './runtime-config'

const API_URL = getApiUrl()

export const apiClient = axios.create({ baseURL: API_URL })

// Har bir so'rovga token qo'shish
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface VideoInfo {
  title: string
  duration: number
  thumbnail: string
  uploader: string
}

export interface Job {
  job_id: string
  status: JobStatus
  progress: number
  status_message?: string
  youtube_url?: string
  video_title?: string
  video_duration?: number
  video_thumbnail?: string
  output_video_url?: string
  transcript_text?: string
  translated_text?: string
  error_message?: string
  created_at?: string
  speaker_gender?: string
  uzbek_srt_content?: string
  expected_end_time?: string
  rating?: number
  feedback_comment?: string
  content_flagged?: boolean
  linked_analysis_id?: string | null
  // YouTube yuklab olish DOWNLOAD bosqichida (video hech qachon serverga
  // tushmagan holda) muvaffaqiyatsiz bo'lgan job'lar uchun -- foydalanuvchi
  // videoni to'g'ridan-to'g'ri yuklashi mumkinligini bildiradi (backend/api/
  // routes.py:_job_to_response, POST /jobs/{id}/upload-video).
  fallback_available?: boolean
  fallback_reason?: string | null
  // 2026-09-16: "Subtitr" rejimi -- true bo'lsa dublyaj audiosi/videosi
  // yaratilmagan, faqat transkripsiya+tarjima+subtitr (output_video_url yo'q).
  subtitle_only?: boolean
  // 2026-09-19: navbat worker o'rinlaridan uzun bo'lganda kutayotgan job
  // uchun to'ldiriladi (backend/services/queue_load.py). Matn allaqachon
  // status_message'ga yozilgan -- bular boshqa UI (masalan mobil) uchun.
  queue_position?: number | null
  queue_eta_minutes?: number | null
}

export type JobStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'downloading'
  | 'transcribing'
  | 'translating'
  | 'syncing'
  | 'synthesizing'
  | 'merging'
  | 'completed'
  | 'failed'

export const STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Navbatda',
  awaiting_payment: 'To\'lov kutilmoqda',
  downloading: 'Yuklanmoqda',
  transcribing: 'Matnga aylantirilmoqda',
  translating: 'Tarjima qilinmoqda',
  syncing: 'Talaffuzga moslashtirilmoqda',
  synthesizing: 'Ovoz yaratilmoqda',
  merging: 'Birlashtirilmoqda',
  completed: 'Tayyor',
  failed: 'Xatolik',
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const res = await apiClient.get('/api/video-info', { params: { url } })
  return res.data
}

/** Subtitr rejimida video tili: 'auto' -- chet tildagi video (o'zbekchaga tarjima qilinadi),
 * 'uz' -- video o'zbekcha nutqli: o'zbekcha STT, TARJIMASIZ (backend faqat subtitle_only bilan qabul qiladi). */
export type SubtitleSourceLanguage = 'auto' | 'uz'

export async function createJob(
  youtube_url: string,
  voice_gender: string = 'auto',
  subtitle_only: boolean = false,
  source_language: SubtitleSourceLanguage = 'auto',
): Promise<{ job_id: string; status: string }> {
  const res = await apiClient.post('/api/jobs', { youtube_url, target_language: 'uz', voice_gender, subtitle_only, source_language })
  return res.data
}

// Bosh sahifadagi asosiy oqim -- bitta so'rovda HAM dublyaj, HAM tahlil
// (Learning Workspace uchun) boshlaydi. createJob()'dan farqli, ikkita ID
// qaytaradi -- frontend/app/learn/[id] shu ikkalasini birga poll qiladi
// (backend/api/learn_routes.py).
export async function learnVideo(youtube_url: string, voice_gender: string = 'auto'): Promise<{
  dubbing_job_id: string
  analysis_id: string | null
  status: string
  amount: number | null
}> {
  const res = await apiClient.post('/api/learn', { youtube_url, voice_gender })
  return res.data
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await apiClient.get(`/api/jobs/${jobId}`)
  return res.data
}

// Mirrors backend/api/routes.py's _ALLOWED_UPLOAD_CONTENT_TYPES /
// MAX_UPLOAD_SIZE_BYTES exactly -- client-side check only, the backend is
// the real gate. Kept here (not fetched at runtime) to match this
// codebase's established convention of mirroring backend constants with a
// comment rather than adding a config-exposure endpoint for values that
// rarely change.
export const UPLOAD_ALLOWED_CONTENT_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm']
export const UPLOAD_ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm']
export const UPLOAD_MAX_SIZE_BYTES = 3 * 1024 * 1024 * 1024 // 3 GB

// YouTube DOWNLOAD bosqichida muvaffaqiyatsiz bo'lgan job uchun -- foydalanuvchi
// videoni to'g'ridan-to'g'ri yuklaydi, xuddi shu job qayta navbatga qo'yiladi
// (mavjud pipeline, ikkinchi yo'l yaratilmaydi).
export async function uploadVideoFallback(
  jobId: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ success: boolean; message: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiClient.post(`/api/jobs/${jobId}/upload-video`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
    signal,
  })
  return res.data
}

// "Subtitr" rejimi -- video FAYLDAN (YouTube havolasisiz) job yaratish
// (backend/api/routes.py: POST /api/jobs/upload). Fayl xom bayt oqimi sifatida
// yuboriladi (multipart emas): Content-Type -- video turi, nomi -- X-File-Name.
// SUBTITLE_UPLOAD_MAX_BYTES backend'dagi WEB_UPLOAD_MAX_MB (1024) bilan bir xil
// bo'lishi kerak -- bu faqat client tomonidagi tekshiruv, haqiqiy chegarani
// backend va nginx (client_max_body_size) qo'yadi.
export const SUBTITLE_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024 // 1 GB
const SUBTITLE_UPLOAD_EXT_TO_TYPE: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
}

/** Brauzer .mkv (va ba'zan boshqa) fayllar uchun file.type'ni bo'sh qoldirishi
 * mumkin (Windows) -- shunda kengaytmadan aniqlaymiz. Ruxsat etilmagan bo'lsa null. */
export function detectVideoContentType(file: File): string | null {
  if (UPLOAD_ALLOWED_CONTENT_TYPES.includes(file.type)) return file.type
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  return SUBTITLE_UPLOAD_EXT_TO_TYPE[ext] ?? null
}

export async function uploadJobFile(
  file: File,
  opts: { subtitleOnly?: boolean; voiceGender?: string; sourceLanguage?: SubtitleSourceLanguage } = {},
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ job_id: string; status: string }> {
  const contentType = detectVideoContentType(file)
  if (!contentType) throw new Error('Qo\'llab-quvvatlanmaydigan video formati')
  const res = await apiClient.post('/api/jobs/upload', file, {
    params: { subtitle_only: opts.subtitleOnly ?? true, voice_gender: opts.voiceGender ?? 'auto', source_language: opts.sourceLanguage ?? 'auto' },
    headers: { 'Content-Type': contentType, 'X-File-Name': encodeURIComponent(file.name) },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
    signal,
    timeout: 0, // katta fayl/sekin aloqa: standart timeout yuklashni uzib qo'ymasin
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })
  return res.data
}

export async function listJobs(): Promise<Job[]> {
  const res = await apiClient.get('/api/jobs')
  return res.data
}

export async function deleteJob(jobId: string): Promise<void> {
  await apiClient.delete(`/api/jobs/${jobId}`)
}

export async function retryJob(jobId: string): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post(`/api/jobs/${jobId}/retry`)
  return res.data
}

export async function initiateClickPayment(jobId: string): Promise<{ success: boolean; payment_url: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/payments/click/initiate', { job_id: jobId })
  return res.data
}

export async function initiatePaymePayment(jobId: string): Promise<{ success: boolean; payment_url: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/payments/payme/initiate', { job_id: jobId })
  return res.data
}

// Uzum: `payment_url` -- ilovadagi to'lov formasini ochuvchi deeplink;
// `account` -- shu formaga qo'lda kiritish fallback'i (backend/api/uzum_routes.py).
// amount===0 bo'lsa video allaqachon bepul/kvota bilan qoplangan.
export async function initiateUzumPayment(jobId: string): Promise<{ success: boolean; account?: number; payment_url?: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/payments/uzum/initiate', { job_id: jobId })
  return res.data
}

export function getDownloadUrl(jobId: string): string {
  return `${API_URL}/api/outputs/${jobId}/video`
}

export type SubtitleFormat = 'srt' | 'vtt' | 'txt'

/** Subtitr faylini YUKLAB OLISH havolasi. .srt/.txt backend'da doim attachment;
 * .vtt esa pleerning <track> elementi uchun odatda inline beriladi, shuning
 * uchun bu yerda `?download=1` bilan attachment so'raladi. */
export function getSubtitleDownloadUrl(jobId: string, format: SubtitleFormat = 'srt'): string {
  const base = `${API_URL}/api/jobs/${jobId}/subtitles.${format}`
  return format === 'vtt' ? `${base}?download=1` : base
}

export interface ResolutionOption {
  resolution: string
  available: boolean
  status: string
}

export async function getJobResolutions(jobId: string): Promise<{ resolutions: ResolutionOption[] }> {
  const res = await apiClient.get(`/api/jobs/${jobId}/resolutions`)
  return res.data
}

export async function requestResolution(jobId: string, resolution: string): Promise<{ status: string; download_url?: string }> {
  const res = await apiClient.post(`/api/jobs/${jobId}/resolutions/${resolution}`)
  return res.data
}

export interface PlanDef {
  id: string
  name: string
  price: number
  monthly_minutes: number
  priority: boolean
  tts_tier: string
  tier: string
  period_days: number
  max_resolution: string
}

export interface MinuteBalance {
  monthly_cap: number
  monthly_used: number
  monthly_remaining: number
  purchased: number
  total_available: number
}

export interface MinutePack {
  minutes: number
  price: number
}

export interface CurrentSubscription {
  plan: string
  expires_at: string | null
  minutes: MinuteBalance
}

export async function getPlans(): Promise<{ plans: PlanDef[]; minute_packs: MinutePack[]; current: CurrentSubscription | null }> {
  const res = await apiClient.get('/api/plans')
  return res.data
}

export async function getMinuteBalance(): Promise<{ balance: MinuteBalance; packs: MinutePack[] }> {
  const res = await apiClient.get('/api/minutes')
  return res.data
}

export async function purchaseMinutes(
  pack: number,
  provider: 'click' | 'payme' = 'click',
): Promise<{ success: boolean; payment_url: string; payment_id?: string; amount: number; minutes: number }> {
  const res = await apiClient.post('/api/minutes/purchase', { pack, provider })
  return res.data
}

/* ── Web Push (PWA bildirishnomalar) ───────────────────────── */

export async function getVapidKey(): Promise<string> {
  const res = await apiClient.get('/api/push/vapid-public-key')
  return res.data?.key || ''
}

export async function savePushSubscription(sub: PushSubscriptionJSON, userAgent?: string): Promise<void> {
  await apiClient.post('/api/push/subscribe', {
    endpoint: sub.endpoint,
    keys: sub.keys,
    user_agent: userAgent,
  })
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await apiClient.post('/api/push/unsubscribe', { endpoint })
}

/* ── Avtomatik to'lov (bog'langan kartalar + auto-renew / auto top-up) ── */

export interface SavedCard {
  id: string
  provider: 'click' | 'payme'
  card_mask: string | null
  card_type: string | null
  expire: string | null
  is_active: boolean
  is_default: boolean
  phone_hint: string | null
  last_error: string | null
  created_at: string | null
}

export interface BillingPreferences {
  auto_renew: boolean
  auto_renew_plan: string | null
  auto_topup_enabled: boolean
  auto_topup_pack: number | null
  in_grace: boolean
  grace_until: string | null
  renew_failed_attempts: number
}

export interface BillingOverview {
  providers: { click: boolean; payme: boolean }
  cards: SavedCard[]
  has_active_card: boolean
  current_plan: string
  current_plan_paid: boolean
  preferences: BillingPreferences
  minute_balance: MinuteBalance
  minute_packs: MinutePack[]
}

export async function getBillingOverview(): Promise<BillingOverview> {
  const res = await apiClient.get('/api/billing/overview')
  return res.data
}

export async function bindCard(
  provider: 'click' | 'payme', card_number: string, expire: string,
): Promise<{ card: SavedCard; needs_code: boolean; phone_hint: string | null }> {
  const res = await apiClient.post('/api/billing/cards', { provider, card_number, expire })
  return res.data
}

export async function verifyCard(cardId: string, code: string): Promise<{ card: SavedCard }> {
  const res = await apiClient.post(`/api/billing/cards/${cardId}/verify`, { code })
  return res.data
}

export async function resendCardCode(cardId: string): Promise<{ phone_hint: string | null }> {
  const res = await apiClient.post(`/api/billing/cards/${cardId}/resend`)
  return res.data
}

export async function setDefaultCard(cardId: string): Promise<void> {
  await apiClient.post(`/api/billing/cards/${cardId}/default`)
}

export async function deleteCard(cardId: string): Promise<void> {
  await apiClient.delete(`/api/billing/cards/${cardId}`)
}

export async function setAutoRenew(enabled: boolean, plan?: string): Promise<BillingPreferences> {
  const res = await apiClient.put('/api/billing/auto-renew', { enabled, plan })
  return res.data
}

export async function setAutoTopup(enabled: boolean, pack?: number | null): Promise<BillingPreferences> {
  const res = await apiClient.put('/api/billing/auto-topup', { enabled, pack })
  return res.data
}

export async function subscribeToPlan(plan: string): Promise<{ success: boolean; payment_url: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/plans/subscribe', { plan })
  return res.data
}

export async function subscribeToPlanPayme(plan: string): Promise<{ success: boolean; payment_url: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/payments/payme/initiate-subscription', { plan })
  return res.data
}

// Uzum: `payment_url` (ilova deeplink) + `account` (qo'lda kiritish fallback)
// qaytadi (backend/api/uzum_routes.py).
export async function subscribeToPlanUzum(plan: string): Promise<{ success: boolean; account?: number; payment_url?: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/payments/uzum/initiate-subscription', { plan })
  return res.data
}

export async function purchaseMinutesUzum(pack: number): Promise<{ success: boolean; account?: number; payment_url?: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/payments/uzum/initiate-minutes', { pack })
  return res.data
}

// Paynet: checkout havolasi yo'q -- `order_id` qaytadi, foydalanuvchi Paynet
// ilovasida yoki bankomatda shu raqamni kiritib to'laydi (backend/api/paynet_routes.py).
export async function subscribeToPlanPaynet(plan: string): Promise<{ success: boolean; order_id?: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/payments/paynet/initiate-subscription', { plan })
  return res.data
}

export async function purchaseMinutesPaynet(pack: number): Promise<{ success: boolean; order_id?: string; payment_id?: string; amount: number }> {
  const res = await apiClient.post('/api/payments/paynet/initiate-minutes', { pack })
  return res.data
}

export function getVideoUrl(jobId: string, resolution?: string): string {
  // /api/outputs/{id}/video (routes.py) S3'da bo'lsa presigned URL'ga
  // yo'naltiradi, mavjud bo'lmasa lokal faylga tushadi — statik
  // /outputs/{id}/... mount'idan farqli, S3'ga yuklangandan keyin lokal
  // nusxa o'chirilgan videolar uchun ham ishlaydi.
  if (resolution && resolution !== "720p") {
    return `${API_URL}/api/outputs/${jobId}/video?resolution=${resolution}`
  }
  return `${API_URL}/api/outputs/${jobId}/video`
}

export function getAudioUrl(jobId: string): string {
  return `${API_URL}/api/outputs/${jobId}/audio`
}

const JOB_KEY = "dubber_last_job"

export function saveJobId(id: string) {
  if (typeof window === "undefined") return
  localStorage.setItem(JOB_KEY, JSON.stringify({ id, ts: Date.now() }))
}

export function loadJobId(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(JOB_KEY)
    if (!raw) return null
    const { id, ts } = JSON.parse(raw)
    if (Date.now() - ts > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(JOB_KEY)
      return null
    }
    return id ?? null
  } catch {
    return null
  }
}

export function clearJobId() {
  if (typeof window === "undefined") return
  localStorage.removeItem(JOB_KEY)
}

export async function cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post(`/api/jobs/${jobId}/cancel`)
  return res.data
}

export async function submitFeedback(
  jobId: string,
  rating: number,
  comment?: string,
  extra?: { voice_ok?: boolean | null; translation_ok?: boolean | null; speed_ok?: boolean | null }
): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post(`/api/jobs/${jobId}/feedback`, { rating, comment, ...extra })
  return res.data
}

export async function submitPlatformFeedback(
  message: string,
  rating?: number
): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post(`/api/platform-feedback`, { message, rating })
  return res.data
}

/* ── Video Analysis ────────────────────────────────────────── */

export type AnalysisStatus =
  | 'pending'
  | 'downloading'
  | 'extracting_audio'
  | 'transcribing'
  | 'analyzing'
  | 'generating_results'
  | 'completed'
  | 'failed'

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  pending: 'Navbatda',
  downloading: 'Yuklanmoqda',
  extracting_audio: 'Audio ajratilmoqda',
  transcribing: 'Matnga aylantirilmoqda',
  analyzing: 'AI tahlil qilinmoqda',
  generating_results: 'Natijalar tayyorlanmoqda',
  completed: 'Tayyor',
  failed: 'Xatolik',
}

// Tahlil tili — video tilidan mustaqil: video qaysi tilda bo'lishidan qat'iy
// nazar, foydalanuvchi tahlil (summary/key_points/chapters/notes/quiz) qaysi
// tilda chiqishini shu ro'yxatdan tanlaydi. Transcript esa doim video'ning
// original tilida qoladi. "original" tanlansa, tahlil ham video tilida chiqadi.
export const ANALYSIS_LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'uz', label: "🇺🇿 O'zbekcha" },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'ru', label: '🇷🇺 Русский' },
  { code: 'tr', label: '🇹🇷 Türkçe' },
  { code: 'kk', label: '🇰🇿 Қазақша' },
  { code: 'original', label: '🌐 Original tilda' },
]

export const LANGUAGE_DISPLAY: Record<string, string> = {
  uz: "🇺🇿 O'zbekcha", en: '🇬🇧 English', ru: '🇷🇺 Русский', tr: '🇹🇷 Türkçe', kk: '🇰🇿 Қазақша',
  es: '🇪🇸 Español', fr: '🇫🇷 Français', de: '🇩🇪 Deutsch', ko: '🇰🇷 한국어', ja: '🇯🇵 日本語',
  zh: '🇨🇳 中文', ar: '🇸🇦 العربية', pt: '🇵🇹 Português', it: '🇮🇹 Italiano', hi: '🇮🇳 हिन्दी',
}

export function displayLanguage(code?: string | null): string {
  if (!code) return ''
  return LANGUAGE_DISPLAY[code] || code
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface KeyPoint {
  title: string
  description: string
  timestamp: number
}

export interface Chapter {
  title: string
  start: number
  end: number
}

export interface QuizQuestion {
  question: string
  options: string[]
  correct_answer: number
  explanation: string
  timestamp: number
}

export interface QAEntry {
  question: string
  answer: string
  timestamps: number[]
  asked_at: string
}

export interface BilingualSegment {
  start: number
  end: number
  original: string
  translated: string
}

export interface VideoAnalysisSummary {
  short: string
  medium: string
  detailed: string
}

export interface KeyTerm {
  term: string
  explanation: string
}

// "5 daqiqada" -- oddiy VideoAnalysisSummary'dan farqli, o'quv-yo'naltirilgan
// siqilgan format (frontend/components/analysis/FiveMinuteTab.tsx).
export interface FiveMinuteSummary {
  title: string
  why_it_matters: string
  core_ideas: string[]
  examples: string[]
  takeaways: string[]
  key_terms: KeyTerm[]
  remember: string
}

export interface VideoAnalysis {
  id: string
  status: AnalysisStatus
  progress: number
  status_message?: string
  youtube_url: string
  video_title?: string
  video_duration?: number
  video_thumbnail?: string
  language: string
  video_language?: string
  summary?: VideoAnalysisSummary
  key_points?: KeyPoint[]
  chapters?: Chapter[]
  five_minute_summary?: FiveMinuteSummary
  notes?: string
  quiz?: QuizQuestion[]
  qa_history: QAEntry[]
  error_message?: string
  error_code?: string
  created_at?: string
}

export async function createAnalysis(youtube_url: string, language: string = 'uz'): Promise<{ analysis_id: string; status: string }> {
  const res = await apiClient.post('/api/video-analysis', { youtube_url, language })
  return res.data
}

export async function getAnalysis(analysisId: string): Promise<VideoAnalysis> {
  const res = await apiClient.get(`/api/video-analysis/${analysisId}`)
  return res.data
}

export async function retryAnalysis(analysisId: string): Promise<{ analysis_id: string; status: string }> {
  const res = await apiClient.post(`/api/video-analysis/${analysisId}/retry`)
  return res.data
}

export async function getTranscript(analysisId: string): Promise<{ segments: TranscriptSegment[] }> {
  const res = await apiClient.get(`/api/video-analysis/${analysisId}/transcript`)
  return res.data
}

export async function askQuestion(analysisId: string, question: string): Promise<QAEntry> {
  const res = await apiClient.post(`/api/video-analysis/${analysisId}/question`, { question })
  return res.data
}

export async function generateQuiz(analysisId: string): Promise<{ quiz: QuizQuestion[] }> {
  const res = await apiClient.post(`/api/video-analysis/${analysisId}/quiz`)
  return res.data
}

export async function generateNotes(analysisId: string): Promise<{ notes: string }> {
  const res = await apiClient.post(`/api/video-analysis/${analysisId}/notes`)
  return res.data
}

export async function generateBilingual(analysisId: string): Promise<{ segments: BilingualSegment[] }> {
  const res = await apiClient.post(`/api/video-analysis/${analysisId}/bilingual`)
  return res.data
}

export async function searchTranscript(analysisId: string, query: string): Promise<{ results: TranscriptSegment[] }> {
  const res = await apiClient.get(`/api/video-analysis/${analysisId}/search`, { params: { q: query } })
  return res.data
}

// ---- Donat (loyihani qo'llab-quvvatlash) — login shart emas ----
export interface DonateOptions {
  presets: number[]
  min: number
  max: number
}

export async function getDonateOptions(): Promise<DonateOptions> {
  const res = await apiClient.get('/api/donate/options')
  return res.data
}

export async function createDonation(body: {
  amount: number
  provider: 'click' | 'payme' | 'uzum' | 'paynet'
  name?: string
  email?: string
  message?: string
}): Promise<{ success: boolean; payment_url?: string; account?: number; order_id?: string; payment_id: string; amount: number }> {
  const res = await apiClient.post('/api/donate', body)
  return res.data
}

const ANALYSIS_KEY = "dubber_last_analysis"

export function saveAnalysisId(id: string) {
  if (typeof window === "undefined") return
  localStorage.setItem(ANALYSIS_KEY, JSON.stringify({ id, ts: Date.now() }))
}

export function loadAnalysisId(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(ANALYSIS_KEY)
    if (!raw) return null
    const { id, ts } = JSON.parse(raw)
    if (Date.now() - ts > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(ANALYSIS_KEY)
      return null
    }
    return id ?? null
  } catch {
    return null
  }
}

export function clearAnalysisId() {
  if (typeof window === "undefined") return
  localStorage.removeItem(ANALYSIS_KEY)
}

export interface TelegramFeedbackPayload {
  name?: string
  contact?: string
  comment: string
  rating?: number
  page_url?: string
}

export async function sendTelegramFeedback(payload: TelegramFeedbackPayload): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post('/feedback', payload)
  return res.data
}


