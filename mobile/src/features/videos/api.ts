import { apiClient } from '../../api/client';

// backend/api/routes.py list_public_videos bilan bir xil shakl
export interface PublicVideo {
  id: string;
  video_title: string | null;
  video_thumbnail: string | null;
  video_duration: number | null;
  published_at: string | null;
}

export interface PublicVideosPage {
  videos: PublicVideo[];
  page: number;
  has_more: boolean;
}

/** "Ommaviy videolar": admin chiqargan tayyor dublyajlar, eng yangisi birinchi (auth kerak emas). */
export async function listPublicVideos(page: number): Promise<PublicVideosPage> {
  const res = await apiClient.get<PublicVideosPage>('/api/public-videos', { params: { page, page_size: 24 } });
  return res.data;
}
