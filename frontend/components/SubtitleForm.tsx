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
          { id: "url", label: <><span className="sm:hidden">Havola</span><span className="hidden sm:inline">YouTube havolasi</span></>, icon: Youtube },
          { id: "file", label: <><span className="sm:hidden">Fayl</span><span className="hidden sm:inline">Video fayl</span></>, icon: FileVideo },
        ]}
        className="inline-flex w-full gap-1 rounded-[6px] bg-metro-ground p-1 sm:w-auto"
        tabClassName={(active) =>
          `flex flex-1 items-center justify-center gap-2 rounded-[4px] px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-blue sm:flex-none ${
            active
              ? "bg-metro-surface text-metro-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
              : "text-metro-muted hover:text-metro-ink"
          }`}
      />
      <div className="space-y-1.5">
        <span id="sub-lang-label" className="m-label block">Video tili</span>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-labelledby="sub-lang-label">
          {([
            ["auto", "Boshqa til (Ingliz, Rus, Turk...) → O'zbekcha tarjima"],
            ["uz", "Video o'zbek tilida (faqat matnga aylantirish)"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLang(id)}
              aria-pressed={lang === id}
              className={`rounded-[6px] border-2 px-3 py-2.5 text-left text-sm font-semibold leading-snug transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-blue ${
                lang === id
                  ? "border-metro-ink bg-metro-ink text-metro-ground"
                  : "border-metro-rule text-metro-ink hover:border-metro-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-metro-muted">
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
