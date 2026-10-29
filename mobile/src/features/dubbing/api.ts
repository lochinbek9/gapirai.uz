import * as FileSystem from 'expo-file-system/legacy';

import { apiClient } from '../../api/client';
import { getStoredToken } from '../../api/tokenStorage';
import { API_URL } from '../../config/env';
import type { CancelJobResponse, CreateJobResponse, InitiatePaymentResponse, Job, LocalVideo, VideoInfo, VoiceGender } from './types';

// GET /api/outputs/{job_id}/video — 307-redirects to an S3 presigned URL
// (1hr expiry) or streams the local file. No auth required. The player
// re-resolves this each time it (re)loads, so the 1hr expiry is a non-issue
// in practice (see MOBILE_INTEGRATION_AUDIT.md §10-11).
export function getVideoUrl(jobId: string): string {
  return `${API_URL}/api/outputs/${jobId}/video`;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const res = await apiClient.get<VideoInfo>('/api/video-info', { params: { url } });
  return res.data;
}

// target_language is always "uz" server-side regardless of what's sent
// (backend/api/routes.py CreateJobRequest defaults it and the web client
// always sends "uz" too) — no language picker needed for dubbing.
export async function createJob(youtubeUrl: string, voiceGender: VoiceGender, subtitleOnly = false): Promise<CreateJobResponse> {
  const res = await apiClient.post<CreateJobResponse>('/api/jobs', {
    youtube_url: youtubeUrl,
    target_language: 'uz',
    voice_gender: voiceGender,
    subtitle_only: subtitleOnly,
    source_language: 'auto',
  });
  return res.data;
}

// Saytdagi kabi: backend faqat shu turlarni qabul qiladi (backend/api/routes.py
// _ALLOWED_UPLOAD_CONTENT_TYPES), 1 GB gacha.
export const UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
};

export function uploadContentType(video: LocalVideo): string | null {
  const mime = (video.mimeType || '').toLowerCase();
  if (Object.values(CONTENT_TYPES).includes(mime)) return mime;
  const ext = (video.name.split('.').pop() || '').toLowerCase();
  return CONTENT_TYPES[ext] ?? null;
}

export class UploadError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function uploadErrorText(status: number, body: string): string {
  try {
    const d = JSON.parse(body)?.detail;
    if (typeof d === 'string' && d.trim()) return d;
    if (d && typeof d.message === 'string') return d.message;
  } catch {
    // JSON emas
  }
  if (status === 401) return 'Hisobingizga qaytadan kiring.';
  if (status === 413) return 'Fayl 1 GB dan katta.';
  return `Yuklashda xatolik (${status || 'tarmoq'}).`;
}

// POST /api/jobs/upload -- multipart EMAS, xom fayl tanasi (Content-Type, Content-Length,
// X-File-Name). Fayl xotiraga o'qilmaydi: expo-file-system to'g'ridan-to'g'ri diskdan oqim
// bilan yuboradi; onProgress 0..1.
export async function uploadVideo(
  video: LocalVideo,
  opts: { subtitleOnly: boolean; voiceGender: VoiceGender },
  onProgress?: (fraction: number) => void,
): Promise<CreateJobResponse> {
  const contentType = uploadContentType(video);
  if (!contentType) throw new UploadError('Bu format qoʻllab-quvvatlanmaydi. MP4, MOV, MKV yoki WebM kerak.', 415);
  const token = await getStoredToken();
  const qs = new URLSearchParams({
    subtitle_only: String(opts.subtitleOnly),
    voice_gender: opts.voiceGender,
    source_language: 'auto',
  });
  const task = FileSystem.createUploadTask(
    `${API_URL}/api/jobs/upload?${qs.toString()}`,
    video.uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Content-Type': contentType,
        'X-File-Name': encodeURIComponent(video.name),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (onProgress && totalBytesExpectedToSend > 0) onProgress(totalBytesSent / totalBytesExpectedToSend);
    },
  );
  const res = await task.uploadAsync();
  if (!res) throw new UploadError('Yuklash bekor qilindi.', 0);
  if (res.status !== 201 && res.status !== 200) throw new UploadError(uploadErrorText(res.status, res.body), res.status);
  return JSON.parse(res.body) as CreateJobResponse;
}

// Tayyor subtitrni (SRT) keshga yuklab, Android ulashish oynasini ochadi
// (Telegram, Fayllar, CapCut ...). Dublaj job'ida ham ishlaydi.
export async function downloadSubtitleFile(jobId: string, title?: string): Promise<string> {
  const safe = (title || jobId).replace(/[^\p{L}\p{N} ._-]+/gu, ' ').trim().slice(0, 60) || jobId;
  const target = `${FileSystem.cacheDirectory}${safe}.uz.srt`;
  const res = await FileSystem.downloadAsync(`${API_URL}/api/jobs/${jobId}/subtitles.srt`, target);
  if (res.status !== 200) throw new Error('Subtitrni yuklab boʻlmadi.');
  return res.uri;
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await apiClient.get<Job>(`/api/jobs/${jobId}`);
  return res.data;
}

export async function cancelJob(jobId: string): Promise<CancelJobResponse> {
  const res = await apiClient.post<CancelJobResponse>(`/api/jobs/${jobId}/cancel`);
  return res.data;
}

// Click.uz's own hosted checkout page — opened externally (Linking.openURL),
// never rendered as native UI (see MOBILE_INTEGRATION_AUDIT.md §6 Payments).
export async function initiateClickPayment(jobId: string): Promise<InitiatePaymentResponse> {
  const res = await apiClient.post<InitiatePaymentResponse>('/api/payments/click/initiate', { job_id: jobId });
  return res.data;
}
