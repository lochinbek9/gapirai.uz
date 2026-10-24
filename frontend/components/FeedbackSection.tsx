'use client'

import { useState } from 'react'
import { Star, Send, CheckCircle2, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { submitFeedback } from '@/lib/api'

interface FeedbackSectionProps {
  jobId: string
  initialRating?: number
  initialComment?: string
}

type OkValue = boolean | null

function ThumbsQuestion({ label, value, onChange }: { label: string; value: OkValue; onChange: (v: OkValue) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-ui-rule px-3.5 py-2">
      <span className="text-sm text-ui-ink">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(value === true ? null : true)}
          aria-label={`${label}: yaxshi`}
          aria-pressed={value === true}
          className={`rounded-lg p-2 transition ${value === true ? 'bg-ui-green/10 text-ui-green-ink' : 'text-ui-muted hover:bg-ui-ground hover:text-ui-ink'}`}
        >
          <ThumbsUp aria-hidden="true" className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(value === false ? null : false)}
          aria-label={`${label}: yomon`}
          aria-pressed={value === false}
          className={`rounded-lg p-2 transition ${value === false ? 'bg-ui-red/10 text-ui-red-ink' : 'text-ui-muted hover:bg-ui-ground hover:text-ui-ink'}`}
        >
          <ThumbsDown aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function FeedbackSection({ jobId, initialRating, initialComment }: FeedbackSectionProps) {
  const [rating, setRating] = useState<number>(initialRating || 0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState<string>(initialComment || '')
  const [voiceOk, setVoiceOk] = useState<OkValue>(null)
  const [translationOk, setTranslationOk] = useState<OkValue>(null)
  const [speedOk, setSpeedOk] = useState<OkValue>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(initialRating))
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) {
      setError("Iltimos, kamida 1 ta yulduzcha tanlang.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await submitFeedback(jobId, rating, comment, { voice_ok: voiceOk, translation_ok: translationOk, speed_ok: speedOk })
      setSubmitted(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Fikr yuborishda xatolik yuz berdi. Qayta urinib ko'ring.")
    } finally {
      setSubmitting(false)
    }
  }

  const activeStars = hoverRating || rating

  return (
    <div className="ui-card space-y-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-lg font-semibold text-ui-ink">Dublyaj sifatini baholang</h3>
            <p className="text-sm text-ui-muted">Fikringiz tarjima va ovozni yaxshilashga yordam beradi</p>
          </div>
        </div>
        {submitted && (
          <span className="flex items-center gap-1 rounded-full bg-ui-green/10 px-2.5 py-1 text-xs font-medium text-ui-green-ink">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Fikr qabul qilindi
          </span>
        )}
      </div>

      {submitted ? (
        <div className="text-center py-4 space-y-3">
          <div className="flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                aria-hidden="true"
                className={`h-6 w-6 ${star <= rating ? 'fill-amber-400 text-amber-500' : 'text-ui-rule'}`}
              />
            ))}
          </div>
          {comment && (
            <p className="mx-auto max-w-lg rounded-control bg-ui-ground p-3 text-sm text-ui-muted">
              "{comment}"
            </p>
          )}
          <p role="status" className="text-sm font-medium text-ui-green-ink">
            Katta rahmat! Fikringiz qabul qilindi.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Star Interactive Rating */}
          <div className="flex flex-col items-center justify-center space-y-2 py-2">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => {
                    setRating(star)
                    setError(null)
                  }}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  aria-label={`${star} yulduz`}
                  aria-pressed={rating === star}
                  className="rounded-lg p-1 transition-transform duration-150 hover:scale-110"
                >
                  <Star
                    aria-hidden="true"
                    className={`h-7 w-7 transition-colors duration-150 ${star <= activeStars ? 'fill-amber-400 text-amber-500' : 'text-ui-muted/50'}`}
                  />
                </button>
              ))}
            </div>
            <p className="h-5 text-sm text-ui-muted" aria-live="polite">
              {activeStars === 1 && "Yomon"}
              {activeStars === 2 && "Qoniqarsiz"}
              {activeStars === 3 && "Yaxshi"}
              {activeStars === 4 && "Juda yaxshi"}
              {activeStars === 5 && "Ajoyib"}
            </p>
          </div>

          {/* Structured questions */}
          <div className="space-y-2">
            <ThumbsQuestion label="Ovoz sifati" value={voiceOk} onChange={setVoiceOk} />
            <ThumbsQuestion label="Tarjima sifati" value={translationOk} onChange={setTranslationOk} />
            <ThumbsQuestion label="Tezlik (sinxronlik)" value={speedOk} onChange={setSpeedOk} />
          </div>

          {/* Comment Textarea */}
          <div className="space-y-1.5">
            <label htmlFor="job-feedback-comment" className="ui-label">
              Izoh <span className="font-normal text-ui-muted">(ixtiyoriy)</span>
            </label>
            <textarea
              id="job-feedback-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ovoz sifati, tarjima yoki boshqa fikrlaringizni yozing..."
              rows={2}
              className="ui-input w-full resize-none px-3 py-2.5 text-base placeholder:text-ui-muted focus:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-control border border-ui-red/30 bg-ui-red/[0.05] px-3 py-2 text-sm font-medium text-ui-red-ink">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || rating === 0}
            className="ui-btn ui-btn-primary w-full"
          >
            {submitting ? (
              <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send aria-hidden="true" className="w-4 h-4" />
                Fikr va bahoni yuborish
              </>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
