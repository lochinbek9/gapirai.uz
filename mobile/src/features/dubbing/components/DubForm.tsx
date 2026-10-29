import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { FileVideo, Info, UploadCloud, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '../../../api/errors';
import { Youtube } from '../../../components/BrandIcons';
import { ChoiceTile } from '../../../components/ChoiceTile';
import { FeatureDots } from '../../../components/FeatureDots';
import { Notice } from '../../../components/Notice';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { ThemedText } from '../../../components/ThemedText';
import { UnderlineTabs } from '../../../components/UnderlineTabs';
import { UrlField } from '../../../components/UrlField';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useAuthStore } from '../../../store/useAuthStore';
import { useShareStore } from '../../../store/useShareStore';
import { alpha, radius } from '../../../theme/colors';
import { useTheme } from '../../../theme/ThemeProvider';
import { formatDuration } from '../../../utils/format';
import { isValidYoutubeUrl } from '../../../utils/youtube';
import * as dubbingApi from '../api';
import { dubFormSchema, type DubFormValues } from '../schemas';
import type { LocalVideo, VoiceGender } from '../types';
import { SampleVideos } from './SampleVideos';

type Source = 'youtube' | 'file';

const SOURCE_OPTIONS = [
  { value: 'youtube' as const, label: 'Havola', icon: Youtube },
  { value: 'file' as const, label: 'Fayl', icon: FileVideo },
];

// Saytdagi UrlInput ovoz plitkalari bilan bir xil matn
const VOICE_OPTIONS: { value: VoiceGender; label: string; desc: string }[] = [
  { value: 'auto', label: 'Avtomatik', desc: 'Spikerga qarab' },
  { value: 'male', label: 'Erkak', desc: 'Chuqur, ishonchli' },
  { value: 'female', label: 'Ayol', desc: 'Yumshoq, aniq' },
];

const LANGUAGE_OPTIONS: { value: dubbingApi.SourceLanguage; label: string }[] = [
  { value: 'auto', label: 'Boshqa til (Ingliz, Rus, Turk...) → Oʻzbekcha tarjima' },
  { value: 'uz', label: 'Video oʻzbek tilida (faqat matnga aylantirish)' },
];

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

/** Bosh sahifadagi "Dublyaj" va "Subtitr" tablari -- saytdagi DubbingForm / SubtitleForm. */
export function DubForm({ mode = 'dub' }: { mode?: 'dub' | 'subtitle' }) {
  const router = useRouter();
  const { colors } = useTheme();
  const authStatus = useAuthStore((s) => s.status);
  const signedIn = authStatus === 'signedIn';
  // Sessiya hali aniqlanmagan (ilova endi ochildi) -- kirish sahifasiga noto'g'ri yubormaylik
  const authPending = authStatus === 'idle' || authStatus === 'loading';
  const { pendingUrl, pendingFile, clear: clearShared } = useShareStore();
  const subtitleOnly = mode === 'subtitle';

  const [source, setSource] = useState<Source>('youtube');
  const [language, setLanguage] = useState<dubbingApi.SourceLanguage>('auto');
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
  const voiceGender = watch('voiceGender');
  const debouncedUrl = useDebouncedValue(urlValue, 500);
  const urlLooksValid = source === 'youtube' && isValidYoutubeUrl(debouncedUrl.trim());

  const videoInfoQuery = useQuery({
    queryKey: ['video-info', debouncedUrl],
    queryFn: () => dubbingApi.getVideoInfo(debouncedUrl.trim()),
    enabled: urlLooksValid,
    retry: false,
  });

  const youtubeMutation = useMutation({
    mutationFn: (values: DubFormValues) =>
      dubbingApi.createJob(values.youtubeUrl.trim(), values.voiceGender, subtitleOnly, language),
    onSuccess: (data) => {
      clearShared();
      router.push(`/video/${data.job_id}`);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, voiceGender: g }: { file: LocalVideo; voiceGender: VoiceGender }) =>
      dubbingApi.uploadVideo(file, { subtitleOnly, voiceGender: g, sourceLanguage: language }, setProgress),
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

  const clearVideo = () => {
    clearShared();
    setVideo(null);
    setVideoError(null);
    uploadMutation.reset();
  };

  const submitFile = (g: VoiceGender) => {
    if (authPending) return;
    if (!signedIn) return router.push('/(auth)/login');
    if (!video) return setVideoError('Avval videoni tanlang.');
    if (!videoError) uploadMutation.mutate({ file: video, voiceGender: g });
  };

  const onSubmit = handleSubmit(
    (values) => {
      if (source === 'file') return submitFile(values.voiceGender);
      if (authPending) return;
      if (!signedIn) return router.push('/(auth)/login');
      youtubeMutation.mutate(values);
    },
    // Fayl rejimida YouTube havolasi bo'sh -- validatsiya xatosiga qaramay yuboramiz
    () => {
      if (source === 'file') submitFile(watch('voiceGender'));
    },
  );

  const mutationError = source === 'youtube' ? youtubeMutation.error : uploadMutation.error;
  const busy = youtubeMutation.isPending || uploadMutation.isPending;
  const urlEmpty = !urlValue.trim();

  // Saytdagidek: kirmagan foydalanuvchi ham shu tugmani ko'radi, bosganda kirish sahifasiga o'tadi
  const submitLabel = busy
      ? subtitleOnly
        ? 'Subtitr yaratilmoqda...'
        : 'Yaratilmoqda...'
      : subtitleOnly
        ? 'Subtitr yaratish'
        : 'Dublaj qilish';

  return (
    <View style={styles.form}>
      <UnderlineTabs options={SOURCE_OPTIONS} value={source} onChange={setSource} />

      {subtitleOnly && (
        <View style={styles.field}>
          <ThemedText style={styles.label}>Video tili</ThemedText>
          <View accessibilityRole="radiogroup" style={styles.stack}>
            {LANGUAGE_OPTIONS.map((o) => (
              <ChoiceTile key={o.value} title={o.label} selected={language === o.value} onPress={() => setLanguage(o.value)} style={styles.langTile} />
            ))}
          </View>
          <ThemedText variant="secondary" style={styles.hint}>
            {language === 'uz'
              ? 'Videodagi oʻzbekcha nutq toʻgʻridan-toʻgʻri oʻzbekcha subtitrga aylantiriladi (tarjimasiz).'
              : 'Chet tildagi (ingliz, rus, turk va b.) nutq avtomatik aniqlanib, oʻzbekchaga tarjima qilinadi.'}
          </ThemedText>
        </View>
      )}

      {source === 'youtube' ? (
        <View style={styles.field}>
          <Controller
            control={control}
            name="youtubeUrl"
            render={({ field: { onChange, onBlur, value } }) => (
              <UrlField
                hideLabel={!subtitleOnly}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.youtubeUrl?.message}
                placeholder={subtitleOnly ? 'YouTube havolasini kiriting...' : undefined}
                onSubmitEditing={onSubmit}
              />
            )}
          />
          <PrimaryButton label={submitLabel} size="lg" onPress={onSubmit} loading={busy} disabled={urlEmpty} />
          {urlEmpty && !busy && (
            <ThemedText variant="secondary" style={styles.hint}>
              {subtitleOnly
                ? 'Oʻzbekcha subtitr (.srt/.vtt) yaratiladi — dublyaj audiosi yoʻq, tezroq.'
                : 'Havolani qoʻying yoki pastdagi namunalardan birini tanlang.'}
            </ThemedText>
          )}
        </View>
      ) : (
        <View style={styles.field}>
          <ThemedText style={styles.label}>Video fayl</ThemedText>
          {!video ? (
            <Pressable
              onPress={pickVideo}
              disabled={busy}
              accessibilityRole="button"
              accessibilityHint="Galereya ochiladi"
              style={({ pressed }) => [
                styles.dropzone,
                { borderColor: pressed ? colors.muted : colors.rule, backgroundColor: pressed ? colors.ground : colors.surface },
              ]}
            >
              <UploadCloud size={32} color={colors.muted} strokeWidth={2} />
              <ThemedText style={styles.dropTitle}>Video faylni tanlang</ThemedText>
              <ThemedText variant="secondary" style={styles.dropMeta}>
                MP4, MOV, MKV yoki WebM · 1 GB gacha · 120 daqiqagacha
              </ThemedText>
            </Pressable>
          ) : (
            <View style={[styles.fileRow, { borderColor: videoError ? colors.red : colors.rule }]}>
              <FileVideo size={24} color={colors.muted} strokeWidth={2} />
              <Pressable style={styles.fileInfo} onPress={busy ? undefined : pickVideo} accessibilityHint="Boshqa video tanlash">
                <ThemedText numberOfLines={1} style={styles.fileName}>
                  {video.name}
                </ThemedText>
                <ThemedText variant="secondary" style={styles.fileMeta}>
                  {[video.durationMs ? formatDuration(video.durationMs / 1000) : '', formatSize(video.size)].filter(Boolean).join(' · ')}
                </ThemedText>
              </Pressable>
              {!busy && (
                <Pressable
                  onPress={clearVideo}
                  accessibilityRole="button"
                  accessibilityLabel="Faylni olib tashlash"
                  hitSlop={6}
                  style={({ pressed }) => [styles.removeFile, pressed && { backgroundColor: alpha(colors.red, 0.1) }]}
                >
                  <X size={16} color={colors.muted} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          )}
          {videoError ? (
            <ThemedText style={[styles.hint, { color: colors.redInk }]}>{videoError}</ThemedText>
          ) : (
            <ThemedText variant="secondary" style={styles.hint}>
              {subtitleOnly
                ? 'Qurilmangizdagi videodan oʻzbekcha subtitr yaratiladi.'
                : 'Qurilmangizdagi video toʻliq oʻzbek tiliga sunʼiy intellekt orqali tarjima qilinib, dublyaj qilinadi.'}
            </ThemedText>
          )}
        </View>
      )}

      {mutationError && (
        <Notice>
          {mutationError instanceof dubbingApi.UploadError
            ? mutationError.message
            : getErrorMessage(mutationError, 'Yuborishda xatolik yuz berdi.')}
        </Notice>
      )}

      {source === 'youtube' && videoInfoQuery.data && (
        <View style={[styles.preview, { borderColor: colors.rule, backgroundColor: colors.ground }]}>
          <Image source={{ uri: videoInfoQuery.data.thumbnail }} style={styles.thumbnail} contentFit="cover" />
          <View style={styles.fileInfo}>
            <ThemedText numberOfLines={2} style={styles.previewTitle}>
              {videoInfoQuery.data.title}
            </ThemedText>
            <ThemedText variant="secondary" style={styles.fileMeta}>
              {[videoInfoQuery.data.uploader, formatDuration(videoInfoQuery.data.duration)].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
        </View>
      )}

      {source === 'youtube' && !subtitleOnly && (
        <SampleVideos
          activeUrl={urlValue}
          onSelect={(s) => {
            setValue('youtubeUrl', s.url, { shouldValidate: true });
            setValue('voiceGender', s.gender);
          }}
        />
      )}

      {!subtitleOnly && (
        <View style={styles.field}>
          <ThemedText style={styles.label}>{source === 'file' ? 'Ovoz jinsi' : 'Ovoz'}</ThemedText>
          <View accessibilityRole="radiogroup" style={styles.grid3}>
            {VOICE_OPTIONS.map((o) => (
              <ChoiceTile
                key={o.value}
                title={o.label}
                description={o.desc}
                selected={voiceGender === o.value}
                onPress={() => setValue('voiceGender', o.value)}
                style={styles.cell3}
              />
            ))}
          </View>
        </View>
      )}

      {progress !== null && (
        <View style={styles.field}>
          <View style={[styles.bar, { backgroundColor: colors.ground }]}>
            <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent }]} />
          </View>
          <ThemedText variant="secondary" style={[styles.hint, { fontVariant: ['tabular-nums'] }]}>
            Video yuborilmoqda… {Math.round(progress * 100)}%
          </ThemedText>
        </View>
      )}

      {source === 'file' && (
        <PrimaryButton label={submitLabel} size="lg" onPress={onSubmit} loading={busy} disabled={!video || !!videoError} />
      )}

      {subtitleOnly ? (
        <FeatureDots items={['SRT', 'VTT', 'Vaqt kodlari', language === 'uz' ? 'Oʻzbekcha STT (tarjimasiz)' : 'Oʻzbekcha tarjima']} />
      ) : (
        <View style={[styles.rules, { borderTopColor: colors.rule }]}>
          <Info size={16} color={colors.muted} strokeWidth={2} style={styles.rulesIcon} />
          <ThemedText variant="secondary" style={styles.rulesText}>
            Diniy, 18+, zoʻravonlik yoki noqonuniy faoliyatga oid videolarni yubormang (bolalarga oid jinsiy kontent umuman
            qabul qilinmaydi).{' '}
            <ThemedText onPress={() => router.push('/terms')} suppressHighlighting style={styles.rulesLink}>
              Foydalanish shartlari
            </ThemedText>
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 24 },
  field: { gap: 8 },
  stack: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  hint: { fontSize: 14, lineHeight: 20 },
  langTile: { minHeight: 0 },
  dropzone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  dropTitle: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
  dropMeta: { fontSize: 14, textAlign: 'center' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 14,
  },
  fileInfo: { flex: 1, minWidth: 0, gap: 2 },
  fileName: { fontSize: 15, fontWeight: '500' },
  fileMeta: { fontSize: 14 },
  removeFile: { padding: 8, borderRadius: radius.tab },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderRadius: radius.control,
    padding: 12,
  },
  thumbnail: { width: 96, height: 56, borderRadius: 8 },
  previewTitle: { fontSize: 15, fontWeight: '500', lineHeight: 20 },
  grid3: { flexDirection: 'row', gap: 8 },
  cell3: { flex: 1 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  rules: { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingTop: 16 },
  rulesIcon: { marginTop: 2 },
  rulesText: { flex: 1, fontSize: 13, lineHeight: 21 },
  rulesLink: { fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },
});
