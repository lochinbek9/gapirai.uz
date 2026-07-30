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
}

export type JobStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'downloading'
  | 'transcribing'
  | 'translating'
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

export async function createJob(
  youtube_url: string,
  voice_gender: string = 'auto',
): Promise<{ job_id: string; status: string }> {
  const res = await apiClient.post('/api/jobs', { youtube_url, target_language: 'uz', voice_gender })
  return res.data
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await apiClient.get(`/api/jobs/${jobId}`)
  return res.data
}

export async function listJobs(): Promise<Job[]> {
  const res = await apiClient.get('/api/jobs')
  return res.data
}

export async function deleteJob(jobId: string): Promise<void> {
  await apiClient.delete(`/api/jobs/${jobId}`)
}

export async function initiateClickPayment(jobId: string): Promise<{ success: boolean; payment_url: string; amount: number }> {
  const res = await apiClient.post('/api/payments/click/initiate', { job_id: jobId })
  return res.data
}

export function getDownloadUrl(jobId: string): string {
  return `${API_URL}/api/outputs/${jobId}/video`
}

export function getVideoUrl(jobId: string): string {
  return `${API_URL}/outputs/${jobId}/dubbed_final.mp4`
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
