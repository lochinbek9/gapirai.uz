"use client";

import { motion } from "framer-motion";
import { VideoInfo, formatDuration } from "@/lib/api";

export default function VideoPreview({ info }: { info: VideoInfo }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 rounded-control border border-ui-rule bg-ui-ground p-3"
    >
      {info.thumbnail && (
        <img src={info.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-medium leading-snug text-ui-ink">{info.title}</p>
        <p className="mt-1 text-sm text-ui-muted">
          {info.uploader} · <span className="tabular-nums text-ui-ink">{formatDuration(info.duration)}</span>
        </p>
      </div>
    </motion.div>
  );
}
