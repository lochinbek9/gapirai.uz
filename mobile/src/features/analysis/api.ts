import * as FileSystem from 'expo-file-system/legacy';

import { apiClient } from '../../api/client';
import { getStoredToken } from '../../api/tokenStorage';
import { API_URL } from '../../config/env';
import { UploadError, uploadErrorText } from '../dubbing/api';
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

// backend/services/document_extract.py bilan bir xil
export const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.pptx', '.epub'];
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export interface LocalDocument {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

/** POST /api/video-analysis/document (multipart: file + language). Server fayl nomidan
 *  formatni aniqlaydi, shuning uchun fayl asl nomi bilan keshga ko'chirib yuboriladi
 *  (picker nusxasining nomi tasodifiy bo'lishi mumkin). onProgress 0..1. */
export async function uploadDocument(
  doc: LocalDocument,
  language: AnalysisLanguage,
  onProgress?: (fraction: number) => void,
): Promise<CreateAnalysisResponse> {
  const safeName = doc.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'hujjat';
  const dir = `${FileSystem.cacheDirectory}doc-upload-${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const local = `${dir}${safeName}`;
  await FileSystem.copyAsync({ from: doc.uri, to: local });
  const token = await getStoredToken();
  try {
    const task = FileSystem.createUploadTask(
      `${API_URL}/api/video-analysis/document`,
      local,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: doc.mimeType || 'application/octet-stream',
        parameters: { language },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      ({ totalBytesSent, totalBytesExpectedToSend }) => {
        if (onProgress && totalBytesExpectedToSend > 0) onProgress(totalBytesSent / totalBytesExpectedToSend);
      },
    );
    const res = await task.uploadAsync();
    if (!res) throw new UploadError('Yuklash bekor qilindi.', 0);
    if (res.status !== 201 && res.status !== 200) throw new UploadError(uploadErrorText(res.status, res.body), res.status);
    return JSON.parse(res.body) as CreateAnalysisResponse;
  } finally {
    FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
  }
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
