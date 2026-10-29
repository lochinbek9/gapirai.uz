import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { getErrorMessage } from '../../../api/errors';
import { FeatureDots } from '../../../components/FeatureDots';
import { Notice } from '../../../components/Notice';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { SelectField } from '../../../components/SelectField';
import { ThemedText } from '../../../components/ThemedText';
import { UrlField } from '../../../components/UrlField';
import { useAuthStore } from '../../../store/useAuthStore';
import { useTheme } from '../../../theme/ThemeProvider';
import * as analysisApi from '../api';
import { analyzeFormSchema, type AnalyzeFormValues } from '../schemas';
import { ANALYSIS_LANGUAGE_OPTIONS } from '../types';

/** Bosh sahifadagi "Tahlil" tabi -- saytdagi AnalysisUrlForm. */
export function AnalyzeForm() {
  const router = useRouter();
  const { colors } = useTheme();
  const authStatus = useAuthStore((s) => s.status);
  const isLoggedIn = authStatus === 'signedIn';

  const {
    control,
    handleSubmit,
    watch,
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

  // Tahlil yaratish uchun kirish shart (saytdagidek) -- 401 olish o'rniga login'ga yuboramiz
  const onSubmit = handleSubmit((values) => {
    if (authStatus === 'idle' || authStatus === 'loading') return;
    if (!isLoggedIn) return router.push('/(auth)/login');
    mutation.mutate(values);
  });

  const link = { color: colors.ink, textDecorationLine: 'underline' as const, fontWeight: '500' as const };

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="youtubeUrl"
        render={({ field: { onChange, onBlur, value } }) => (
          <UrlField
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.youtubeUrl?.message}
            placeholder="YouTube havolasini kiriting..."
            onSubmitEditing={onSubmit}
          />
        )}
      />

      <Controller
        control={control}
        name="language"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Tahlil tili"
            value={value}
            options={ANALYSIS_LANGUAGE_OPTIONS}
            onChange={onChange}
            hint="Transkript doim videoning original tilida qoladi — bu faqat xulosa, boblar, konspekt va test qaysi tilda chiqishini belgilaydi."
          />
        )}
      />

      {authStatus === 'signedOut' && (
        <Notice tone="warning">
          <ThemedText style={styles.noticeText}>
            Video tahlili uchun{' '}
            <ThemedText onPress={() => router.push('/(auth)/login')} suppressHighlighting style={[styles.noticeText, link]}>
              kiring
            </ThemedText>{' '}
            yoki{' '}
            <ThemedText onPress={() => router.push('/(auth)/register')} suppressHighlighting style={[styles.noticeText, link]}>
              roʻyxatdan oʻting
            </ThemedText>
            .
          </ThemedText>
        </Notice>
      )}

      {mutation.isError && <Notice>{getErrorMessage(mutation.error, 'Tahlil yaratishda xatolik yuz berdi.')}</Notice>}

      <View style={[styles.teaser, { borderTopColor: colors.rule }]}>
        <ThemedText variant="secondary" style={styles.teaserText}>
          <ThemedText style={[styles.teaserText, { fontWeight: '600', color: colors.muted }]}>Tezkor rejim:</ThemedText> 15-20
          soniyada butun videoning qisqa konspekti, asosiy xulosalari va testini oling.
        </ThemedText>
      </View>

      <PrimaryButton
        label={mutation.isPending ? 'Tahlil boshlanmoqda...' : 'Tezkor tahlil qilish'}
        icon={Sparkles}
        size="lg"
        onPress={onSubmit}
        loading={mutation.isPending}
        disabled={!watch('youtubeUrl').trim()}
      />

      <FeatureDots items={['AI Xulosa', 'Asosiy fikrlar', 'Transkript', 'Konspekt', 'Test']} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 24 },
  noticeText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  teaser: { borderTopWidth: 1, paddingTop: 16 },
  teaserText: { fontSize: 16, lineHeight: 24 },
});
