import { z } from 'zod';

import { isValidYoutubeUrl } from '../../utils/youtube';

export const dubFormSchema = z.object({
  youtubeUrl: z
    .string()
    .trim()
    .min(1, 'YouTube havolasini kiriting')
    .refine(isValidYoutubeUrl, 'Faqat YouTube havolasi qabul qilinadi'),
  voiceGender: z.enum(['auto', 'male', 'female']),
});
export type DubFormValues = z.infer<typeof dubFormSchema>;
