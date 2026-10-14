"use client";

import React, { useState, useEffect } from "react";
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
  estimatedTime = "~15-20 soniya",
  onGenerate,
}: GenerationCardProps) {
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!loading) {
      setProgress(0);
      setStepIndex(0);
      setElapsedSeconds(0);
      return;
    }

    // Timer for elapsed seconds
    const secondTimer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    // Progress bar simulation (slows down as it nears 95%)
    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev < 30) return prev + 3;
        if (prev < 65) return prev + 2;
        if (prev < 85) return prev + 1;
        if (prev < 96) return prev + 0.4;
        return prev;
      });
    }, 400);

    // Steps rotation
    const stepTimer = setInterval(() => {
      setStepIndex((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
    }, 4500);

    return () => {
      clearInterval(secondTimer);
      clearInterval(progressTimer);
      clearInterval(stepTimer);
    };
  }, [loading, loadingSteps.length]);

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
              <span className="text-gray-400 font-bold">{Math.round(progress)}%</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden border border-white/10 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 rounded-full transition-all duration-300 shadow-sm shadow-blue-500/50"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                <span>{loadingSteps[stepIndex]}</span>
              </span>
              <span>Kutilayotgan vaqt: {estimatedTime}</span>
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
                <span className="text-[11px] text-gray-500 flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" /> {estimatedTime}
                </span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">{title}</h3>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">{description}</p>

        {/* Feature bullets */}
        {features.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {features.map((feat, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-gray-300"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            onClick={onGenerate}
            className="group relative inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold shadow-lg shadow-blue-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sparkles className="w-4 h-4 transition-transform group-hover:rotate-12" />
            <span>{buttonText}</span>
          </button>
          <span className="text-xs text-gray-500">
            Bir marta yaratiladi va profilingizda saqlanib qoladi
          </span>
        </div>
      </div>
    </div>
  );
}
