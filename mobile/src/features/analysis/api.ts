import { apiClient } from '../../api/client';
import type {
  AnalysisLanguage,
  BilingualSegment,
  CreateAnalysisResponse,
  QAEntry,
  QuizQuestion,
  TranscriptSegment,
  VideoAnalysis,
} from './types';

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

export async function askQuestion(analysisId: string, question: string): Promise<QAEntry> {
  const res = await apiClient.post<QAEntry>(`/api/video-analysis/${analysisId}/question`, { question });
  return res.data;
}

export async function generateQuiz(analysisId: string): Promise<{ quiz: QuizQuestion[] }> {
  const res = await apiClient.post<{ quiz: QuizQuestion[] }>(`/api/video-analysis/${analysisId}/quiz`);
  return res.data;
}

export async function generateNotes(analysisId: string): Promise<{ notes: string }> {
  const res = await apiClient.post<{ notes: string }>(`/api/video-analysis/${analysisId}/notes`);
  return res.data;
}

export async function generateBilingual(analysisId: string): Promise<{ segments: BilingualSegment[] }> {
  const res = await apiClient.post<{ segments: BilingualSegment[] }>(`/api/video-analysis/${analysisId}/bilingual`);
  return res.data;
}

export async function searchTranscript(analysisId: string, query: string): Promise<{ results: TranscriptSegment[] }> {
  const res = await apiClient.get<{ results: TranscriptSegment[] }>(`/api/video-analysis/${analysisId}/search`, {
    params: { q: query },
  });
  return res.data;
}

export async function listAnalyses(): Promise<VideoAnalysis[]> {
  const res = await apiClient.get<VideoAnalysis[]>('/api/video-analysis');
  return res.data;
}

export async function deleteAnalysis(analysisId: string): Promise<void> {
  await apiClient.delete(`/api/video-analysis/${analysisId}`);
}
