"use client";

import { useState } from "react";
import { FileVideo, Youtube } from "lucide-react";
import SubtitleUrlForm from "@/components/SubtitleUrlForm";
import SubtitleFileForm from "@/components/SubtitleFileForm";
import type { SubtitleSourceLanguage } from "@/lib/api";

/** "Subtitr" tabi (2026-09-20): manba tanlovi -- YouTube havolasi YOKI qurilmadagi
 * video fayl. Ikkala forma ham o'zicha mustaqil va bir xil natija sahifasiga
 * (/subtitles/[id]) olib boradi. */
export default function SubtitleForm() {
  const [source, setSource] = useState<"url" | "file">("url");
  const [lang, setLang] = useState<SubtitleSourceLanguage>("auto");

  const tab = (id: "url" | "file", label: string, Icon: typeof Youtube) => (
    <button
      type="button"
      onClick={() => setSource(id)}
      aria-pressed={source === id}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all ${
        source === id
          ? "bg-white dark:bg-white/10 text-blue-600 dark:text-blue-400 shadow-sm"
          : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5">
        {tab("url", "YouTube havolasi", Youtube)}
        {tab("file", "Video fayl", FileVideo)}
      </div>
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">Video tili</span>
        <div className="flex flex-col sm:flex-row gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5" role="group" aria-label="Video tili">
          {([
            ["auto", "Boshqa til (Ingliz, Rus, Turk...) → O'zbekcha tarjima"],
            ["uz", "Video o'zbek tilida (faqat matnga aylantirish)"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLang(id)}
              aria-pressed={lang === id}
              className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold text-center leading-snug transition-all ${
                lang === id
                  ? "bg-white dark:bg-white/10 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-gray-600 ml-1">
          {lang === "uz"
            ? "Videodagi o'zbekcha nutq to'g'ridan-to'g'ri o'zbekcha subtitrga aylantiriladi (tarjimasiz)."
            : "Chet tildagi (ingliz, rus, turk va b.) nutq avtomatik aniqlanib, o'zbekchaga tarjima qilinadi."}
        </p>
      </div>
      {source === "url" ? <SubtitleUrlForm sourceLanguage={lang} /> : <SubtitleFileForm sourceLanguage={lang} />}
    </div>
  );
}
