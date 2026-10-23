"use client";

import { useState } from "react";
import { FileVideo, Youtube } from "lucide-react";
import TabList, { tabPanelProps } from "@/components/ui/TabList";
import SubtitleUrlForm from "@/components/SubtitleUrlForm";
import SubtitleFileForm from "@/components/SubtitleFileForm";
import type { SubtitleSourceLanguage } from "@/lib/api";

/** "Subtitr" tabi (2026-09-20): manba tanlovi -- YouTube havolasi YOKI qurilmadagi
 * video fayl. Ikkala forma ham o'zicha mustaqil va bir xil natija sahifasiga
 * (/subtitles/[id]) olib boradi. */
export default function SubtitleForm() {
  const [source, setSource] = useState<"url" | "file">("url");
  const [lang, setLang] = useState<SubtitleSourceLanguage>("auto");


  return (
    <div className="space-y-5">
      <TabList
        idBase="sub-source"
        label="Video manbasi"
        value={source}
        onChange={setSource}
        items={[
          { id: "url", label: "YouTube havolasi", icon: Youtube },
          { id: "file", label: "Video fayl", icon: FileVideo },
        ]}
        className="flex gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5"
        tabClassName={(active) =>
          `flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
            active
              ? "bg-white dark:bg-white/10 text-blue-700 dark:text-blue-300 shadow-sm"
              : "text-slate-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          }`}
      />
      <div className="space-y-1.5">
        <span id="sub-lang-label" className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide ml-1">Video tili</span>
        <div className="flex flex-col sm:flex-row gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5" role="group" aria-labelledby="sub-lang-label">
          {([
            ["auto", "Boshqa til (Ingliz, Rus, Turk...) → O'zbekcha tarjima"],
            ["uz", "Video o'zbek tilida (faqat matnga aylantirish)"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLang(id)}
              aria-pressed={lang === id}
              className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold text-center leading-snug transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                lang === id
                  ? "bg-white dark:bg-white/10 text-blue-700 dark:text-blue-300 shadow-sm"
                  : "text-slate-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 ml-1">
          {lang === "uz"
            ? "Videodagi o'zbekcha nutq to'g'ridan-to'g'ri o'zbekcha subtitrga aylantiriladi (tarjimasiz)."
            : "Chet tildagi (ingliz, rus, turk va b.) nutq avtomatik aniqlanib, o'zbekchaga tarjima qilinadi."}
        </p>
      </div>
      <div {...tabPanelProps("sub-source", source)}>
        {source === "url" ? <SubtitleUrlForm sourceLanguage={lang} /> : <SubtitleFileForm sourceLanguage={lang} />}
      </div>
    </div>
  );
}
