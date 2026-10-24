"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, Loader2, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Ha, bekor qilish",
  cancelText = "Ortga",
  variant = "danger",
  danger,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const effectiveVariant = danger ? "danger" : variant;
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      } else if (e.key === "Enter" && !loading) {
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose, onConfirm]);

  if (!isOpen) return null;

  const isDanger = effectiveVariant === "danger";
  const isWarning = effectiveVariant === "warning";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/75 overflow-y-auto">
        {/* Backdrop click */}
        <div
          className="fixed inset-0"
          onClick={() => {
            if (!loading) onClose();
          }}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
          className="relative w-full max-w-md bg-ui-surface rounded-2xl sm:rounded-2xl p-6 sm:p-7 shadow-2xl border border-ui-rule z-10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-ui-ground hover:bg-slate-200 dark:hover:bg-white/10 text-ui-muted transition disabled:opacity-50"
            aria-label="Yopish"
          >
            <X size={15} />
          </button>

          <div className="flex flex-col items-center text-center space-y-4">
            {/* Animated Icon Badge */}
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg ${
                isDanger
                  ? "bg-rose-500/10 border-rose-500/25 text-rose-500 "
                  : isWarning
                  ? "bg-amber-500/10 border-amber-500/25 text-amber-500 "
                  : "bg-blue-500/10 border-blue-500/25 text-ui-accent-ink "
              }`}
            >
              {isDanger || isWarning ? (
                <AlertTriangle className="w-7 h-7" />
              ) : (
                <Info className="w-7 h-7" />
              )}
            </div>

            {/* Title & Message */}
            <div className="space-y-1.5 px-2">
              <h3 className="text-base sm:text-lg font-semibold text-ui-ink leading-snug">
                {title}
              </h3>
              <p className="text-xs sm:text-sm text-ui-muted leading-relaxed font-normal">
                {message}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold text-ui-ink bg-ui-ground hover:bg-slate-200 dark:hover:bg-white/15 transition border border-transparent dark:border-white/5 disabled:opacity-50"
              >
                {cancelText}
              </button>

              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={`w-full sm:flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 shadow-md transition active:scale-95 disabled:opacity-50 ${
                  isDanger
                    ? " bg-rose-600 hover:bg-rose-500 "
                    : isWarning
                    ? " bg-amber-600 hover:bg-amber-500 "
                    : " bg-blue-600 hover:bg-blue-500 "
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Kutilmoqda...</span>
                  </>
                ) : (
                  <span>{confirmText}</span>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
