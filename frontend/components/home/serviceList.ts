import { AudioLines, Captions, Sparkles, type LucideIcon } from 'lucide-react'

export type ServiceId = 'dub' | 'subtitle' | 'analyze'

export const SERVICES: Record<ServiceId, { name: string; icon: LucideIcon }> = {
  dub: { name: 'Dublyaj', icon: AudioLines },
  subtitle: { name: 'Subtitr', icon: Captions },
  analyze: { name: 'Tahlil', icon: Sparkles },
}
