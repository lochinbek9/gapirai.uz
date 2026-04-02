"use client";

import { Download, Play } from "lucide-react";
import { Job, getDownloadUrl, formatDuration } from "@/lib/api";

interface Props {
  job: Job;
}

export default function VideoPlayer({ job }: Props) {
  const videoUrl = `http://localhost:8000${job.output_video_url}`;
  const downloadUrl = getDownloadUrl(job.job_id);

  return (
    <div className="space-y-4">
      {/* Video player */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video
          src={videoUrl}
          controls
          className="w-full h-full"
          poster=""
        >
          Brauzeringiz video formatini qo'llab-quvvatlamaydi.
        </video>
      </div>

      {/* Video ma'lumotlari */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-800 text-lg leading-tight">
              {job.video_title || "Nomsiz video"}
            </h3>
            {job.video_duration && (
              <p className="text-sm text-gray-500 mt-1">
                Davomiyligi: {formatDuration(job.video_duration)}
              </p>
            )}
          </div>

          {/* Yuklab olish tugmasi */}
          <a
            href={downloadUrl}
            download
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
          >
            <Download size={16} />
            Yuklab olish
          </a>
        </div>
      </div>

      {/* Tarjima matni (accordion) */}
      {job.translated_text && (
        <details className="border rounded-lg overflow-hidden">
          <summary className="px-4 py-3 bg-gray-50 cursor-pointer font-medium text-gray-700 hover:bg-gray-100">
            O'zbekcha tarjima matnini ko'rish
          </summary>
          <div className="px-4 py-3 text-sm text-gray-600 leading-relaxed max-h-48 overflow-y-auto">
            {job.translated_text}
          </div>
        </details>
      )}
    </div>
  );
}
