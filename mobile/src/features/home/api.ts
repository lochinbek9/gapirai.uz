import { apiClient } from '../../api/client';

export interface PublicStats {
  dubs: number;
  minutes: number;
  users: number;
}

/** Bosh sahifadagi jonli raqamlar (ichki/test hisoblarsiz). */
export async function getPublicStats(): Promise<PublicStats> {
  const res = await apiClient.get<PublicStats>('/api/public-stats');
  return res.data;
}
