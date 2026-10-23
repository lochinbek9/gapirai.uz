"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, Send, CheckCircle2 } from "lucide-react";
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
    <section id="fikr" data-feedback-section aria-labelledby="feedback-title" className="w-full max-w-xl mx-auto mt-10 mb-8 px-3">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-b from-white/10 via-white/5 to-transparent dark:from-white/[0.07] dark:via-white/[0.03] dark:to-transparent border border-black/5 dark:border-white/10 p-5 sm:p-7 backdrop-blur-xl shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
              <MessageSquarePlus aria-hidden="true" className="w-4 h-4" />
            </div>
            <div>
              <h2 id="feedback-title" className="text-base font-black text-slate-900 dark:text-white">
                Fikr va takliflaringiz bormi?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-gray-400">
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
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 aria-hidden="true" className="w-6 h-6" />
              </div>
              <p role="status" className="text-base font-bold text-slate-900 dark:text-white">
                Katta rahmat! Fikringiz qabul qilindi.
              </p>
              <p className="text-xs text-slate-600 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
                Taklifingiz muvaffaqiyatli qabul qilindi va platformani yanada rivojlantirishda albatta inobatga olinadi.
              </p>
              <div className="pt-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setSuccess(false)}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500"
                >
                  Yana fikr bildirish
                </button>
              </div>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
              {/* Reyting (Yulduzchalar) */}
              <div className="flex flex-wrap items-center justify-between gap-2 py-1 px-1">
                <span id="feedback-rating-label" className="text-sm font-semibold text-slate-700 dark:text-gray-300">
                  Platforma qanchalik ma&apos;qul keldi?
                </span>
                <StarRating value={rating} onChange={setRating} label="Platformaga baho" />
              </div>

              {/* Fikr / Izoh matni */}
              <div>
                <label htmlFor="feedback-comment" className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1 px-1">Fikringiz</label>
                <textarea
                  id="feedback-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Taklif, muammo yoki qanday imkoniyat qo'shilishini xohlaysiz?"
                  rows={3}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "feedback-error" : undefined}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-slate-300 dark:border-white/15 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition resize-none"
                  required
                />
              </div>

              {/* Ism va Aloqa ma'lumotlari (ixtiyoriy) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="feedback-name" className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1 px-1">Ismingiz <span className="font-normal text-slate-600 dark:text-gray-400">(ixtiyoriy)</span></label>
                  <input
                    id="feedback-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-slate-300 dark:border-white/15 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition"
                  />
                </div>
                <div>
                  <label htmlFor="feedback-contact" className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1 px-1">Telegram yoki telefon <span className="font-normal text-slate-600 dark:text-gray-400">(ixtiyoriy)</span></label>
                  <input
                    id="feedback-contact"
                    type="text"
                    autoComplete="tel"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="@username yoki telefon"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-slate-300 dark:border-white/15 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition"
                  />
                </div>
              </div>

              {error && (
                <p id="feedback-error" role="alert" className="text-sm text-red-700 dark:text-red-400 font-medium px-1">
                  {error}
                </p>
              )}

              {/* Yuborish tugmasi */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-600 dark:text-gray-400">
                  Fikringiz biz uchun juda qadrli
                </span>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition shadow-md shadow-violet-600/20 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500"
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
