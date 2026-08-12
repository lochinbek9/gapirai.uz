import { z } from 'zod';

import { isValidYoutubeUrl } from '../../utils/youtube';
import { ANALYSIS_LANGUAGE_OPTIONS, type AnalysisLanguage } from './types';

const languageValues = ANALYSIS_LANGUAGE_OPTIONS.map((o) => o.value) as [AnalysisLanguage, ...AnalysisLanguage[]];

export const analyzeFormSchema = z.object({
  youtubeUrl: z
    .string()
    .trim()
    .min(1, 'YouTube havolasini kiriting')
    .refine(isValidYoutubeUrl, 'Faqat YouTube havolasi qabul qilinadi'),
  language: z.enum(languageValues),
});
export type AnalyzeFormValues = z.infer<typeof analyzeFormSchema>;
