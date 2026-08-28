import { apiClient } from '../../api/client';
import { API_URL } from '../../config/env';
import type {
  CancelJobResponse,
  CreateJobResponse,
  InitiatePaymentResponse,
  InitiateUzumPaymentResponse,
  Job,
  RequestResolutionResponse,
  ResolutionOption,
  VideoInfo,
  VoiceGender,
} from './types';

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
export async function createJob(youtubeUrl: string, voiceGender: VoiceGender): Promise<CreateJobResponse> {
  const res = await apiClient.post<CreateJobResponse>('/api/jobs', {
    youtube_url: youtubeUrl,
    target_language: 'uz',
    voice_gender: voiceGender,
  });
  return res.data;
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await apiClient.get<Job>(`/api/jobs/${jobId}`);
  return res.data;
}

// Mirrors backend/api/routes.py's _ALLOWED_UPLOAD_CONTENT_TYPES /
// MAX_UPLOAD_SIZE_BYTES exactly (also mirrors frontend/lib/api.ts's web
// equivalent) -- client-side check only, the backend is the real gate.
export const UPLOAD_ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'];
export const UPLOAD_MAX_SIZE_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB

// YouTube DOWNLOAD bosqichida muvaffaqiyatsiz bo'lgan job uchun -- foydalanuvchi
// videoni to'g'ridan-to'g'ri yuklaydi, xuddi shu job qayta navbatga qo'yiladi
// (mavjud pipeline, ikkinchi yo'l yaratilmaydi). React Native's FormData needs
// a { uri, name, type } descriptor rather than a browser File object.
export async function uploadVideoFallback(
  jobId: string,
  file: { uri: string; name: string; mimeType: string },
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ success: boolean; message: string }> {
  const formData = new FormData();
  // @ts-expect-error -- React Native's FormData accepts this shape, not the DOM File type.
  formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType });
  const res = await apiClient.post<{ success: boolean; message: string }>(
    `/api/jobs/${jobId}/upload-video`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
      signal,
    },
  );
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

// Payme's own hosted checkout page — same external-link pattern as Click.
export async function initiatePaymePayment(jobId: string): Promise<InitiatePaymentResponse> {
  const res = await apiClient.post<InitiatePaymentResponse>('/api/payments/payme/initiate', { job_id: jobId });
  return res.data;
}

// Uzum has no hosted checkout URL (see backend/api/uzum_routes.py) — the
// caller shows `account` for the user to enter manually in the Uzum app,
// there is nothing to Linking.openURL here.
export async function initiateUzumPayment(jobId: string): Promise<InitiateUzumPaymentResponse> {
  const res = await apiClient.post<InitiateUzumPaymentResponse>('/api/payments/uzum/initiate', { job_id: jobId });
  return res.data;
}

// Mirrors frontend/lib/api.ts's getJobResolutions/requestResolution — only
// the own-job endpoints (mobile has no public "library" screen, so
// /api/library/{id}/resolutions is not needed here).
export async function getJobResolutions(jobId: string): Promise<{ resolutions: ResolutionOption[] }> {
  const res = await apiClient.get<{ resolutions: ResolutionOption[] }>(`/api/jobs/${jobId}/resolutions`);
  return res.data;
}

export async function requestResolution(jobId: string, resolution: string): Promise<RequestResolutionResponse> {
  const res = await apiClient.post<RequestResolutionResponse>(`/api/jobs/${jobId}/resolutions/${resolution}`);
  return res.data;
}
