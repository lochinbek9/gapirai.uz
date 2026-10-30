'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Link2, MessageCircle, Send, Share2 } from 'lucide-react'

/**
 * Video havolasini ulashish (YouTube "Unlisted" kabi): havolasi bor har kim ko'radi,
 * video hech qayerda ro'yxatda chiqmaydi (backend/api/routes.py get_job).
 * Telefonda -- tizim ulashish oynasi; kompyuterda -- havola + Telegram/WhatsApp.
 */
export default function ShareButton({ jobId, title }: { jobId: string; title?: string | null }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const url = typeof window !== 'undefined' ? `${window.location.origin}/video/${jobId}` : `https://gapirai.uz/video/${jobId}`
  const text = `${title || 'Video'} — o'zbekcha dublyaj`

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Eski brauzer: inputdagi matnni belgilab qo'yamiz, foydalanuvchi o'zi nusxalaydi
      boxRef.current?.querySelector('input')?.select()
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const onClick = async () => {
    // Telefonda tizim oynasi qulayroq (Telegram, WhatsApp, Instagram... hammasi bitta joyda)
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: text, text, url })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    setOpen(o => !o)
  }

  const enc = encodeURIComponent
  return (
    <div ref={boxRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="ui-btn ui-btn-secondary h-9 gap-1.5 px-3.5 text-sm"
      >
        <Share2 className="h-4 w-4" />
        Ulashish
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Videoni ulashish"
          className="ui-card absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] space-y-4 p-4 shadow-xl"
        >
          <div>
            <p className="text-sm font-semibold text-ui-ink">Videoni ulashish</p>
            <p className="mt-1 text-xs leading-relaxed text-ui-muted">
              Havolasi bor har kim ko‘ra oladi. Video saytdagi ro‘yxatlarda chiqmaydi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-ui-rule bg-ui-ground px-3 h-10">
              <Link2 className="h-4 w-4 flex-shrink-0 text-ui-muted" />
              <input
                readOnly
                value={url}
                onFocus={e => e.currentTarget.select()}
                aria-label="Video havolasi"
                className="min-w-0 flex-1 bg-transparent text-sm text-ui-ink outline-none"
              />
            </div>
            <button type="button" onClick={copy} className="ui-btn ui-btn-primary h-10 gap-1.5 px-3 text-sm">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Nusxalandi' : 'Nusxa'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn ui-btn-secondary h-10 gap-2 text-sm"
            >
              <Send className="h-4 w-4 text-[#2AABEE]" />
              Telegram
            </a>
            <a
              href={`https://wa.me/?text=${enc(`${text} ${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn ui-btn-secondary h-10 gap-2 text-sm"
            >
              <MessageCircle className="h-4 w-4 text-[#25D366]" />
              WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
