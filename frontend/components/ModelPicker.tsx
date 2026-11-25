'use client'
import { useEffect, useState } from 'react'
import { apiClient, MODEL_CHOICE_KEYS } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

const SELECT = 'min-h-10 w-full rounded-lg border border-ui-rule bg-ui-surface px-2 text-sm text-ui-ink'
type Stage = 'stt' | 'llm' | 'tts'
interface Options { models: string[]; choices: Record<Stage, string[]> }
const STYLE_KEYS = ['female', 'male'] as const
const STAGES: Record<Stage, string> = { stt: 'Nutqni tanish (STT)', llm: 'Tarjima va matn', tts: 'Dublyaj ovozi' }
const NAMES: Record<string, string> = {
  '2160': '4K / 2160p (juda sekin)', '1440': '1440p (sekin)', '720': '720p', '480': '480p', '360': '360p', '240': '240p', '144': '144p',
  groq: 'Groq', neuronai: 'NeuronAI', gemini: 'Gemini', gapi: 'Gapi', edge: 'Edge (bepul)', azure: 'Azure',
  voicelab: 'VoiceLab', uzbekvoice: 'UzbekVoice', elevenlabs: 'ElevenLabs',
}

const read = (key: string) => { try { return localStorage.getItem(key) ?? '' } catch { return '' } }
const write = (key: string, value: string) => { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch {} }

/** BYOK egasi uchun provayder tanlagich: xizmatga kerakli bosqichlar. Boshqalarga chiqmaydi (API 404). */
export default function ModelPicker({ stages, preview = false }: { stages: Stage[]; preview?: boolean }) {
  const { user } = useAuth()
  const [options, setOptions] = useState<Options | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})

  useEffect(() => {
    if (user?.role !== 'admin') return
    const clear = () => Object.values(MODEL_CHOICE_KEYS).forEach((k) => write(k, ''))
    apiClient.get('/api/byok').then(({ data }) => {
      if (!data.enabled) return clear() // yashirin tanlov sezdirmay qoʻllanmasin
      const saved: Record<string, string> = { model: read(MODEL_CHOICE_KEYS.model), preview: read(MODEL_CHOICE_KEYS.preview), quality: read(MODEL_CHOICE_KEYS.quality), mix: read(MODEL_CHOICE_KEYS.mix), voices: read(MODEL_CHOICE_KEYS.voices) }
      for (const key of STYLE_KEYS) saved[key] = read(MODEL_CHOICE_KEYS[key])
      for (const stage of Object.keys(STAGES) as Stage[]) {
        const value = read(MODEL_CHOICE_KEYS[stage])
        // endi faol boʻlmagan provayder tanlovi oʻchiriladi
        if (value && !data.choices[stage].includes(value)) write(MODEL_CHOICE_KEYS[stage], '')
        else saved[stage] = value
      }
      setPicked(saved)
      setOptions(data)
    }).catch((e) => { if (e?.response?.status === 404) clear() })
  }, [user?.role])

  if (user?.role !== 'admin' || !options) return null
  const gapiVoice = stages.includes('tts') && options.choices.tts.includes('gapi') && ['', 'gapi', undefined].includes(picked.tts)
  const select = (key: keyof typeof MODEL_CHOICE_KEYS, label: string, values: string[], auto?: string) => (
    <label key={key} className="space-y-1 text-sm font-medium text-ui-ink">{label}
      <select value={picked[key] ?? ''} className={SELECT}
        onChange={(e) => { write(MODEL_CHOICE_KEYS[key], e.target.value); setPicked({ ...picked, [key]: e.target.value }) }}>
        <option value="">{auto ?? (key === 'tts' && values.includes('gapi') ? 'Avtomatik (Gapi)' : 'Avtomatik')}</option>
        {values.map((v) => <option key={v} value={v}>{v === 'gapi' ? (key === 'stt' ? 'Gapi (faqat oʻzbekcha)' : 'Gapi (Zebo / Doston)') : NAMES[v] ?? v[0].toUpperCase() + v.slice(1)}</option>)}
      </select>
    </label>
  )
  const check = (key: 'preview' | 'mix' | 'voices', on: string, label: string) => (
    <label className="flex items-center gap-2 text-sm font-medium text-ui-ink">
      <input type="checkbox" checked={!!picked[key]}
        onChange={(e) => { const v = e.target.checked ? on : ''; write(MODEL_CHOICE_KEYS[key], v); setPicked({ ...picked, [key]: v }) }} />
      {label}
    </label>
  )
  return (
    <div className="space-y-2">
    {preview && check('preview', '1', 'Faqat ilk 2 daqiqasini dublyaj qilish')}
    {stages.includes('tts') && check('mix', 'vocal', 'Faqat vokalni almashtirish (musiqa va boshqa tovushlar asl holida, sekinroq)')}
    {stages.includes('tts') && check('voices', 'two', 'Ikki ovoz: erkak va ayol alohida')}
    <details className="group rounded-control border border-ui-rule p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ui-ink">
        Model tanlovi
        <span className="ml-2 font-normal text-ui-muted">
          {[...stages, ...(gapiVoice ? STYLE_KEYS : []), 'quality', 'model'].map((k) => picked[k]).filter(Boolean).map((v) => NAMES[v] ?? v).join(' · ') || 'Avtomatik'}
        </span>
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {stages.map((s) => select(s, STAGES[s], options.choices[s]))}
        {gapiVoice && select('female', 'Ayol ovozi (Zebo) uslubi', ['neytral', 'jonli', 'sokin'], 'Iliq (standart)')}
        {gapiVoice && select('male', 'Erkak ovozi (Doston) uslubi', ['neytral', 'iliq', 'jonli'], 'Sokin (standart)')}
        {stages.includes('tts') && select('quality', 'Video sifati (videoda boʻlmasa, eng yaqini)', ['2160', '1440', '720', '480', '360', '240', '144'], '1080p (standart)')}
        {select('model', 'Gemini modeli (Gemini ishlatilganda)', options.models)}
      </div>
    </details>
    </div>
  )
}
