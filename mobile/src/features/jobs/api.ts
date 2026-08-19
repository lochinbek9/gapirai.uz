import { apiClient } from '../../api/client';
import type { Job } from '../dubbing/types';

// Job shape is identical to features/dubbing/types.ts's Job (both mirror
// backend/api/routes.py's _job_to_response) — reused rather than duplicated.
export async function listJobs(): Promise<Job[]> {
  const res = await apiClient.get<Job[]>('/api/jobs');
  return res.data;
}

export async function deleteJob(jobId: string): Promise<void> {
  await apiClient.delete(`/api/jobs/${jobId}`);
}
