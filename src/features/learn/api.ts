import { apiClient } from '../../api/client';
import type { VoiceGender } from '../dubbing/types';
import type { LearnResponse } from './types';

// POST /api/learn — starts dub + analysis together for the unified Learning
// Workspace (mirrors frontend's equivalent call into backend/api/learn_routes.py).
export async function learnVideo(youtubeUrl: string, voiceGender: VoiceGender): Promise<LearnResponse> {
  const res = await apiClient.post<LearnResponse>('/api/learn', {
    youtube_url: youtubeUrl,
    voice_gender: voiceGender,
  });
  return res.data;
}
