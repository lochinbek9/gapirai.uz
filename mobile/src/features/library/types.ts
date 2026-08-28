// Mirrors frontend/lib/api.ts's library types (LibraryItem, plus the shared
// ResolutionOption from dubbing/types.ts — same shape, different endpoints).

export interface LibraryItem {
  job_id: string;
  youtube_url: string;
  video_title: string | null;
  video_duration: number | null;
  video_thumbnail: string | null;
  speaker_gender: string | null;
  created_at: string | null;
}

export interface LibraryAccessResponse {
  has_access: boolean;
}

export interface LibraryEligibleResponse {
  eligible: boolean;
}

export interface PurchaseLibraryResponse {
  success: boolean;
  payment_url?: string;
  payment_id?: string;
  amount: number;
  message?: string;
}
