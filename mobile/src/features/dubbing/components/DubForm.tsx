import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet } from 'react-native';

import { getErrorMessage } from '../../../api/errors';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { SegmentedControl } from '../../../components/SegmentedControl';
import { ThemedText } from '../../../components/ThemedText';
import { ThemedTextInput } from '../../../components/ThemedTextInput';
import { ThemedView } from '../../../components/ThemedView';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useAuthStore } from '../../../store/useAuthStore';
import { useShareStore } from '../../../store/useShareStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { formatDuration } from '../../../utils/format';
import { isValidYoutubeUrl } from '../../../utils/youtube';
import * as dubbingApi from '../api';
import { dubFormSchema, type DubFormValues } from '../schemas';
import type { LocalVideo, VoiceGender } from '../types';

type Source = 'youtube' | 'file';
type Output = 'dub' | 'subtitle';

const SOURCE_OPTIONS = [
  { value: 'youtube', label: 'YouTube havola' },
  { value: 'file', label: 'Telefondagi video' },
] as const;

const OUTPUT_OPTIONS = [
  { value: 'dub', label: 'Dublaj + subtitr' },
  { value: 'subtitle', label: 'Faqat subtitr' },
] as const;

const VOICE_OPTIONS = [
  { value: 'auto', label: 'Avto' },
  { value: 'male', label: 'Erkak' },
  { value: 'female', label: 'Ayol' },
] as const;

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

// Faylni yuklashdan OLDIN tekshirish (server ham tekshiradi, lekin 1 GB yuklab bo'lib rad etilmasin)
function checkVideo(video: LocalVideo): string | null {
  if (!dubbingApi.uploadContentType(video)) return 'Bu format qoʻllab-quvvatlanmaydi. MP4, MOV, MKV yoki WebM kerak.';
  if (video.size && video.size > dubbingApi.UPLOAD_MAX_BYTES) return `Fayl 1 GB dan katta (${formatSize(video.size)}).`;
  return null;
}

export function DubForm() {
  const router = useRouter();
  const { colors } = useTheme();
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const { pendingUrl, pendingFile, clear: clearShared } = useShareStore();

  const [source, setSource] = useState<Source>('youtube');
  const [output, setOutput] = useState<Output>('dub');
  const [video, setVideo] = useState<LocalVideo | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DubFormValues>({
    resolver: zodResolver(dubFormSchema),
    defaultValues: { youtubeUrl: '', voiceGender: 'auto' },
  });

  // "Ulashish -> GapirAI" orqali kelgan havola yoki video. Store bu yerda tozalanmaydi --
  // navigatsiya ekranni qayta yaratsa ham forma yana to'ladi; yuborilgach tozalanadi.
  useEffect(() => {
    if (pendingUrl) {
      setSource('youtube');
      setValue('youtubeUrl', pendingUrl, { shouldValidate: true });
    } else if (pendingFile) {
      setSource('file');
      setVideo(pendingFile);
      setVideoError(checkVideo(pendingFile));
    }
  }, [pendingUrl, pendingFile, setValue]);

  const urlValue = watch('youtubeUrl');
  const debouncedUrl = useDebouncedValue(urlValue, 500);
  const urlLooksValid = source === 'youtube' && isValidYoutubeUrl(debouncedUrl.trim());

  const videoInfoQuery = useQuery({
    queryKey: ['video-info', debouncedUrl],
    queryFn: () => dubbingApi.getVideoInfo(debouncedUrl.trim()),
    enabled: urlLooksValid,
    retry: false,
  });

  const subtitleOnly = output === 'subtitle';

  const youtubeMutation = useMutation({
    mutationFn: (values: DubFormValues) =>
      dubbingApi.createJob(values.youtubeUrl.trim(), values.voiceGender, subtitleOnly),
    onSuccess: (data) => {
      clearShared();
      router.push(`/video/${data.job_id}`);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, voiceGender }: { file: LocalVideo; voiceGender: VoiceGender }) =>
      dubbingApi.uploadVideo(file, { subtitleOnly, voiceGender }, setProgress),
    onSuccess: (data) => {
      clearShared();
      setProgress(null);
      setVideo(null);
      router.push(`/video/${data.job_id}`);
    },
    onError: () => setProgress(null),
  });

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false, quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    const picked: LocalVideo = {
      uri: a.uri,
      name: a.fileName || a.uri.split('/').pop() || 'video.mp4',
      size: a.fileSize ?? null,
      mimeType: a.mimeType ?? null,
      durationMs: a.duration ?? null,
    };
    clearShared();
    setVideo(picked);
    setVideoError(checkVideo(picked));
    uploadMutation.reset();
  };

  const onSubmit = handleSubmit(
    (values) => {
      if (!signedIn) return router.push('/(auth)/login');
      if (source === 'youtube') return youtubeMutation.mutate(values);
      if (!video) return setVideoError('Avval videoni tanlang.');
      if (videoError) return;
      uploadMutation.mutate({ file: video, voiceGender: values.voiceGender });
    },
    // Fayl rejimida YouTube havolasi bo'sh -- validatsiya xatosiga qaramay yuboramiz
    (_errs) => {
      if (source !== 'file') return;
      if (!signedIn) return router.push('/(auth)/login');
      if (!video) return setVideoError('Avval videoni tanlang.');
      if (!videoError) uploadMutation.mutate({ file: video, voiceGender: watch('voiceGender') });
    },
  );

  const mutationError = source === 'youtube' ? youtubeMutation.error : uploadMutation.error;
  const busy = youtubeMutation.isPending || uploadMutation.isPending;

  return (
    <ThemedView style={styles.form}>
      <SegmentedControl options={[...SOURCE_OPTIONS]} value={source} onChange={(v) => setSource(v)} />

      {source === 'youtube' ? (
        <>
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
          <ThemedText variant="secondary" style={styles.hint}>
            Maslahat: YouTube ilovasida «Ulashish» → «GapirAI» ni bossangiz, havola shu yerga oʻzi tushadi.
          </ThemedText>

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
        </>
      ) : (
        <ThemedView style={styles.field}>
          <Pressable
            onPress={pickVideo}
            disabled={busy}
            style={[styles.picker, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            {video ? (
              <ThemedView style={styles.previewInfo}>
                <ThemedText numberOfLines={2} style={styles.previewTitle}>
                  {video.name}
                </ThemedText>
                <ThemedText variant="secondary" style={styles.previewMeta}>
                  {[video.durationMs ? formatDuration(video.durationMs / 1000) : '', formatSize(video.size)]
                    .filter(Boolean)
                    .join(' · ')}
                  {busy ? '' : '  —  boshqasini tanlash'}
                </ThemedText>
              </ThemedView>
            ) : (
              <ThemedText style={[styles.pickerText, { color: colors.accent }]}>Galereyadan video tanlash</ThemedText>
            )}
          </Pressable>
          <ThemedText variant="secondary" style={styles.hint}>
            1 GB gacha · MP4, MOV, MKV, WebM. Galereyada «Ulashish» → «GapirAI» ham ishlaydi.
          </ThemedText>
          {videoError && <ThemedText style={[styles.error, { color: colors.danger }]}>{videoError}</ThemedText>}
        </ThemedView>
      )}

      <ThemedView style={styles.field}>
        <ThemedText variant="secondary" style={styles.label}>
          Natija
        </ThemedText>
        <SegmentedControl options={[...OUTPUT_OPTIONS]} value={output} onChange={(v) => setOutput(v)} />
      </ThemedView>

      {!subtitleOnly && (
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
      )}

      {progress !== null && (
        <ThemedView style={styles.field}>
          <ThemedView style={[styles.bar, { backgroundColor: colors.border }]}>
            <ThemedView style={[styles.barFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent }]} />
          </ThemedView>
          <ThemedText variant="secondary" style={styles.hint}>
            Video yuborilmoqda… {Math.round(progress * 100)}%
          </ThemedText>
        </ThemedView>
      )}

      {mutationError && (
        <ThemedText style={[styles.error, { color: colors.danger }]}>
          {mutationError instanceof dubbingApi.UploadError
            ? mutationError.message
            : getErrorMessage(mutationError, 'Yuborishda xatolik yuz berdi.')}
        </ThemedText>
      )}

      <PrimaryButton
        label={!signedIn ? 'Kirish va davom etish' : subtitleOnly ? 'Subtitr yaratish' : 'Dublyaj qilish'}
        onPress={onSubmit}
        loading={busy}
        disabled={source === 'file' && !!videoError}
      />
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
  hint: { fontSize: 12, lineHeight: 17 },
  error: { fontSize: 13, fontWeight: '600' },
  preview: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 12,
    alignItems: 'center',
  },
  picker: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    minHeight: 72,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerText: { fontSize: 15, fontWeight: '700' },
  thumbnail: {
    width: 72,
    height: 48,
    borderRadius: 8,
  },
  previewInfo: { flex: 1, gap: 4, backgroundColor: 'transparent' },
  previewTitle: { fontSize: 13, fontWeight: '700' },
  previewMeta: { fontSize: 12, fontWeight: '600' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
});
