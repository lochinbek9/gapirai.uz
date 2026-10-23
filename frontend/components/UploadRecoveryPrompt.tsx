"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2, X, RotateCcw, FileVideo } from "lucide-react";
import {
  uploadVideoFallback,
  UPLOAD_ALLOWED_CONTENT_TYPES,
  UPLOAD_ALLOWED_EXTENSIONS,
  UPLOAD_MAX_SIZE_BYTES,
} from "@/lib/api";

// frontend/app/video/[id]/page.tsx VA frontend/app/learn/[id]/page.tsx
// ikkalasi ham shu komponentni ishlatadi -- YouTube DOWNLOAD bosqichida
// muvaffaqiyatsiz bo'lgan job uchun "videoni qurilmangizdan yuklang"
// tiklash oqimi (backend/api/routes.py: POST /jobs/{id}/upload-video,
// mavjud, o'zgartirilmagan pipeline'ga ulanadi). Muvaffaqiyatli yuklashdan
// keyin hech narsa qilish shart emas -- useJobPolling job statusi
// pending/downloading'ga o'tganini avtomatik payqaydi va bu blok
// job.status !== 'failed' bo'lgani uchun ota komponent tomonidan
// o'zi yashiriladi.

interface UploadRecoveryPromptProps {
  jobId: string;
  onUploaded?: () => void;
}

type UploadState = "idle" | "uploading" | "error" | "success";

function formatMaxSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
}

function validateFile(file: File): string | null {
  if (!UPLOAD_ALLOWED_CONTENT_TYPES.includes(file.type)) {
    return "Faqat MP4, MOV, MKV yoki WebM formatlar qabul qilinadi.";
  }
  if (file.size > UPLOAD_MAX_SIZE_BYTES) {
    return `Fayl hajmi ${formatMaxSize(UPLOAD_MAX_SIZE_BYTES)} dan katta bo'lmasligi kerak.`;
  }
  return null;
}

export default function UploadRecoveryPrompt({ jobId, onUploaded }: UploadRecoveryPromptProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setPendingFile(null);
      setError(validationError);
      setState("error");
      return;
    }
    setPendingFile(file);
    setError(null);
    setState("uploading");
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await uploadVideoFallback(jobId, file, setProgress, controller.signal);
      setState("success");
      onUploaded?.();
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
        setState("idle");
        setPendingFile(null);
        return;
      }
      setError(err?.response?.data?.detail || "Yuklashda xatolik yuz berdi — internet aloqasini tekshirib qayta urinib ko'ring.");
      setState("error");
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleRetry = () => {
    if (pendingFile) {
      startUpload(pendingFile);
    } else {
      setState("idle");
      setError(null);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    const file = files?.[0];
    if (file) startUpload(file);
  };

  if (state === "success") {
    return (
      <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Video qabul qilindi — ishlov berish boshlandi.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {state === "uploading" ? (
        <div className="glass-card rounded-2xl p-4 space-y-3 border border-gray-200/60 dark:border-white/10">
          <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin text-violet-500 shrink-0" />
            <span className="truncate flex-1 font-medium">{pendingFile?.name}</span>
            <span className="font-mono text-gray-500 dark:text-gray-400 font-bold">{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 mx-auto text-xs font-semibold text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition"
          >
            <X aria-hidden="true" className="w-3.5 h-3.5" /> Bekor qilish
          </button>
        </div>
      ) : (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFileSelect(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Video faylni yuklash uchun bosing yoki shu yerga tashlang"
            className={`cursor-pointer flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-6 transition ${
              dragActive ? "border-violet-500 bg-violet-500/10" : "border-gray-300 dark:border-white/15 bg-black/[0.02] dark:bg-white/5 hover:bg-black/[0.04] dark:hover:bg-white/10"
            }`}
          >
            <UploadCloud aria-hidden="true" className="w-7 h-7 text-violet-600 dark:text-violet-400" />
            <p className="text-sm font-bold text-gray-900 dark:text-white">📁 Videoni yuklash</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
              MP4, MOV, MKV yoki WebM &middot; {formatMaxSize(UPLOAD_MAX_SIZE_BYTES)} gacha
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={UPLOAD_ALLOWED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </div>

          {state === "error" && error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3.5 flex items-start gap-2.5">
              <FileVideo aria-hidden="true" className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
                {pendingFile && (
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-300 hover:underline transition"
                  >
                    <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" /> Qayta urinish
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
