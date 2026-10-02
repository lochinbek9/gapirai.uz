"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, Send, Star, CheckCircle2, MessageCircle } from "lucide-react";
import { sendTelegramFeedback } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export default function TelegramFeedbackSection() {
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [name, setName] = useState(user?.name || "");
  const [contact, setContact] = useState((user as any)?.phone || user?.email || "");
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
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
    <section className="w-full max-w-xl mx-auto mt-10 mb-8 px-3">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-b from-white/10 via-white/5 to-transparent dark:from-white/[0.07] dark:via-white/[0.03] dark:to-transparent border border-black/5 dark:border-white/10 p-5 sm:p-7 backdrop-blur-xl shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Fikr va takliflaringiz bormi?
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-gray-400">
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
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Katta rahmat! Fikringiz qabul qilindi.
              </h4>
              <p className="text-xs text-slate-600 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
                Taklifingiz muvaffaqiyatli qabul qilindi va platformani yanada rivojlantirishda albatta inobatga olinadi.
              </p>
              <div className="pt-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setSuccess(false)}
                  className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition shadow-sm"
                >
                  Yana fikr bildirish
                </button>
              </div>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Reyting (Yulduzchalar) */}
              <div className="flex items-center justify-between gap-2 py-1 px-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-gray-400">
                  Platforma qanchalik ma&apos;qul keldi?
                </span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      className="p-1 text-amber-400 transition hover:scale-125 focus:outline-none"
                    >
                      <Star
                        className={`w-4 h-4 sm:w-5 sm:h-5 ${
                          (hoverRating !== null ? star <= hoverRating : star <= rating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-300 dark:text-gray-600"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Fikr / Izoh matni */}
              <div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Fikringiz, taklifingiz yoki qanday yangi imkoniyatlar qo'shilishini xohlaysiz?..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition resize-none"
                  required
                />
              </div>

              {/* Ism va Aloqa ma'lumotlari (ixtiyoriy) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ismingiz (ixtiyoriy)"
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition"
                />
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Telegram @username yoki telefon"
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition"
                />
              </div>

              {error && (
                <p className="text-[11px] text-red-500 dark:text-red-400 font-medium px-1">
                  {error}
                </p>
              )}

              {/* Yuborish tugmasi */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400 dark:text-gray-500">
                  Fikringiz biz uchun juda qadrli ✨
                </span>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition shadow-md shadow-violet-600/20 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
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
