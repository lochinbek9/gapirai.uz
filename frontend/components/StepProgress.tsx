import { useState, useEffect } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Job } from "@/lib/api";
import { formatTashkentTime } from "@/lib/timestamp";

const STEPS = [
  { key: "downloading",  icon: "⬇", label: "Yuklab olish" },
  { key: "transcribing", icon: "🎙", label: "Transkripsiya" },
  { key: "translating",  icon: "🌐", label: "Tarjima" },
  { key: "syncing",      icon: "🗣", label: "Talaffuz" },
  { key: "synthesizing", icon: "🔊", label: "Ovoz berish" },
  { key: "merging",      icon: "🎬", label: "Birlashtirish" },
] as const;

function getCurrentStep(status: Job["status"]): number {
  return STEPS.findIndex((s) => s.key === status);
}

interface Props {
  job: Job;
  elapsed: number;
  onCancel?: () => void;
  cancelLoading?: boolean;
}

function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return "kam qoldi..."
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) {
    return `${m} daqiqa ${s} soniya`
  }
  return `${s} soniya`
}

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m ? `${m}daq ` : ""}${s}son`;
}

export default function StepProgress({ job, elapsed, onCancel, cancelLoading }: Props) {
  const current = getCurrentStep(job.status);
  const isFailed = job.status === "failed";
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
                  scale: isActive ? 1.15 : 1,
                  backgroundColor: isCompleted ? "rgb(16, 185, 129)" : isActive ? "rgb(59, 130, 246)" : "rgba(255, 255, 255, 0.02)",
                  borderColor: isCompleted ? "rgb(16, 185, 129)" : isActive ? "rgba(59, 130, 246, 0.8)" : "rgba(255, 255, 255, 0.05)",
                }}
                className={`
                  w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-500
                  ${isCompleted ? "shadow-lg shadow-emerald-500/20 text-white" : isActive ? "shadow-xl shadow-blue-500/30 text-white" : "text-gray-500"}
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
                      className="relative flex items-center justify-center w-full h-full"
                    >
                       <span className="text-lg z-10">{step.icon}</span>
                       <div className="absolute inset-0 rounded-2xl ring-2 ring-blue-500/40 bg-blue-500/10 transition-all duration-500"></div>
                    </motion.div>
                  ) : (
                    <motion.span key="icon" className="text-gray-400 dark:text-gray-600 opacity-60 grayscale transition-colors">{step.icon}</motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
              
              <div className="text-center">
                 <p className={`text-[9px] font-bold uppercase tracking-widest transition-colors duration-300
                    ${isCompleted ? "text-emerald-500" : isActive ? "text-blue-500 font-extrabold" : "text-gray-400 dark:text-gray-700"}`}>
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
          className="absolute top-5 left-8 h-[2px] bg-gradient-to-r from-emerald-500 via-blue-500 to-violet-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] -z-0"
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
                 <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                 <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest transition-colors">{job.status_message}</p>
              </div>
              <div className="flex items-center gap-3">
                 {job.status === 'pending' || (job.progress || 0) <= 0 ? (
                   <span className="text-base font-bold text-amber-500 animate-pulse">Navbatda...</span>
                 ) : (
                   <p className="text-4xl font-black text-gray-900 dark:text-white lining-nums tabular-nums transition-colors">
                     {Math.round(job.progress)}<span className="text-blue-500 text-lg ml-0.5">%</span>
                   </p>
                 )}
                 <div className="py-1 px-3 rounded-full bg-black/5 dark:bg-white/[0.03] border border-black/5 dark:border-white/[0.05] flex items-center gap-2 transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse transition-colors"></div>
                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 transition-colors">{formatElapsed(elapsed)}</span>
                 </div>
              </div>
           </div>
        </div>

        <div className="relative h-3.5 w-full bg-black/5 dark:bg-white/[0.03] rounded-full overflow-hidden border border-black/5 dark:border-white/[0.05] p-[1.5px] transition-colors">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-violet-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${job.progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5"></div>
            <div className="absolute inset-0 shimmer-anim"></div>
          </motion.div>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center font-medium">
          Odatda 1–2 daqiqa davom etadi. Tayyor bo&apos;lgach video avtomatik ochiladi.
        </p>
      </div>

      {job.expected_end_time && !isFailed && job.status !== 'pending' && (job.progress || 0) > 0 && (
        <div className="bg-black/5 dark:bg-white/[0.03] border border-black/5 dark:border-white/[0.05] rounded-2xl p-4 text-center text-xs text-gray-500 dark:text-gray-400 space-y-1 transition-colors">
          <p className="font-bold text-gray-700 dark:text-gray-300">Taxminiy yakunlanish vaqti:</p>
          <p className="text-gray-950 dark:text-white font-mono text-base font-black">
            {formatTashkentTime(job.expected_end_time)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
            {Math.ceil((new Date(job.expected_end_time).getTime() - currentTime) / 1000) <= 0
              ? "(tez orada yakunlanadi...)"
              : `(taxminan ${formatRemainingTime(Math.ceil((new Date(job.expected_end_time).getTime() - currentTime) / 1000))} qoldi)`}
          </p>
        </div>
      )}

      {onCancel && !isFailed && (
        <div className="pt-2 text-center">
          <button
            onClick={onCancel}
            disabled={cancelLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-violet-500 hover:text-white bg-violet-500/10 hover:bg-violet-500 rounded-xl transition duration-200 disabled:opacity-50"
          >
            {cancelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Jarayonni bekor qilish
          </button>
        </div>
      )}

      {isFailed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center"
        >
          <p className="text-sm font-bold text-blue-600 dark:text-blue-500 mb-1 transition-colors">Xatolik yuz berdi</p>
          <p className="text-xs text-blue-600/60 dark:text-blue-400/60 leading-relaxed transition-colors">{job.error_message || "Tizimda kutilmagan xato."}</p>
        </motion.div>
      )}
    </div>
  );
}
