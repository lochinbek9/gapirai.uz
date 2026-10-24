"use client";

import React, { useRef, useEffect } from "react";
import { Loader2, Send, Bot, User, Play, Sparkles, Copy, Check, MessageSquare } from "lucide-react";
import { QAEntry } from "@/lib/api";
import { formatTs } from "@/lib/timestamp";
import MarkdownView from "./MarkdownView";

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

const SUGGESTED_QUESTIONS = [
  "Ushbu videoning asosiy mavzusi nima?",
  "Videoda qanday muhim xulosalar berilgan?",
  "Eng asosiy darslar va g'oyalarni aytib ber",
];

export default function QATab({
  history,
  question,
  asking,
  onQuestionChange,
  onAsk,
  onSeek,
  placeholder = "Video haqida savol bering...",
  emptyText = "Video bo'yicha istalgan savolingizni bering — AI Ustoz videodagi nutqqa tayanib aniq javob beradi.",
}: QATabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const [pendingQuestion, setPendingQuestion] = React.useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setPendingQuestion(question.trim());
    onAsk(e);
  };

  // Auto-scroll when new items arrive or when asking
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [history.length, asking]);

  const handleCopyAnswer = (answer: string, idx: number) => {
    navigator.clipboard.writeText(answer);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleQuickQuestion = (q: string) => {
    onQuestionChange(q);
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="space-y-4 max-h-[460px] min-h-[180px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10"
      >
        {history.length === 0 && !asking && (
          <div className="py-6 px-4 text-center space-y-4 rounded-2xl border border-ui-rule bg-ui-ground">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-ui-accent-ink flex items-center justify-center mx-auto">
              <Bot className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-ui-ink">AI Ustoz — Savol-javob</h4>
              <p className="text-xs text-ui-muted max-w-md mx-auto leading-relaxed">{emptyText}</p>
            </div>

            {/* Suggested quick questions */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-ui-muted flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3 text-ui-accent-ink" />
                Namuna savollar
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((sq, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleQuickQuestion(sq)}
                    className="text-xs px-3 py-1.5 rounded-xl bg-ui-ground hover:bg-ui-ground border border-ui-rule text-ui-muted hover:text-ui-ink transition text-left"
                  >
                    {sq}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conversation history */}
        {history.map((qa, i) => (
          <div key={i} className="space-y-3">
            {/* User message */}
            <div className="flex justify-end gap-2.5 items-start pl-8">
              <div className=" bg-blue-600/90 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-md max-w-xl">
                <p className="font-medium leading-relaxed">{qa.question}</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 text-ui-accent-ink flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            </div>

            {/* AI Answer message */}
            <div className="flex justify-start gap-2.5 items-start pr-8">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 text-ui-accent-ink flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex-1 bg-ui-ground border border-ui-rule rounded-2xl rounded-tl-sm p-4 space-y-3 shadow-md max-w-2xl">
                <div className="text-sm">
                  <MarkdownView content={qa.answer} showCopy={false} />
                </div>

                {/* Timestamps & Copy buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-ui-rule text-xs">
                  {qa.timestamps && qa.timestamps.length > 0 ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-ui-muted">Video daqiqasi:</span>
                      {qa.timestamps.map((ts, ti) => (
                        <button
                          key={ti}
                          onClick={() => onSeek(ts)}
                          className="inline-flex items-center gap-1 text-xs font-mono text-ui-accent-ink bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-md px-2 py-0.5 transition"
                          title="Videoni shu daqiqasidan qo'yish"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>{formatTs(ts)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div />
                  )}

                  <button
                    onClick={() => handleCopyAnswer(qa.answer, i)}
                    className="inline-flex items-center gap-1 text-xs text-ui-muted hover:text-ui-ink transition ml-auto"
                  >
                    {copiedIndex === i ? (
                      <>
                        <Check className="w-3 h-3 text-ui-green-ink" />
                        <span className="text-ui-green-ink">Nusxalandi</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Nusxa olish</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Optimistic thinking indicator when asking */}
        {asking && (
          <div className="space-y-3 animate-fadeIn">
            {/* Show current question */}
            {(pendingQuestion || question) && (
              <div className="flex justify-end gap-2.5 items-start pl-8 opacity-80">
                <div className=" bg-blue-600/60 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-md max-w-xl">
                  <p className="font-medium leading-relaxed">{pendingQuestion || question}</p>
                </div>
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 text-ui-accent-ink flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              </div>
            )}

            {/* AI Generating Indicator */}
            <div className="flex justify-start gap-2.5 items-start pr-8">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 text-ui-accent-ink flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <div className="bg-ui-ground border border-blue-500/20 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-3 text-xs text-ui-accent-ink">
                <Loader2 className="w-4 h-4 animate-spin text-ui-accent-ink" />
                <span>AI javob tayyorlamoqda...</span>
                <span className="flex gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2 relative">
        <div className="relative flex-1">
          <input
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            disabled={asking}
            placeholder={asking ? "Javob kutilmoqda..." : placeholder}
            className="w-full bg-ui-ground border border-ui-rule rounded-xl pl-4 pr-10 py-3 text-sm text-ui-ink placeholder:text-ui-muted focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition disabled:opacity-50"
          />
          {question && !asking && (
            <button
              type="button"
              onClick={() => onQuestionChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-muted hover:text-ui-muted text-xs px-1"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="px-4 py-3 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
