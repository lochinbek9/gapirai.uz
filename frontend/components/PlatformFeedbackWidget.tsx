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
        className="fixed right-4 sm:right-5 z-40 flex items-center justify-center gap-2 h-10 min-w-10 px-3 sm:px-3.5 bg-ui-surface text-ui-ink text-sm font-medium border border-ui-rule rounded-full shadow-[0_4px_16px_rgb(0_0_0/0.10)] hover:bg-ui-ground transition-colors"
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
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
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
              className="relative w-full sm:max-w-md bg-ui-surface text-ui-ink border border-ui-rule rounded-t-card sm:rounded-card p-6 sm:p-7 shadow-[0_24px_64px_rgb(0_0_0/0.25)]"
            >
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-lg text-ui-muted hover:bg-ui-ground hover:text-ui-ink transition"
                aria-label="Yopish"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>

              {submitted ? (
                <div className="text-center py-6 space-y-3">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ui-green/10 text-ui-green-ink">
                    <CheckCircle2 aria-hidden="true" className="w-7 h-7" />
                  </div>
                  <h2 id="platform-feedback-title" className="text-lg font-semibold">Rahmat!</h2>
                  <p className="text-[15px] text-ui-muted">Fikringiz qabul qilindi va jamoamizga yuborildi.</p>
                  <button
                    onClick={handleClose}
                    className="mt-2 text-sm font-medium text-ui-ink underline underline-offset-4"
                  >
                    Yopish
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <h2 id="platform-feedback-title" className="text-lg font-semibold tracking-[-0.01em] mb-1 pr-8">Platforma haqida fikringizni bildiring</h2>
                    <p className="text-[15px] text-ui-muted">Takliflaringiz GapirAI.uz&apos;ni yaxshilashga yordam beradi.</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <StarRating value={rating} onChange={setRating} allowClear label="Platformaga baho (ixtiyoriy)" starClassName="w-6 h-6" />
                    <span className="ml-1 text-sm text-ui-muted">(ixtiyoriy)</span>
                  </div>

                  <label htmlFor="platform-feedback-message" className="sr-only">Fikringiz</label>
                  <textarea
                    id="platform-feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Fikringiz, taklifingiz yoki muammoingizni yozing..."
                    rows={4}
                    maxLength={2000}
                    className="ui-input w-full px-3 py-2.5 text-base placeholder:text-ui-muted focus:outline-none resize-none"
                  />

                  {error && <p role="alert" className="text-sm text-ui-red-ink">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="ui-btn ui-btn-primary w-full"
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
