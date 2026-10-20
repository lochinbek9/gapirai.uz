"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Sparkles, Loader2, Clock, CheckCircle2 } from "lucide-react";

interface GenerationCardProps {
  badge: string;
  title: string;
  description: string;
  buttonText: string;
  icon: React.ReactNode;
  features: string[];
  loading: boolean;
  loadingSteps: string[];
  estimatedTime?: string;
  onGenerate: () => void;
  startTime?: number | null;
  videoDuration?: number;
}

// Video davomiyligiga qarab real kutilayotgan vaqtni (sekundlarda) aniqlash
function getTargetSec(videoDuration?: number): number {
  if (!videoDuration || videoDuration <= 180) return 22; // <= 3 min video
  if (videoDuration <= 600) return 38; // <= 10 min video
  if (videoDuration <= 1800) return 60; // <= 30 min video
  if (videoDuration <= 3600) return 90; // <= 1 soat video
  return 130; // > 1 soat ulkan video
}

// O'zbek tilidagi tushunarli kutilayotgan vaqt matni
function getEstimatedTimeString(videoDuration?: number): string {
  if (!videoDuration || videoDuration <= 180) return "~15-25 soniya";
  if (videoDuration <= 600) return "~30-45 soniya";
  if (videoDuration <= 1800) return "~50-70 soniya";
  if (videoDuration <= 3600) return "~1 - 1.5 daqiqa (katta video)";
  return "~1.5 - 2.5 daqiqa (ulkan video)";
}

export default function GenerationCard({
  badge,
  title,
  description,
  buttonText,
  icon,
  features,
  loading,
  loadingSteps,
  estimatedTime,
  onGenerate,
  startTime,
  videoDuration,
}: GenerationCardProps) {
  // Real kutilayotgan vaqt video hajmiga bog'liq
  const targetSec = useMemo(() => getTargetSec(videoDuration), [videoDuration]);

  const displayEstimatedTime = useMemo(() => {
    if (estimatedTime && estimatedTime !== "~15-20 soniya") return estimatedTime;
    return getEstimatedTimeString(videoDuration);
  }, [estimatedTime, videoDuration]);

  // Tablar o'rtasida o'tib qaytganda sekundomer noldan boshlanmasligi uchun
  // ota komponentdan kelgan startTime asosida hisoblanadi
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (startTime) {
      return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    }
    return 0;
  });

  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const origin = startTime || now;
      const elapsed = Math.max(0, Math.floor((now - origin) / 1000));
      setElapsedSeconds(elapsed);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [loading, startTime]);

  // Progress: Video hajmiga proporsional asimptotik egri chiziq
  // Ulkan videolarda 30 soniyada 96% ga chiqib qotib qolmasligi uchun
  // real elapsed va targetSec ga asoslanadi va 93-94% dan oshmaydi
  const progress = useMemo(() => {
    if (!loading) return 0;
    const ratio = elapsedSeconds / Math.max(15, targetSec);
    // Easing: ratio 1.0 ga borganda ~70%, keyin sekinlashadi
    const val = Math.min(94, Math.round((1 - Math.exp(-ratio * 1.35)) * 92) + (ratio > 1 ? Math.min(3, Math.floor(ratio)) : 0));
    return Math.max(4, val);
  }, [loading, elapsedSeconds, targetSec]);

  // Step index progressga qarab mantiqiy almashadi
  const stepIndex = useMemo(() => {
    if (!loadingSteps.length) return 0;
    const idx = Math.min(loadingSteps.length - 1, Math.floor((progress / 95) * loadingSteps.length));
    return idx;
  }, [loadingSteps.length, progress]);

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-950/30 via-white/[0.02] to-transparent p-6 md:p-8 backdrop-blur-md">
        {/* Glow backdrop */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <span>{title}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Jarayonda
                  </span>
                </h4>
                <p className="text-xs text-blue-300/80 mt-0.5">
                  {loadingSteps[stepIndex] || "Tayyorlanmoqda..."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg w-fit">
              <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span>{elapsedSeconds}s o'tdi</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-300 font-bold">{progress}%</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden border border-white/10 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 rounded-full transition-all duration-500 shadow-sm shadow-blue-500/50"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                <span>{loadingSteps[stepIndex]}</span>
              </span>
              <span>Kutilayotgan vaqt: {displayEstimatedTime}</span>
            </div>
          </div>

          {/* Shimmer skeleton */}
          <div className="space-y-2.5 pt-2 animate-pulse opacity-70">
            <div className="h-4 bg-white/10 rounded-md w-3/4" />
            <div className="h-3.5 bg-white/5 rounded-md w-full" />
            <div className="h-3.5 bg-white/5 rounded-md w-5/6" />
            <div className="h-3.5 bg-white/5 rounded-md w-4/6" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] via-white/[0.02] to-transparent p-6 md:p-8 backdrop-blur-md">
      {/* Decorative gradient corner */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full pointer-events-none" />

      <div className="relative z-10 space-y-6">
        {/* Header with Icon and Badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  {badge}
                </span>
                <span className="text-[11px] font-mono text-gray-400">
                  {displayEstimatedTime}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white">{title}</h3>
            </div>
          </div>

          <button
            onClick={onGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>{buttonText}</span>
          </button>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">
          {description}
        </p>

        {/* Feature bullets */}
        {features && features.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/5">
            {features.map((feat, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
