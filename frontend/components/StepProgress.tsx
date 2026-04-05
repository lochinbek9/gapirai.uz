"use client";

import { Check, Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Job } from "@/lib/api";

const STEPS = [
  { key: "downloading",  icon: "⬇", label: "Yuklab olish" },
  { key: "transcribing", icon: "🎙", label: "Transkripsiya" },
  { key: "translating",  icon: "🌐", label: "Tarjima" },
  { key: "synthesizing", icon: "🔊", label: "Ovoz berish" },
  { key: "merging",      icon: "🎬", label: "Birlashtirish" },
] as const;

function getCurrentStep(status: Job["status"]): number {
  return STEPS.findIndex((s) => s.key === status);
}

interface Props {
  job: Job;
  elapsed: number;
}

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m ? `${m}daq ` : ""}${s}son`;
}

export default function StepProgress({ job, elapsed }: Props) {
  const current = getCurrentStep(job.status);
  const isFailed = job.status === "failed";

  return (
    <div className="space-y-8 py-2">
      {/* ── Progress Circle Visual ─────────────────── */}
      <div className="relative flex justify-between px-2">
        {STEPS.map((step, i) => {
          const isCompleted = current > i;
          const isActive = current === i && !isFailed;
          const isPending = current < i;

          return (
            <div key={step.key} className="flex flex-col items-center gap-3 relative z-10 flex-1">
              <motion.div
                initial={false}
                animate={{
                  scale: isActive ? 1.1 : 1,
                  backgroundColor: isCompleted ? "rgb(34, 197, 94)" : isActive ? "rgb(59, 130, 246)" : "rgba(100, 116, 139, 0.05)",
                  borderColor: isActive ? "rgba(59, 130, 246, 0.5)" : "rgba(100, 116, 139, 0.1)",
                }}
                className={`
                  w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-500
                  ${isCompleted ? "shadow-lg shadow-green-500/20" : isActive ? "shadow-xl shadow-blue-500/30" : ""}
                `}
              >
                <AnimatePresence mode="wait">
                  {isCompleted ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0 }}
                    >
                      <Check className="w-5 h-5 text-white" strokeWidth={3} />
                    </motion.div>
                  ) : isActive ? (
                    <motion.div
                      key="active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="relative"
                    >
                       <span className="text-lg">{step.icon}</span>
                       <div className="absolute -inset-0 rounded-full border-2 border-white/20 border-t-white dark:border-white/20 animate-spin"></div>
                    </motion.div>
                  ) : (
                    <motion.span key="icon" className="text-gray-400 dark:text-gray-700 opacity-60 grayscale transition-colors">{step.icon}</motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
              
              <div className="text-center">
                 <p className={`text-[9px] font-bold uppercase tracking-tighter transition-colors duration-300
                    ${isCompleted ? "text-green-500" : isActive ? "text-blue-500" : "text-gray-400 dark:text-gray-700"}`}>
                   {step.label}
                 </p>
              </div>
            </div>
          );
        })}

        {/* Connector Line Background */}
        <div className="absolute top-5 left-8 right-8 h-[2px] bg-black/5 dark:bg-white/[0.03] -z-0 transition-colors"></div>
        {/* Active Connector Line */}
        <motion.div 
          className="absolute top-5 left-8 h-[2px] bg-gradient-to-r from-green-500 to-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] -z-0"
          initial={{ width: 0 }}
          animate={{ width: `${(current / (STEPS.length - 1)) * 88}%` }}
          transition={{ duration: 1, ease: "easeInOut" }}
        />
      </div>

      {/* ── Main Progress Bar & Status Text ────────── */}
      <div className="space-y-4 pt-4">
        <div className="flex justify-between items-end">
           <div className="space-y-1">
              <div className="flex items-center gap-2">
                 <Sparkles className="w-3 h-3 text-blue-500 animate-pulse" />
                 <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400/80 uppercase tracking-widest transition-colors">{job.status_message}</p>
              </div>
              <div className="flex items-center gap-3">
                 <p className="text-3xl font-black text-gray-900 dark:text-white lining-nums tabular-nums transition-colors">
                   {Math.round(job.progress)}<span className="text-blue-500 text-lg ml-0.5">%</span>
                 </p>
                 <div className="py-1 px-3 rounded-full bg-black/5 dark:bg-white/[0.03] border border-black/5 dark:border-white/[0.05] flex items-center gap-2 transition-colors">
                    <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 animate-pulse transition-colors"></div>
                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 transition-colors">{formatElapsed(elapsed)}</span>
                 </div>
              </div>
           </div>
        </div>

        <div className="relative h-2 w-full bg-black/5 dark:bg-white/[0.03] rounded-full overflow-hidden border border-black/5 dark:border-white/[0.05] p-[1px] transition-colors">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${job.progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5"></div>
            <div className="absolute inset-0 shimmer-anim"></div>
          </motion.div>
        </div>
      </div>

      {isFailed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-center"
        >
          <p className="text-sm font-bold text-red-600 dark:text-red-500 mb-1 transition-colors">Xatolik yuz berdi</p>
          <p className="text-xs text-red-600/60 dark:text-red-400/60 leading-relaxed transition-colors">{job.error_message || "Tizimda kutilmagan xato."}</p>
        </motion.div>
      )}
    </div>
  );
}
