import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { getErrorMessage } from '../../../api/errors';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { SegmentedControl } from '../../../components/SegmentedControl';
import { ThemedText } from '../../../components/ThemedText';
import { ThemedTextInput } from '../../../components/ThemedTextInput';
import { ThemedView } from '../../../components/ThemedView';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useTheme } from '../../../theme/ThemeProvider';
import { formatDuration } from '../../../utils/format';
import { isValidYoutubeUrl } from '../../../utils/youtube';
import * as dubbingApi from '../api';
import { dubFormSchema, type DubFormValues } from '../schemas';

const VOICE_OPTIONS = [
  { value: 'auto', label: 'Avto' },
  { value: 'male', label: 'Erkak' },
  { value: 'female', label: 'Ayol' },
] as const;

export function DubForm() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DubFormValues>({
    resolver: zodResolver(dubFormSchema),
    defaultValues: { youtubeUrl: '', voiceGender: 'auto' },
  });

  const urlValue = watch('youtubeUrl');
  const debouncedUrl = useDebouncedValue(urlValue, 500);
  const urlLooksValid = isValidYoutubeUrl(debouncedUrl.trim());

  const videoInfoQuery = useQuery({
    queryKey: ['video-info', debouncedUrl],
    queryFn: () => dubbingApi.getVideoInfo(debouncedUrl.trim()),
    enabled: urlLooksValid,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (values: DubFormValues) => dubbingApi.createJob(values.youtubeUrl.trim(), values.voiceGender),
    onSuccess: (data) => {
      router.push(`/video/${data.job_id}`);
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

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

      {videoInfoQuery.data && (
        <ThemedView style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Image source={{ uri: videoInfoQuery.data.thumbnail }} style={styles.thumbnail} contentFit="cover" />
          <ThemedView style={styles.previewInfo}>
            <ThemedText numberOfLines={2} style={styles.previewTitle}>
              {videoInfoQuery.data.title}
            </ThemedText>
            <ThemedText variant="secondary" style={styles.previewMeta}>
              {formatDuration(videoInfoQuery.data.duration)}
            </ThemedText>
          </ThemedView>
        </ThemedView>
      )}

      <ThemedView style={styles.field}>
        <ThemedText variant="secondary" style={styles.label}>
          Ovoz
        </ThemedText>
        <Controller
          control={control}
          name="voiceGender"
          render={({ field: { onChange, value } }) => (
            <SegmentedControl options={[...VOICE_OPTIONS]} value={value} onChange={onChange} />
          )}
        />
      </ThemedView>

      {mutation.isError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
          {getErrorMessage(mutation.error, 'Dublyaj yaratishda xatolik yuz berdi.')}
        </ThemedText>
      )}

      <PrimaryButton label="Dublyaj qilish" onPress={onSubmit} loading={mutation.isPending} />
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
  preview: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 12,
    alignItems: 'center',
  },
  thumbnail: {
    width: 72,
    height: 48,
    borderRadius: 8,
  },
  previewInfo: { flex: 1, gap: 4 },
  previewTitle: { fontSize: 13, fontWeight: '700' },
  previewMeta: { fontSize: 12, fontWeight: '600' },
});
