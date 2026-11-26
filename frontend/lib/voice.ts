import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'

type VoiceJob = { tts_provider?: string | null; voice_name?: string | null; speaker_gender?: string | null }

/** Mijozga ko'rinadigan dvigatel nomi. */
export function engineLabel(provider?: string | null): string {
  const p = (provider || 'azure').toLowerCase()
  return p === 'gemini' ? 'GapirAI HD' : p === 'edge' ? 'Standart' : 'Neural HD'
}

/** Haqiqatda eshitiladigan ovoz nomi: gapi'da Zebo / Doston. */
export function voiceName(job: VoiceJob): string {
  const p = (job.tts_provider || 'azure').toLowerCase()
  const female = job.speaker_gender === 'female' || /madina|female|autonoe|aoede|kore/i.test(job.voice_name || '')
  if (p === 'gapi') return female ? 'Zebo' : 'Doston'
  if (job.voice_name) return job.voice_name.replace('uz-UZ-', '').replace('Neural', '')
  if (p === 'gemini') return female ? 'Autonoe' : 'Charon'
  return female ? 'Madina' : 'Sardor'
}

let cached: Promise<string | null> | null = null

/** Tizim ovozi ("gapi") yoki null. */
export function useSystemVoice(): string | null {
  const [provider, setProvider] = useState<string | null>(null)
  useEffect(() => {
    cached ??= apiClient.get('/api/tts-default').then((r) => r.data.provider as string | null).catch(() => { cached = null; return null })
    cached.then(setProvider)
  }, [])
  return provider
}
