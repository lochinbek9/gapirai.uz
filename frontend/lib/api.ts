import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: API_BASE });

export interface VideoInfo {
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
}

export interface Job {
  job_id: string;
  status: JobStatus;
  progress: number;
  status_message: string | null;
  video_title: string | null;
  video_duration: number | null;
  output_video_url: string | null;
  transcript_text: string | null;
  translated_text: string | null;
  error_message: string | null;
}

export type JobStatus =
  | "pending"
  | "downloading"
  | "transcribing"
  | "translating"
  | "synthesizing"
  | "syncing"
  | "merging"
  | "completed"
  | "failed";

export const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Navbatda kutilmoqda",
  downloading: "Video yuklanmoqda",
  transcribing: "Nutq matnga aylantirilmoqda",
  translating: "O'zbek tiliga tarjima qilinmoqda",
  synthesizing: "O'zbek ovozi yaratilmoqda",
  syncing: "Ovoz sinxronizatsiya qilinmoqda",
  merging: "Video birlashtirilmoqda",
  completed: "Tayyor!",
  failed: "Xatolik yuz berdi",
};

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const res = await api.get("/api/video-info", { params: { url } });
  return res.data;
}

export async function createJob(youtubeUrl: string): Promise<{ job_id: string }> {
  const res = await api.post("/api/jobs", { youtube_url: youtubeUrl });
  return res.data;
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await api.get(`/api/jobs/${jobId}`);
  return res.data;
}

export async function listJobs(): Promise<Job[]> {
  const res = await api.get("/api/jobs");
  return res.data;
}

export function getDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/outputs/${jobId}/video`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
