import { apiClient } from '../../api/client';
import type { AnalysisLanguage, CreateAnalysisResponse, TranscriptSegment, VideoAnalysis } from './types';

export async function createAnalysis(youtubeUrl: string, language: AnalysisLanguage): Promise<CreateAnalysisResponse> {
  const res = await apiClient.post<CreateAnalysisResponse>('/api/video-analysis', {
    youtube_url: youtubeUrl,
    language,
  });
  return res.data;
}

export async function getAnalysis(analysisId: string): Promise<VideoAnalysis> {
  const res = await apiClient.get<VideoAnalysis>(`/api/video-analysis/${analysisId}`);
  return res.data;
}

// transcript_segments is NOT included in the main analysis object — a
// separate call is required (see MOBILE_INTEGRATION_AUDIT.md §6).
export async function getTranscript(analysisId: string): Promise<{ segments: TranscriptSegment[] }> {
  const res = await apiClient.get<{ segments: TranscriptSegment[] }>(`/api/video-analysis/${analysisId}/transcript`);
  return res.data;
}
