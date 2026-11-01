import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { FileText, Sparkles, UploadCloud, X } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '../../../api/errors';
import { Youtube } from '../../../components/BrandIcons';
import { FeatureDots } from '../../../components/FeatureDots';
import { Notice } from '../../../components/Notice';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { SelectField } from '../../../components/SelectField';
import { ThemedText } from '../../../components/ThemedText';
import { UnderlineTabs } from '../../../components/UnderlineTabs';
import { UrlField } from '../../../components/UrlField';
import { useAuthStore } from '../../../store/useAuthStore';
import { alpha, radius } from '../../../theme/colors';
import { useTheme } from '../../../theme/ThemeProvider';
import * as analysisApi from '../api';
import { analyzeFormSchema, type AnalyzeFormValues } from '../schemas';
import { ANALYSIS_LANGUAGE_OPTIONS, type AnalysisLanguage } from '../types';

type Source = 'youtube' | 'document';
const SOURCE_OPTIONS = [
  { value: 'youtube' as const, label: 'Havola', icon: Youtube },
  { value: 'document' as const, label: 'Hujjat', icon: FileText },
];

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  return bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function documentError(doc: analysisApi.LocalDocument): string | null {
  const name = doc.name.toLowerCase();
  if (!analysisApi.DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'Faqat PDF, DOCX, TXT, PPTX yoki EPUB fayllar qabul qilinadi.';
  if (doc.size && doc.size > analysisApi.DOCUMENT_MAX_BYTES) return `Fayl 20 MB dan katta (${formatSize(doc.size)}).`;
  return null;
}

/** Bosh sahifadagi "Tahlil" tabi -- saytdagi AnalysisForm: YouTube havolasi yoki hujjat
 *  (PDF, DOCX, TXT, PPTX, EPUB). */
export function AnalyzeForm() {
  const router = useRouter();
  const { colors } = useTheme();
  const authStatus = useAuthStore((s) => s.status);
  const isLoggedIn = authStatus === 'signedIn';
  const [source, setSource] = useState<Source>('youtube');
  const [doc, setDoc] = useState<analysisApi.LocalDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AnalyzeFormValues>({
    resolver: zodResolver(analyzeFormSchema),
    defaultValues: { youtubeUrl: '', language: 'uz' },
  });

  const open = (data: { analysis_id: string }) => router.push(`/video-analysis/${data.analysis_id}`);

  const mutation = useMutation({
    mutationFn: (values: AnalyzeFormValues) => analysisApi.createAnalysis(values.youtubeUrl.trim(), values.language),
    onSuccess: open,
  });

  const docMutation = useMutation({
    mutationFn: ({ file, language }: { file: analysisApi.LocalDocument; language: AnalysisLanguage }) =>
      analysisApi.uploadDocument(file, language, setProgress),
    onSuccess: open,
    onSettled: () => setProgress(null),
  });

  // Tahlil yaratish uchun kirish shart (saytdagidek) -- 401 olish o'rniga login'ga yuboramiz
  const requireLogin = () => {
    if (authStatus === 'idle' || authStatus === 'loading') return true;
    if (!isLoggedIn) {
      router.push('/(auth)/login');
      return true;
    }
    return false;
  };

  const onSubmit = handleSubmit((values) => {
    if (requireLogin()) return;
    mutation.mutate(values);
  });

  const onSubmitDocument = () => {
    if (!doc || docError || requireLogin()) return;
    docMutation.mutate({ file: doc, language: watch('language') });
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    const picked = { uri: a.uri, name: a.name, size: a.size, mimeType: a.mimeType };
    setDoc(picked);
    setDocError(documentError(picked));
    docMutation.reset();
  };

  const busy = docMutation.isPending;
  const link = { color: colors.ink, textDecorationLine: 'underline' as const, fontWeight: '500' as const };

  return (
    <View style={styles.form}>
      <UnderlineTabs options={SOURCE_OPTIONS} value={source} onChange={setSource} />

      {source === 'youtube' ? (
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
      ) : (
        <View style={styles.field}>
          {!doc ? (
            <Pressable
              onPress={pickDocument}
              accessibilityRole="button"
              accessibilityHint="Fayllar oynasi ochiladi"
              style={({ pressed }) => [
                styles.dropzone,
                { borderColor: pressed ? colors.muted : colors.rule, backgroundColor: pressed ? colors.ground : colors.surface },
              ]}
            >
              <UploadCloud size={32} color={colors.muted} strokeWidth={2} />
              <ThemedText style={styles.dropTitle}>Hujjatni tanlang</ThemedText>
              <ThemedText variant="secondary" style={styles.dropMeta}>
                PDF, DOCX, TXT, PPTX, EPUB · 20 MB gacha · bepul 30 betgacha
              </ThemedText>
            </Pressable>
          ) : (
            <View style={[styles.fileRow, { borderColor: docError ? colors.red : colors.rule }]}>
              <FileText size={24} color={colors.muted} strokeWidth={2} />
              <Pressable style={styles.fileInfo} onPress={busy ? undefined : pickDocument} accessibilityHint="Boshqa hujjat tanlash">
                <ThemedText numberOfLines={1} style={styles.fileName}>
                  {doc.name}
                </ThemedText>
                {doc.size ? (
                  <ThemedText variant="secondary" style={styles.fileMeta}>
                    {formatSize(doc.size)}
                  </ThemedText>
                ) : null}
              </Pressable>
              {!busy && (
                <Pressable
                  onPress={() => {
                    setDoc(null);
                    setDocError(null);
                    docMutation.reset();
                  }}
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
          {docError ? (
            <ThemedText style={[styles.hint, { color: colors.redInk }]}>{docError}</ThemedText>
          ) : (
            <ThemedText variant="secondary" style={styles.hint}>
              Skanerlangan (rasmdan iborat) PDF ham oʻqiladi — bunda tahlil biroz uzoqroq davom etadi.
            </ThemedText>
          )}
        </View>
      )}

      <Controller
        control={control}
        name="language"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Tahlil tili"
            value={value}
            options={ANALYSIS_LANGUAGE_OPTIONS}
            onChange={onChange}
            hint={
              source === 'document'
                ? 'Xulosa, boblar, konspekt va test shu tilda chiqadi; hujjat matni oʻzgarmaydi.'
                : 'Transkript doim videoning original tilida qoladi — bu faqat xulosa, boblar, konspekt va test qaysi tilda chiqishini belgilaydi.'
            }
          />
        )}
      />

      {authStatus === 'signedOut' && (
        <Notice tone="warning">
          <ThemedText style={styles.noticeText}>
            {source === 'document' ? 'Hujjat' : 'Video'} tahlili uchun{' '}
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

      {source === 'youtube' && mutation.isError && (
        <Notice>{getErrorMessage(mutation.error, 'Tahlil yaratishda xatolik yuz berdi.')}</Notice>
      )}
      {source === 'document' && docMutation.isError && (
        <Notice>{(docMutation.error as Error).message || 'Hujjatni yuklashda xatolik yuz berdi.'}</Notice>
      )}

      {progress !== null && (
        <View style={styles.field}>
          <View style={[styles.bar, { backgroundColor: colors.ground }]}>
            <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent }]} />
          </View>
          <ThemedText variant="secondary" style={[styles.hint, { fontVariant: ['tabular-nums'] }]}>
            {progress < 1 ? `Yuklanmoqda… ${Math.round(progress * 100)}%` : 'Hujjat oʻqilmoqda…'}
          </ThemedText>
        </View>
      )}

      {source === 'youtube' ? (
        <>
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
        </>
      ) : (
        <PrimaryButton
          label="Hujjatni tahlil qilish"
          icon={Sparkles}
          size="lg"
          onPress={onSubmitDocument}
          loading={busy}
          disabled={!doc || !!docError}
        />
      )}

      <FeatureDots items={['AI Xulosa', 'Asosiy fikrlar', source === 'document' ? 'Matn' : 'Transkript', 'Konspekt', 'Test']} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 24 },
  field: { gap: 8 },
  hint: { fontSize: 14, lineHeight: 20 },
  noticeText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  teaser: { borderTopWidth: 1, paddingTop: 16 },
  teaserText: { fontSize: 16, lineHeight: 24 },
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
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
});
