"use client";

import { useEffect, useState, useRef } from "react";
import { Check, X, RotateCcw, GraduationCap, ArrowRight, Clock } from "lucide-react";
import { QuizQuestion } from "@/lib/api";
import { formatTs } from "@/lib/timestamp";
import GenerationCard from "./GenerationCard";

// frontend/app/video-analysis/[id]/page.tsx VA frontend/app/learn/[id]/page.tsx
// ikkalasi ham shu komponentni ishlatadi.
// Quiz navigatsiyasi: javob tanlanganda 'Keyingisi' tugmasi pastga surilib ketmasligi
// uchun darhol natija bilan yonma-yon tepada ko'rsatiladi va scrollIntoView 'nearest'
// bilan silliq ushlab turiladi.

interface QuizTabProps {
  quiz: QuizQuestion[] | null;
  loading: boolean;
  answers: Record<number, number>;
  onGenerate: () => void;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
  onSeek: (seconds: number) => void;
  onQuizStarted?: () => void;
  onQuizCompleted?: (score: number, total: number) => void;
  startTime?: number | null;
  videoDuration?: number;
}

export default function QuizTab({
  quiz, loading, answers, onGenerate, onAnswer, onSeek, onQuizStarted, onQuizCompleted,
  startTime, videoDuration,
}: QuizTabProps) {
  const [index, setIndex] = useState(0);
  const [reviewingMistakes, setReviewingMistakes] = useState(false);
  const [startedTracked, setStartedTracked] = useState(false);
  const [completedTracked, setCompletedTracked] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const total = quiz?.length ?? 0;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = total > 0 && answeredCount >= total;
  const score = quiz ? quiz.reduce((acc, q, qi) => acc + (answers[qi] === q.correct_answer ? 1 : 0), 0) : 0;
  const missed = quiz ? quiz.map((q, qi) => ({ q, qi })).filter(({ q, qi }) => answers[qi] !== undefined && answers[qi] !== q.correct_answer) : [];

  useEffect(() => {
    if (quiz && !startedTracked) {
      onQuizStarted?.();
      setStartedTracked(true);
    }
  }, [quiz, startedTracked, onQuizStarted]);

  useEffect(() => {
    if (allAnswered && !completedTracked) {
      onQuizCompleted?.(score, total);
      setCompletedTracked(true);
    }
  }, [allAnswered, completedTracked, onQuizCompleted, score, total]);

  if (!quiz) {
    return (
      <GenerationCard
        badge="AI Test"
        title="Interaktiv test yaratish"
        description="Video bo'yicha bilimlaringizni sinash uchun ko'p variantli savollar, to'g'ri javoblar va har bir javobga batafsil tushuntirishlar tuziladi."
        buttonText="Test tuzish"
        icon={<GraduationCap className="w-6 h-6" />}
        features={[
          "Har bir savol video daqiqasiga bog'langan",
          "To'g'ri va noto'g'ri javoblarga izohlar",
          "Xatolar ustida alohida ishlash imkoniyati",
        ]}
        loading={loading}
        loadingSteps={[
          "Videodan asosiy faktlar va savollar tanlanmoqda...",
          "Variantlar va to'g'ri javoblar tuzilmoqda...",
          "Har bir savol uchun tushuntirishlar yozilmoqda...",
          "Test savollari tayyorlanmoqda...",
        ]}
        estimatedTime="~15-20 soniya"
        onGenerate={onGenerate}
        startTime={startTime}
        videoDuration={videoDuration}
      />
    );
  }

  if (allAnswered && !reviewingMistakes) {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-2 py-4">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Natija</p>
          <p className="text-3xl font-black text-white">{score}/{total}</p>
        </div>
        {missed.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Qayta ko'rib chiqish kerak</p>
            <div className="space-y-1.5">
              {missed.map(({ q, qi }) => (
                <button
                  key={qi}
                  onClick={() => onSeek(q.timestamp)}
                  className="w-full text-left flex gap-3 items-start bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl p-3 transition"
                >
                  <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                    {formatTs(q.timestamp)}
                  </span>
                  <span className="text-sm text-gray-300">{q.question}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setReviewingMistakes(true); setIndex(missed[0].qi); }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Xatolarni qayta ko'rish
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-emerald-400 font-semibold">Barcha savollarga to'g'ri javob berdingiz!</p>
        )}
      </div>
    );
  }

  const missedIndices = missed.map((m) => m.qi);
  const sequence = reviewingMistakes ? missedIndices : quiz.map((_, i) => i);
  const posInSequence = sequence.indexOf(index);
  const qi = index;
  const q = quiz[qi];
  const chosen = answers[qi];
  const showResult = chosen !== undefined;
  const isCorrect = chosen === q.correct_answer;
  const isLastInSequence = posInSequence === sequence.length - 1;

  const advance = () => {
    if (isLastInSequence) {
      if (reviewingMistakes) setReviewingMistakes(false);
      return;
    }
    const nextIdx = sequence[posInSequence + 1];
    setIndex(nextIdx);
    // Smoothly keep the container in view without erratic jumping
    setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  return (
    <div ref={cardRef} className="space-y-4">
      {/* Quiz Progress Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">
          {reviewingMistakes ? "Xato javoblarni qayta ko'rish" : `Savol ${posInSequence + 1} / ${sequence.length}`}
        </p>
        {!reviewingMistakes && (
          <div className="flex gap-1">
            {quiz.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  answers[i] !== undefined
                    ? answers[i] === quiz[i].correct_answer
                      ? "bg-emerald-400"
                      : "bg-red-400"
                    : i === index
                    ? "bg-blue-400 scale-125"
                    : "bg-white/10"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3.5 bg-white/[0.02] backdrop-blur-sm shadow-sm">
        <p className="text-sm sm:text-base font-bold text-white leading-snug">{q.question}</p>

        {/* Options */}
        <div className="space-y-1.5" role="radiogroup" aria-label={q.question}>
          {q.options.map((opt, oi) => {
            const isChosen = chosen === oi;
            const isOptCorrect = oi === q.correct_answer;
            return (
              <button
                key={oi}
                onClick={() => onAnswer(qi, oi)}
                disabled={showResult}
                role="radio"
                aria-checked={isChosen}
                className={`w-full text-left flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition border ${
                  showResult && isOptCorrect
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold shadow-sm"
                    : showResult && isChosen
                    ? "bg-red-500/15 border-red-500/40 text-red-300 font-semibold"
                    : "bg-white/[0.03] border-white/5 text-gray-300 hover:bg-white/[0.07] hover:border-white/15 active:scale-[0.99]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                    showResult && isOptCorrect
                      ? "bg-emerald-500 text-white"
                      : showResult && isChosen
                      ? "bg-red-500 text-white"
                      : "bg-white/10 text-gray-300"
                  }`}>
                    {String.fromCharCode(65 + oi)}
                  </span>
                  <span>{opt}</span>
                </div>
                {showResult && isOptCorrect && <Check className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />}
                {showResult && isChosen && !isOptCorrect && <X className="w-4 h-4 shrink-0 text-red-400" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {/* Result & Explanation: Positioned immediately so no scrolling needed */}
        <div aria-live="polite">
          {showResult && (
            <div className="pt-2 border-t border-white/10 space-y-2.5 animate-fadeIn">
              {/* Primary Action & Status bar (Directly visible!) */}
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    isCorrect
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}
                >
                  {isCorrect ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <X className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>{isCorrect ? "To'g'ri javob!" : "Noto'g'ri javob"}</span>
                </div>

                <button
                  onClick={advance}
                  autoFocus
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/25 active:scale-95 transition"
                >
                  <span>{isLastInSequence ? (reviewingMistakes ? "Natijaga qaytish" : "Yakunlash") : "Keyingisi"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Explanation Callout */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSeek(q.timestamp)}
                    className="text-[11px] font-mono text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-2 py-0.5 rounded-md flex items-center gap-1 transition"
                    title="Videodan ushbu daqiqani ko'rish"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{formatTs(q.timestamp)}</span>
                  </button>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Tushuntirish:</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{q.explanation}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

