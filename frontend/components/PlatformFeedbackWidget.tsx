'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageSquarePlus, X, Send, CheckCircle2, Loader2 } from 'lucide-react'
import StarRating from '@/components/ui/StarRating'
import { submitPlatformFeedback } from '@/lib/api'
import { useIsTmaMode } from '@/hooks/useIsTmaMode'

export default function PlatformFeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(0)
  // Sahifadagi to'liq fikr formasi (TelegramFeedbackSection) ko'rinib turganda
  // FAB takroriy va kontentni yopadi -- o'sha paytda yashiramiz
  const [inlineFormVisible, setInlineFormVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isTma = useIsTmaMode()

  const handleClose = () => {
    setOpen(false)
    setTimeout(() => {
      setMessage('')
      setRating(0)
      setSubmitted(false)
      setError(null)
    }, 300)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) {
      setError("Iltimos, fikringizni yozing.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submitPlatformFeedback(message.trim(), rating || undefined)
      setSubmitted(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Yuborishda xatolik yuz berdi. Qayta urinib ko'ring.")
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const target = document.querySelector('[data-feedback-section]')
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setInlineFormVisible(entry.isIntersecting), { threshold: 0.15 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (isTma) return null

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 20 }}
        animate={inlineFormVisible ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
        transition={{ delay: inlineFormVisible ? 0 : 0.6, duration: 0.3 }}
        aria-hidden={inlineFormVisible || undefined}
        tabIndex={inlineFormVisible ? -1 : undefined}
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))', pointerEvents: inlineFormVisible ? 'none' : undefined }}
        className="fixed right-4 sm:right-5 z-40 flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-4 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-full shadow-lg shadow-violet-600/30 hover:scale-105 active:scale-95 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500"
        aria-label="Fikr bildirish"
        aria-haspopup="dialog"
      >
        <MessageSquarePlus aria-hidden="true" className="w-4 h-4" />
        <span className="hidden sm:inline">Fikr bildirish</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', duration: 0.4 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="platform-feedback-title"
              className="relative w-full sm:max-w-md bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 sm:p-7 shadow-2xl"
            >
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition text-gray-400"
                aria-label="Yopish"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>

              {submitted ? (
                <div className="text-center py-6 space-y-3">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 aria-hidden="true" className="w-7 h-7" />
                  </div>
                  <h2 id="platform-feedback-title" className="text-white font-bold text-base">Rahmat!</h2>
                  <p className="text-xs text-gray-400">Fikringiz qabul qilindi va jamoamizga yuborildi.</p>
                  <button
                    onClick={handleClose}
                    className="mt-2 text-xs font-bold text-violet-400 hover:text-violet-300 transition"
                  >
                    Yopish
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <h2 id="platform-feedback-title" className="text-white font-bold text-base mb-1">Platforma haqida fikringizni bildiring</h2>
                    <p className="text-sm text-gray-300">Takliflaringiz GapirAI.uz&apos;ni yaxshilashga yordam beradi.</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <StarRating value={rating} onChange={setRating} allowClear label="Platformaga baho (ixtiyoriy)" starClassName="w-6 h-6" emptyClassName="text-slate-500" />
                    <span className="text-xs text-gray-400 ml-1">(ixtiyoriy)</span>
                  </div>

                  <label htmlFor="platform-feedback-message" className="sr-only">Fikringiz</label>
                  <textarea
                    id="platform-feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Fikringiz, taklifingiz yoki muammoingizni yozing..."
                    rows={4}
                    maxLength={2000}
                    className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 resize-none"
                  />

                  {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-3 rounded-2xl transition text-sm"
                  >
                    {submitting ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Send aria-hidden="true" className="w-4 h-4" />}
                    Yuborish
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
