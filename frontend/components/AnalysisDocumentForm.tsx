"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Sparkles, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ANALYSIS_LANGUAGE_OPTIONS,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  createDocumentAnalysis,
  saveAnalysisId,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/** Hujjat tahlili (2026-11-01): PDF/DOCX/TXT/PPTX/EPUB -> xulosa, asosiy fikrlar,
 * boblar, konspekt, test, savol-javob. Matn serverda ajratiladi (skanerlangan PDF
 * -- OCR), bet limiti: bepul 30, pullik 300 (backend/services/document_extract.py). */

const EXTENSIONS = DOCUMENT_ACCEPT.split(",");

function formatSize(bytes: number): string {
  return bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!EXTENSIONS.some((ext) => name.endsWith(ext))) return "Faqat PDF, DOCX, TXT, PPTX yoki EPUB fayllar qabul qilinadi.";
  if (file.size <= 0) return "Fayl bo'sh.";
  if (file.size > DOCUMENT_MAX_BYTES) return `Fayl hajmi 20 MB dan katta bo'lmasligi kerak (sizniki: ${formatSize(file.size)}).`;
  return null;
}

export default function AnalysisDocumentForm() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("uz");
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = (f?: File | null) => {
    if (!f) return;
    const problem = validateFile(f);
    setError(problem);
    setFile(problem ? null : f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const { analysis_id } = await createDocumentAnalysis(file, language, setProgress);
      saveAnalysisId(analysis_id);
      router.push(`/video-analysis/${analysis_id}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Xatolik yuz berdi. Qayta urinib ko'ring.");
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <span className="ui-label block">Hujjat</span>
        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-describedby="doc-formats"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); pick(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed bg-ui-surface px-4 py-8 text-center transition sm:py-10 ${
              dragActive ? "border-ui-ink bg-ui-ground" : "border-ui-rule hover:border-ui-muted"
            }`}
          >
            <UploadCloud aria-hidden="true" className="h-8 w-8 text-ui-muted" />
            <p className="text-[15px] font-medium text-ui-ink">Hujjatni tanlang yoki shu yerga tashlang</p>
            <p id="doc-formats" className="text-sm text-ui-muted">
              PDF, DOCX, TXT, PPTX, EPUB · 20 MB gacha · bepul 30 betgacha
            </p>
          </div>
        ) : (
          <div className="ui-input flex items-center gap-3 px-4 py-3.5">
            <FileText aria-hidden="true" className="h-6 w-6 shrink-0 text-ui-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-ui-ink">{file.name}</p>
              <p className="text-sm text-ui-muted">{formatSize(file.size)}</p>
            </div>
            {!busy && (
              <button
                type="button"
                onClick={() => { setFile(null); setError(null); }}
                aria-label="Faylni olib tashlash"
                className="rounded-lg p-2 text-ui-muted transition hover:bg-ui-red/10 hover:text-ui-red-ink"
              >
                <X aria-hidden="true" size={16} />
              </button>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
        />
        <p className="text-sm text-ui-muted">
          Skanerlangan (rasmdan iborat) PDF ham o&apos;qiladi — bunda tahlil biroz uzoqroq davom etadi.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="doc-analysis-lang" className="ui-label block">
          Tahlil tili
        </label>
        <select
          id="doc-analysis-lang"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="ui-input min-h-12 w-full px-3 text-base focus:outline-none"
        >
          {ANALYSIS_LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>{opt.label}</option>
          ))}
        </select>
        <p className="text-sm text-ui-muted">
          Xulosa, boblar, konspekt va test shu tilda chiqadi; hujjat matni o&apos;zgarmaydi.
        </p>
      </div>

      {!isLoggedIn && (
        <p className="rounded-control border border-amber-600/40 bg-amber-500/10 px-4 py-3 text-base font-semibold text-amber-900 dark:text-amber-200">
          Hujjat tahlili uchun{" "}
          <Link href="/login" className="underline">kiring</Link>
          {" "}yoki{" "}
          <Link href="/register" className="underline">ro&apos;yxatdan o&apos;ting</Link>.
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-control border border-ui-red/30 bg-ui-red/[0.05] px-4 py-3">
          <p className="text-[15px] font-medium text-ui-red-ink">{error}</p>
        </div>
      )}

      <button type="submit" disabled={busy || !file} className="ui-btn ui-btn-primary min-h-12 w-full">
        {busy ? (
          <>
            <Loader2 aria-hidden="true" size={18} className="animate-spin" />
            {progress! < 100 ? `Yuklanmoqda... ${progress}%` : "Hujjat o'qilmoqda..."}
          </>
        ) : (
          <><Sparkles aria-hidden="true" size={18} /> Hujjatni tahlil qilish</>
        )}
      </button>
    </form>
  );
}
