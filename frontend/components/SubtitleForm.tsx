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
        className="flex gap-5 border-b border-ui-rule"
        tabClassName={(active) =>
          `-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-0.5 text-sm font-medium transition ${
            active ? "border-ui-ink text-ui-ink" : "border-transparent text-ui-muted hover:text-ui-ink"
          }`}
      />
      <div className="space-y-1.5">
        <span id="sub-lang-label" className="ui-label block">Video tili</span>
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
              className={`rounded-control border px-3 py-2.5 text-left text-sm font-medium leading-snug transition ${
                lang === id
                  ? "border-ui-accent bg-ui-accent/[0.06] text-ui-ink shadow-[0_0_0_1px_rgb(var(--ui-accent))]"
                  : "border-ui-rule text-ui-ink hover:border-ui-muted/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-ui-muted">
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
