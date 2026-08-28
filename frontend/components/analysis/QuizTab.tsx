"use client";

import { useEffect, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import { QuizQuestion } from "@/lib/api";
import { formatTs } from "@/lib/timestamp";

// frontend/app/video-analysis/[id]/page.tsx VA frontend/app/learn/[id]/page.tsx
// ikkalasi ham shu komponentni ishlatadi -- "Test" tabining markup/xatti-
// harakati bitta joyda. 2026-08-25: bitta uzun ro'yxat o'rniga ketma-ket
// (bitta-bittadan) oqim + progress + yakuniy natija ekraniga qayta qurildi.

interface QuizTabProps {
  quiz: QuizQuestion[] | null;
  loading: boolean;
  answers: Record<number, number>;
  onGenerate: () => void;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
  onSeek: (seconds: number) => void;
  /** Ixtiyoriy -- ota komponent analitika yuborish uchun ulanishi mumkin
   * (masalan frontend/app/learn/[id] quiz_started/quiz_completed). Eski
   * /video-analysis sahifasi buni bermaydi -- shunda shunchaki chaqirilmaydi. */
  onQuizStarted?: () => void;
  onQuizCompleted?: (score: number, total: number) => void;
}

export default function QuizTab({
  quiz, loading, answers, onGenerate, onAnswer, onSeek, onQuizStarted, onQuizCompleted,
}: QuizTabProps) {
  const [index, setIndex] = useState(0);
  const [reviewingMistakes, setReviewingMistakes] = useState(false);
  const [startedTracked, setStartedTracked] = useState(false);
  const [completedTracked, setCompletedTracked] = useState(false);

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
      <button
        onClick={onGenerate}
        disabled={loading}
        className="px-5 py-3 rounded-xl bg-blue-500/20 text-blue-400 text-sm font-bold hover:bg-blue-500/30 transition disabled:opacity-50"
      >
        {loading ? "Yaratilmoqda..." : "Test tuzish"}
      </button>
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
      // aks holda allAnswered true bo'lgani uchun natija ekrani avtomatik ko'rinadi
      return;
    }
    setIndex(sequence[posInSequence + 1]);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">
          {reviewingMistakes ? "Xato javoblarni qayta ko'rish" : `Savol ${posInSequence + 1} / ${sequence.length}`}
        </p>
        {!reviewingMistakes && (
          <div className="flex gap-1">
            {quiz.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  answers[i] !== undefined ? "bg-blue-400" : i === index ? "bg-blue-400/40" : "bg-white/10"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border border-white/10 rounded-xl p-4 space-y-3">
        <p className="text-sm font-bold text-white">{q.question}</p>
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
                className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm transition border ${
                  showResult && isOptCorrect
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                    : showResult && isChosen
                    ? "bg-red-500/15 border-red-500/30 text-red-300"
                    : "bg-white/[0.03] border-white/5 text-gray-300 hover:bg-white/[0.06]"
                }`}
              >
                <span>{opt}</span>
                {showResult && isOptCorrect && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                {showResult && isChosen && !isOptCorrect && <X className="w-4 h-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <div aria-live="polite">
          {showResult && (
            <div className="space-y-2 pt-1">
              <div className={`flex items-center gap-1.5 text-xs font-bold ${isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                {isCorrect ? <Check className="w-4 h-4" aria-hidden="true" /> : <X className="w-4 h-4" aria-hidden="true" />}
                {isCorrect ? "To'g'ri" : "Noto'g'ri"}
              </div>
              <div className="flex items-start gap-2">
                <button onClick={() => onSeek(q.timestamp)} className="text-[11px] font-mono text-blue-400 shrink-0">
                  {formatTs(q.timestamp)}
                </button>
                <p className="text-xs text-gray-400">{q.explanation}</p>
              </div>
              <button
                onClick={advance}
                className="px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-bold transition"
              >
                {isLastInSequence ? (reviewingMistakes ? "Natijaga qaytish" : "Yakunlash") : "Keyingisi"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
