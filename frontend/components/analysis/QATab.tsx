"use client";

import { Loader2, Send } from "lucide-react";
import { QAEntry } from "@/lib/api";
import { formatTs } from "@/lib/timestamp";

// frontend/app/video-analysis/[id]/page.tsx VA frontend/app/learn/[id]/page.tsx
// ikkalasi ham shu komponentni ishlatadi -- savol-javob (AI Ustoz) tabining
// markup/xatti-harakati bitta joyda. Placeholder matni ixtiyoriy -- eski
// sahifa "Video haqida savol bering...", yangi Learning Workspace "AI
// Ustoz"ga mos matn berishi mumkin.

interface QATabProps {
  history: QAEntry[];
  question: string;
  asking: boolean;
  onQuestionChange: (value: string) => void;
  onAsk: (e: React.FormEvent) => void;
  onSeek: (seconds: number) => void;
  placeholder?: string;
  emptyText?: string;
}

export default function QATab({
  history,
  question,
  asking,
  onQuestionChange,
  onAsk,
  onSeek,
  placeholder = "Video haqida savol bering...",
  emptyText = "Video haqida savol bering.",
}: QATabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {history.map((qa, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-sm font-bold text-white">{qa.question}</p>
            <p className="text-sm text-gray-300">{qa.answer}</p>
            {qa.timestamps?.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {qa.timestamps.map((ts, ti) => (
                  <button
                    key={ti}
                    onClick={() => onSeek(ts)}
                    className="text-[11px] font-mono text-blue-400 bg-blue-500/10 rounded px-1.5 py-0.5"
                  >
                    {formatTs(ts)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {history.length === 0 && <p className="text-sm text-gray-500">{emptyText}</p>}
      </div>
      <form onSubmit={onAsk} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition disabled:opacity-50"
        >
          {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
