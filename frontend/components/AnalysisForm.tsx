"use client";

import { useState } from "react";
import { FileText, Youtube } from "lucide-react";
import TabList, { tabPanelProps } from "@/components/ui/TabList";
import AnalysisUrlForm from "@/components/AnalysisUrlForm";
import AnalysisDocumentForm from "@/components/AnalysisDocumentForm";

/** "Tahlil" tabi (2026-11-01): manba -- YouTube havolasi YOKI hujjat
 * (PDF, DOCX, TXT, PPTX, EPUB). Ikkalasi ham /video-analysis/[id] ga olib boradi. */
export default function AnalysisForm() {
  const [source, setSource] = useState<"url" | "document">("url");

  return (
    <div className="space-y-5">
      <TabList
        idBase="analysis-source"
        label="Tahlil manbasi"
        value={source}
        onChange={setSource}
        items={[
          { id: "url", label: <><span className="sm:hidden">Havola</span><span className="hidden sm:inline">YouTube havolasi</span></>, icon: Youtube },
          { id: "document", label: <><span className="sm:hidden">Hujjat</span><span className="hidden sm:inline">Hujjat (PDF, Word...)</span></>, icon: FileText },
        ]}
        className="flex gap-5 border-b border-ui-rule"
        tabClassName={(active) =>
          `-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-0.5 text-sm font-medium transition ${
            active ? "border-ui-ink text-ui-ink" : "border-transparent text-ui-muted hover:text-ui-ink"
          }`}
      />
      <div {...tabPanelProps("analysis-source", source)}>
        {source === "url" ? <AnalysisUrlForm /> : <AnalysisDocumentForm />}
      </div>
    </div>
  );
}
