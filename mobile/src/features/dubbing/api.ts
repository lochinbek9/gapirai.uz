import { apiClient } from '../../api/client';
import { API_URL } from '../../config/env';
import type { CancelJobResponse, CreateJobResponse, InitiatePaymentResponse, Job, VideoInfo, VoiceGender } from './types';

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
