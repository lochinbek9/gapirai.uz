"use client";

import { useState } from "react";
import { FileVideo, Youtube } from "lucide-react";
import SubtitleUrlForm from "@/components/SubtitleUrlForm";
import SubtitleFileForm from "@/components/SubtitleFileForm";

/** "Subtitr" tabi (2026-09-20): manba tanlovi -- YouTube havolasi YOKI qurilmadagi
 * video fayl. Ikkala forma ham o'zicha mustaqil va bir xil natija sahifasiga
 * (/subtitles/[id]) olib boradi. */
export default function SubtitleForm() {
  const [source, setSource] = useState<"url" | "file">("url");

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
      {source === "url" ? <SubtitleUrlForm /> : <SubtitleFileForm />}
    </div>
  );
}
