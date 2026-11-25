'use client'
import { useState } from 'react'
import { Check, Clock, Copy, Redo2, Undo2 } from 'lucide-react'

export const ICON_BUTTON = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ui-rule text-ui-muted hover:text-ui-ink'

export const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 480]

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  return [hours && `${hours} soat`, minutes % 60 && `${minutes % 60} daqiqa`].filter(Boolean).join(' ')
}

export function DurationBadge({ minutes }: { minutes: number }) {
  return <span className="flex items-center gap-1"><Clock aria-hidden="true" className="h-3.5 w-3.5" />{formatDuration(minutes)}</span>
}

/** Sarlavha va tavsifni buferga nusxalaydi */
export function CopyButton({ title, description }: { title: string; description: string }) {
  const [status, setStatus] = useState<'idle' | 'done' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([title, description].filter(Boolean).join('\n'))
      setStatus('done')
    } catch {
      setStatus('failed')
    }
    setTimeout(() => setStatus('idle'), 1800)
  }
  const label = status === 'done' ? 'Nusxalandi' : status === 'failed' ? 'Nusxalab boʻlmadi' : 'Nusxalash'
  return (
    <button type="button" onClick={copy} title={label} aria-label={`${label}: ${title}`} className={ICON_BUTTON}>
      {status === 'done' ? <Check aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : <Copy aria-hidden="true" className={`h-4 w-4 ${status === 'failed' ? 'text-red-500' : ''}`} />}
    </button>
  )
}

/** Tahrirlangan matn bilan asl holat orasida almashish */
export function VersionButton({ version, onSwitch }: { version: 'original' | 'edited'; onSwitch: (to: 'original' | 'edited') => void }) {
  const toOriginal = version === 'edited'
  const Icon = toOriginal ? Undo2 : Redo2
  return (
    <button type="button" onClick={() => onSwitch(toOriginal ? 'original' : 'edited')}
      className="flex items-center gap-1.5 text-xs font-medium text-ui-accent-ink hover:underline">
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />{toOriginal ? 'Asl holatini tiklash' : 'Tahrirlanganini qaytarish'}
    </button>
  )
}
