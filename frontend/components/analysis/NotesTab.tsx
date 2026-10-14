"use client";

import React from "react";
import { BookOpen } from "lucide-react";
import MarkdownView from "./MarkdownView";
import GenerationCard from "./GenerationCard";

interface NotesTabProps {
  notes: string | null;
  loading: boolean;
  onGenerate: () => void;
}

export default function NotesTab({ notes, loading, onGenerate }: NotesTabProps) {
  if (notes) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-7 backdrop-blur-sm">
        <MarkdownView content={notes} />
      </div>
    );
  }

  return (
    <GenerationCard
      badge="AI Konspekt"
      title="Video konspektini yaratish"
      description="Sun'iy intellekt videoning to'liq transkripti va mavzularini tahlil qilib, asosiy g'oyalar, voqealar ketma-ketligi va xulosalarni tartibli, o'qishga juda qulay konspekt shakliga keltiradi."
      buttonText="Konspekt tuzish"
      icon={<BookOpen className="w-6 h-6" />}
      features={[
        "Mavzular va bo'limlar bo'yicha tartiblangan",
        "Asosiy atamalar va formulalar ajratilgan",
        "O'qishga qulay format va xulosalar",
      ]}
      loading={loading}
      loadingSteps={[
        "Video transkripti yuklanmoqda va tahlil qilinmoqda...",
        "Asosiy mavzular va bo'limlar ajratilmoqda...",
        "Tushunchalar va xulosalar shakllantirilmoqda...",
        "Yakuniy konspekt formatlanib tayyorlanmoqda...",
      ]}
      estimatedTime="~15-20 soniya"
      onGenerate={onGenerate}
    />
  );
}
