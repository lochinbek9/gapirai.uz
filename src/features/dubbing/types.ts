// Mirrors backend/api/routes.py exactly (see MOBILE_INTEGRATION_AUDIT.md §6-7).

export type VoiceGender = 'auto' | 'male' | 'female';

export type JobStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'downloading'
  | 'transcribing'
  | 'translating'
  | 'synthesizing'
  | 'syncing'
  | 'merging'
  | 'completed'
  | 'failed';

export const TERMINAL_JOB_STATUSES: JobStatus[] = ['completed', 'failed'];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Navbatda',
  awaiting_payment: "To'lov kutilmoqda",
  downloading: 'Yuklanmoqda',
  transcribing: 'Matnga aylantirilmoqda',
  translating: 'Tarjima qilinmoqda',
  synthesizing: 'Ovoz yaratilmoqda',
  syncing: 'Talaffuzga moslashtirilmoqda',
  merging: 'Birlashtirilmoqda',
  completed: 'Tayyor',
  failed: 'Xatolik',
};

export interface VideoInfo {
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
}

export interface CreateJobResponse {
  job_id: string;
  status: string;
  amount?: number;
}

// Full JobResponse shape from backend/api/routes.py's _job_to_response.
export interface Job {
  job_id: string;
  status: JobStatus;
  progress: number;
  status_message?: string;
  video_title?: string;
  video_duration?: number;
  video_thumbnail?: string;
  output_video_url?: string;
  transcript_text?: string;
  translated_text?: string;
  error_message?: string;
  error_code?: string;
  created_at?: string;
  speaker_gender?: string;
  voice_gender_setting?: string;
  uzbek_srt_content?: string;
  expected_end_time?: string;
  rating?: number;
  feedback_comment?: string;
}

export interface InitiatePaymentResponse {
  success: boolean;
  payment_url: string;
  payment_id?: string;
  amount: number;
}

export interface CancelJobResponse {
  success: boolean;
  message: string;
}
