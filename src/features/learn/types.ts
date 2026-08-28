// Mirrors backend/api/learn_routes.py's learn_video response shape exactly.
export interface LearnResponse {
  dubbing_job_id: string;
  analysis_id: string | null;
  status: string;
  amount?: number;
}
