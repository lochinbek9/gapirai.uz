import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { getErrorMessage } from '../../../api/errors';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { SegmentedControl } from '../../../components/SegmentedControl';
import { ThemedText } from '../../../components/ThemedText';
import { ThemedTextInput } from '../../../components/ThemedTextInput';
import { ThemedView } from '../../../components/ThemedView';
import { useAuthStore } from '../../../store/useAuthStore';
import { useTheme } from '../../../theme/ThemeProvider';
import * as analysisApi from '../api';
import { analyzeFormSchema, type AnalyzeFormValues } from '../schemas';
import { ANALYSIS_LANGUAGE_OPTIONS } from '../types';

export function AnalyzeForm() {
  const router = useRouter();
  const { colors } = useTheme();
  const status = useAuthStore((s) => s.status);
  const isLoggedIn = status === 'signedIn';

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AnalyzeFormValues>({
    resolver: zodResolver(analyzeFormSchema),
    defaultValues: { youtubeUrl: '', language: 'uz' },
  });

  const mutation = useMutation({
    mutationFn: (values: AnalyzeFormValues) => analysisApi.createAnalysis(values.youtubeUrl.trim(), values.language),
    onSuccess: (data) => {
      router.push(`/video-analysis/${data.analysis_id}`);
    },
  });

  // Backend requires auth for analysis creation (unlike dubbing, which is
  // anonymous) — matches frontend/components/AnalysisUrlForm.tsx exactly:
  // redirect to login instead of calling an endpoint that would 401.
  const onSubmit = handleSubmit((values) => {
    if (!isLoggedIn) {
      router.push('/(auth)/login');
      return;
    }
    mutation.mutate(values);
  });

  return (
    <ThemedView style={styles.form}>
      <Controller
        control={control}
        name="youtubeUrl"
        render={({ field: { onChange, onBlur, value } }) => (
          <ThemedTextInput
            label="YouTube havolasi"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType="url"
            error={errors.youtubeUrl?.message}
            placeholder="https://youtube.com/watch?v=..."
          />
        )}
      />

      <ThemedView style={styles.field}>
        <ThemedText variant="secondary" style={styles.label}>
          Tahlil tili
        </ThemedText>
        <Controller
          control={control}
          name="language"
          render={({ field: { onChange, value } }) => (
            <SegmentedControl
              scrollable
              options={ANALYSIS_LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={value}
              onChange={onChange}
            />
          )}
        />
        <ThemedText variant="secondary" style={styles.hint}>
          Transkript video&apos;ning original tilida qoladi — bu faqat xulosa, konspekt va test qaysi tilda
          chiqishini belgilaydi.
        </ThemedText>
      </ThemedView>

      {!isLoggedIn && (
        <ThemedView style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <ThemedText style={styles.noticeText}>
            Video tahlili uchun{' '}
            <ThemedText onPress={() => router.push('/(auth)/login')} suppressHighlighting style={{ color: colors.accent, fontWeight: '700' }}>
              kiring
            </ThemedText>{' '}
            yoki{' '}
            <ThemedText onPress={() => router.push('/(auth)/register')} suppressHighlighting style={{ color: colors.accent, fontWeight: '700' }}>
              ro&apos;yxatdan o&apos;ting
            </ThemedText>
            .
          </ThemedText>
        </ThemedView>
      )}

      {mutation.isError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
          {getErrorMessage(mutation.error, 'Tahlil yaratishda xatolik yuz berdi.')}
        </ThemedText>
      )}

      <PrimaryButton label="Video tahlil qilish" onPress={onSubmit} loading={mutation.isPending} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: { width: '100%', gap: 16 },
  field: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: { fontSize: 11, fontWeight: '500', lineHeight: 16 },
  notice: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  noticeText: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
});
