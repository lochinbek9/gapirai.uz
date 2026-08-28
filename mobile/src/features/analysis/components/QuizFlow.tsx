import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { useTheme } from '../../../theme/ThemeProvider';
import { formatTimestamp } from '../../../utils/format';
import type { QuizQuestion } from '../types';

// mobile/app/video-analysis/[id].tsx VA mobile/app/learn/[id].tsx ikkalasi
// ham shu komponentni ishlatadi -- ketma-ket (bitta-bittadan) savol oqimi +
// progress + yakuniy natija ekrani, frontend/components/analysis/QuizTab.tsx
// bilan bir xil mantiq (2026-08-25).

interface QuizFlowProps {
  quiz: QuizQuestion[] | null;
  loading: boolean;
  answers: Record<number, number>;
  onGenerate: () => void;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
  onSeek: (seconds: number) => void;
  onQuizStarted?: () => void;
  onQuizCompleted?: (score: number, total: number) => void;
}

export function QuizFlow({ quiz, loading, answers, onGenerate, onAnswer, onSeek, onQuizStarted, onQuizCompleted }: QuizFlowProps) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const [reviewingMistakes, setReviewingMistakes] = useState(false);
  const [startedTracked, setStartedTracked] = useState(false);
  const [completedTracked, setCompletedTracked] = useState(false);

  const total = quiz?.length ?? 0;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = total > 0 && answeredCount >= total;
  const score = quiz ? quiz.reduce((acc, q, qi) => acc + (answers[qi] === q.correct_answer ? 1 : 0), 0) : 0;
  const missed = quiz
    ? quiz.map((q, qi) => ({ q, qi })).filter(({ q, qi }) => answers[qi] !== undefined && answers[qi] !== q.correct_answer)
    : [];

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
      <Pressable
        onPress={onGenerate}
        disabled={loading}
        style={[styles.generateButton, { backgroundColor: colors.accentGlow, opacity: loading ? 0.6 : 1 }]}
      >
        <ThemedText style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
          {loading ? 'Yaratilmoqda...' : 'Test tuzish'}
        </ThemedText>
      </Pressable>
    );
  }

  if (allAnswered && !reviewingMistakes) {
    return (
      <ThemedView style={{ gap: 16 }}>
        <ThemedView style={styles.resultHeader}>
          <ThemedText style={[styles.resultLabel, { color: colors.accent }]}>Natija</ThemedText>
          <ThemedText style={styles.resultScore}>
            {score}/{total}
          </ThemedText>
        </ThemedView>
        {missed.length > 0 ? (
          <ThemedView style={{ gap: 10 }}>
            <ThemedText variant="secondary" style={styles.resultLabel}>
              Qayta ko&apos;rib chiqish kerak
            </ThemedText>
            <ThemedView style={{ gap: 6 }}>
              {missed.map(({ q, qi }) => (
                <Pressable
                  key={qi}
                  onPress={() => onSeek(q.timestamp)}
                  style={[styles.missedRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <ThemedText style={[styles.timestamp, { color: colors.accent, backgroundColor: colors.accentGlow }]}>
                    {formatTimestamp(q.timestamp)}
                  </ThemedText>
                  <ThemedText style={[styles.missedQuestion, { flex: 1 }]}>{q.question}</ThemedText>
                </Pressable>
              ))}
            </ThemedView>
            <Pressable
              onPress={() => {
                setReviewingMistakes(true);
                setIndex(missed[0].qi);
              }}
              style={[styles.reviewButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <MaterialCommunityIcons name="restart" size={15} color={colors.textPrimary} />
              <ThemedText style={{ fontWeight: '700', fontSize: 12 }}>Xatolarni qayta ko&apos;rish</ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <ThemedText style={{ color: colors.success, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>
            Barcha savollarga to&apos;g&apos;ri javob berdingiz!
          </ThemedText>
        )}
      </ThemedView>
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
    setIndex(sequence[posInSequence + 1]);
  };

  return (
    <ThemedView style={{ gap: 14 }}>
      <ThemedView style={styles.progressHeader}>
        <ThemedText style={[styles.resultLabel, { color: colors.accent }]}>
          {reviewingMistakes ? "Xato javoblarni qayta ko'rish" : `Savol ${posInSequence + 1} / ${sequence.length}`}
        </ThemedText>
        {!reviewingMistakes && (
          <ThemedView style={styles.dots}>
            {quiz.map((_, i) => (
              <ThemedView
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      answers[i] !== undefined ? colors.accent : i === index ? `${colors.accent}66` : colors.border,
                  },
                ]}
              />
            ))}
          </ThemedView>
        )}
      </ThemedView>

      <ThemedView style={[styles.questionCard, { borderColor: colors.border }]}>
        <ThemedText style={styles.questionText}>{q.question}</ThemedText>
        <ThemedView style={{ gap: 8 }}>
          {q.options.map((opt, oi) => {
            const isChosen = chosen === oi;
            const isOptCorrect = oi === q.correct_answer;
            const bg = showResult && isOptCorrect ? `${colors.success}26` : showResult && isChosen ? `${colors.danger}26` : colors.background;
            const border = showResult && isOptCorrect ? colors.success : showResult && isChosen ? colors.danger : colors.border;
            const textColor = showResult && isOptCorrect ? colors.success : showResult && isChosen ? colors.danger : colors.textPrimary;
            return (
              <Pressable
                key={oi}
                onPress={() => onAnswer(qi, oi)}
                disabled={showResult}
                style={[styles.option, { backgroundColor: bg, borderColor: border }]}
              >
                <ThemedText style={{ color: textColor, fontSize: 13, fontWeight: '600', flex: 1 }}>{opt}</ThemedText>
                {showResult && isOptCorrect && <MaterialCommunityIcons name="check" size={16} color={colors.success} />}
                {showResult && isChosen && !isOptCorrect && <MaterialCommunityIcons name="close" size={16} color={colors.danger} />}
              </Pressable>
            );
          })}
        </ThemedView>

        {showResult && (
          <ThemedView style={{ gap: 8 }}>
            <ThemedView style={styles.resultRow}>
              <MaterialCommunityIcons
                name={isCorrect ? 'check' : 'close'}
                size={15}
                color={isCorrect ? colors.success : colors.danger}
              />
              <ThemedText style={{ color: isCorrect ? colors.success : colors.danger, fontWeight: '800', fontSize: 12 }}>
                {isCorrect ? "To'g'ri" : "Noto'g'ri"}
              </ThemedText>
            </ThemedView>
            <ThemedView style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Pressable onPress={() => onSeek(q.timestamp)}>
                <ThemedText style={[styles.timestamp, { color: colors.accent }]}>{formatTimestamp(q.timestamp)}</ThemedText>
              </Pressable>
              <ThemedText variant="secondary" style={{ flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 17 }}>
                {q.explanation}
              </ThemedText>
            </ThemedView>
            <Pressable onPress={advance} style={[styles.nextButton, { backgroundColor: colors.accentGlow }]}>
              <ThemedText style={{ color: colors.accent, fontWeight: '700', fontSize: 12 }}>
                {isLastInSequence ? (reviewingMistakes ? 'Natijaga qaytish' : 'Yakunlash') : 'Keyingisi'}
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  generateButton: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  resultHeader: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  resultLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  resultScore: { fontSize: 30, fontWeight: '900' },
  missedRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 12 },
  missedQuestion: { fontSize: 13, fontWeight: '500' },
  reviewButton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  questionCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  questionText: { fontSize: 14, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timestamp: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  nextButton: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
});
