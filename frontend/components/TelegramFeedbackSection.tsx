"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, CheckCircle2 } from "lucide-react";
import StarRating from "@/components/ui/StarRating";
import { sendTelegramFeedback } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export default function TelegramFeedbackSection() {
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [name, setName] = useState(user?.name || "");
  const [contact, setContact] = useState((user as any)?.phone || user?.email || "");
  const [rating, setRating] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || comment.trim().length < 3) {
      setError("Iltimos, fikringiz yoki taklifingizni yozing.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await sendTelegramFeedback({
        comment: comment.trim(),
        name: name.trim() || undefined,
        contact: contact.trim() || undefined,
        rating,
        page_url: typeof window !== "undefined" ? window.location.href : undefined,
      });

      setSuccess(true);
      setComment("");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Fikr yuborishda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="fikr" data-feedback-section aria-labelledby="feedback-title" className="w-full">
      <div className="rounded-[6px] border-2 border-metro-rule bg-metro-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 id="feedback-title" className="font-sign text-2xl font-extrabold uppercase text-metro-ink">
                Fikr va takliflaringiz bormi?
              </h2>
              <p className="text-base text-metro-muted">
                GapirAI.uz ni yanada yaxshilashimiz uchun fikringizni bildiring!
              </p>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-6 text-center space-y-3"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-metro-ink text-metro-ground">
                <CheckCircle2 aria-hidden="true" className="w-6 h-6" />
              </div>
              <p role="status" className="text-lg font-bold text-metro-ink">
                Katta rahmat! Fikringiz qabul qilindi.
              </p>
              <p className="mx-auto max-w-sm text-base leading-relaxed text-metro-muted">
                Taklifingiz muvaffaqiyatli qabul qilindi va platformani yanada rivojlantirishda albatta inobatga olinadi.
              </p>
              <div className="pt-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setSuccess(false)}
                  className="m-btn m-btn-ghost"
                >
                  Yana fikr bildirish
                </button>
              </div>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
              {/* Reyting (Yulduzchalar) */}
              <div className="flex flex-wrap items-center justify-between gap-2 py-1 px-1">
                <span id="feedback-rating-label" className="text-base font-semibold text-metro-ink">
                  Platforma qanchalik ma&apos;qul keldi?
                </span>
                <StarRating value={rating} onChange={setRating} label="Platformaga baho" />
              </div>

              {/* Fikr / Izoh matni */}
              <div>
                <label htmlFor="feedback-comment" className="m-label mb-1.5 block">Fikringiz</label>
                <textarea
                  id="feedback-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Taklif, muammo yoki qanday imkoniyat qo'shilishini xohlaysiz?"
                  rows={3}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "feedback-error" : undefined}
                  className="m-input w-full px-3 py-2.5 text-base placeholder:text-metro-muted focus:outline-none resize-none"
                  required
                />
              </div>

              {/* Ism va Aloqa ma'lumotlari (ixtiyoriy) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="feedback-name" className="m-label mb-1.5 block">Ismingiz <span className="normal-case tracking-normal font-normal">(ixtiyoriy)</span></label>
                  <input
                    id="feedback-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="m-input w-full px-3 py-2.5 text-base placeholder:text-metro-muted focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="feedback-contact" className="m-label mb-1.5 block">Telegram yoki telefon <span className="normal-case tracking-normal font-normal">(ixtiyoriy)</span></label>
                  <input
                    id="feedback-contact"
                    type="text"
                    autoComplete="tel"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="@username yoki telefon"
                    className="m-input w-full px-3 py-2.5 text-base placeholder:text-metro-muted focus:outline-none"
                  />
                </div>
              </div>

              {error && (
                <p id="feedback-error" role="alert" className="text-base font-semibold text-metro-red-ink">
                  {error}
                </p>
              )}

              {/* Yuborish tugmasi */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm text-metro-muted">
                  Fikringiz biz uchun juda qadrli
                </span>

                <button
                  type="submit"
                  disabled={loading}
                  className="m-btn"
                >
                  {loading ? (
                    <span aria-hidden="true" className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send aria-hidden="true" className="w-3.5 h-3.5" />
                  )}
                  Yuborish
                </button>
              </div>
            </form>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
