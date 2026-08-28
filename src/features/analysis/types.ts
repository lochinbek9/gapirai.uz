// Mirrors backend/api/video_analysis_routes.py exactly (see
// MOBILE_INTEGRATION_AUDIT.md §6, §9). This is the real, backend-enforced
// language list — do not add languages the API doesn't accept.
export const ANALYSIS_LANGUAGE_OPTIONS = [
  { value: 'uz', label: "O'zbekcha" },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'kk', label: 'Қазақша' },
  { value: 'original', label: 'Original tilda' },
] as const;

export type AnalysisLanguage = (typeof ANALYSIS_LANGUAGE_OPTIONS)[number]['value'];

// Mirrors frontend/lib/api.ts's LANGUAGE_DISPLAY — video_language is
// Whisper-detected and can be any language, not just the 6 analysis options.
const LANGUAGE_DISPLAY: Record<string, string> = {
  uz: "O'zbekcha",
  en: 'English',
  ru: 'Русский',
  tr: 'Türkçe',
  kk: 'Қазақша',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ko: '한국어',
  ja: '日本語',
  zh: '中文',
  ar: 'العربية',
  pt: 'Português',
  it: 'Italiano',
  hi: 'हिन्दी',
};

export function displayLanguage(code?: string | null): string {
  if (!code) return '';
  return LANGUAGE_DISPLAY[code] || code;
}

export type AnalysisStatus =
  | 'pending'
  | 'downloading'
  | 'extracting_audio'
  | 'transcribing'
  | 'analyzing'
  | 'generating_results'
  | 'completed'
  | 'failed';

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  pending: 'Navbatda',
  downloading: 'Yuklanmoqda',
  extracting_audio: 'Audio ajratilmoqda',
  transcribing: 'Matnga aylantirilmoqda',
  analyzing: 'AI tahlil qilinmoqda',
  generating_results: 'Natijalar tayyorlanmoqda',
  completed: 'Tayyor',
  failed: 'Xatolik',
};

export const TERMINAL_ANALYSIS_STATUSES: AnalysisStatus[] = ['completed', 'failed'];

export interface CreateAnalysisResponse {
  analysis_id: string;
  status: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface KeyPoint {
  title: string;
  description: string;
  timestamp: number;
}

export interface Chapter {
  title: string;
  start: number;
  end: number;
}

export interface AnalysisSummary {
  short: string;
  medium: string;
  detailed: string;
}

export interface KeyTerm {
  term: string;
  explanation: string;
}

// "5 daqiqada" -- oddiy AnalysisSummary'dan farqli, o'quv-yo'naltirilgan
// siqilgan format (mirrors frontend/lib/api.ts's FiveMinuteSummary).
export interface FiveMinuteSummary {
  title: string;
  why_it_matters: string;
  core_ideas: string[];
  examples: string[];
  takeaways: string[];
  key_terms: KeyTerm[];
  remember: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
  timestamp: number;
}

export interface QAEntry {
  question: string;
  answer: string;
  timestamps: number[];
  asked_at: string;
}

export interface BilingualSegment {
  start: number;
  end: number;
  original: string;
  translated: string;
}

// Full shape from backend/api/video_analysis_routes.py's _analysis_to_dict.
export interface VideoAnalysis {
  id: string;
  status: AnalysisStatus;
  progress: number;
  status_message?: string;
  youtube_url: string;
  video_title?: string;
  video_duration?: number;
  video_thumbnail?: string;
  language: string;
  video_language?: string;
  summary?: AnalysisSummary;
  key_points?: KeyPoint[];
  chapters?: Chapter[];
  five_minute_summary?: FiveMinuteSummary;
  notes?: string;
  quiz?: QuizQuestion[];
  qa_history: QAEntry[];
  error_message?: string;
  error_code?: string;
  created_at?: string;
}
