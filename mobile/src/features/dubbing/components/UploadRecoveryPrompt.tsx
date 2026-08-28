import * as DocumentPicker from 'expo-document-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { useTheme } from '../../../theme/ThemeProvider';
import * as dubbingApi from '../api';

// mobile/app/video/[id].tsx VA mobile/app/learn/[id].tsx ikkalasi ham shu
// komponentni ishlatadi -- YouTube DOWNLOAD bosqichida muvaffaqiyatsiz
// bo'lgan job uchun "videoni qurilmangizdan yuklang" tiklash oqimi
// (backend/api/routes.py: POST /jobs/{id}/upload-video, mavjud,
// o'zgartirilmagan pipeline'ga ulanadi). Muvaffaqiyatli yuklashdan keyin
// hech narsa qilish shart emas -- useDubbingJob job statusi
// pending/downloading'ga o'tganini avtomatik payqaydi, bu blok esa
// job.status !== 'failed' bo'lgani uchun ota ekran tomonidan o'zi
// yashiriladi (mirrors frontend/components/UploadRecoveryPrompt.tsx).

interface UploadRecoveryPromptProps {
  jobId: string;
  onUploaded?: () => void;
}

type UploadState = 'idle' | 'uploading' | 'error' | 'success';

function formatMaxSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
}

export function UploadRecoveryPrompt({ jobId, onUploaded }: UploadRecoveryPromptProps) {
  const { colors } = useTheme();
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startUpload = async (file: { uri: string; name: string; mimeType: string }) => {
    setPendingFile(file);
    setError(null);
    setState('uploading');
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await dubbingApi.uploadVideoFallback(jobId, file, setProgress, controller.signal);
      setState('success');
      onUploaded?.();
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
        setState('idle');
        setPendingFile(null);
        return;
      }
      setError(err?.response?.data?.detail || "Yuklashda xatolik yuz berdi — internet aloqasini tekshirib qayta urinib ko'ring.");
      setState('error');
    } finally {
      abortRef.current = null;
    }
  };

  const handlePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: dubbingApi.UPLOAD_ALLOWED_MIME_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || '';
    if (!dubbingApi.UPLOAD_ALLOWED_MIME_TYPES.includes(mimeType)) {
      setError("Faqat MP4, MOV, MKV yoki WebM formatlar qabul qilinadi.");
      setState('error');
      setPendingFile(null);
      return;
    }
    if (asset.size && asset.size > dubbingApi.UPLOAD_MAX_SIZE_BYTES) {
      setError(`Fayl hajmi ${formatMaxSize(dubbingApi.UPLOAD_MAX_SIZE_BYTES)} dan katta bo'lmasligi kerak.`);
      setState('error');
      setPendingFile(null);
      return;
    }
    startUpload({ uri: asset.uri, name: asset.name, mimeType });
  };

  const handleCancel = () => abortRef.current?.abort();

  const handleRetry = () => {
    if (pendingFile) startUpload(pendingFile);
    else setState('idle');
  };

  if (state === 'success') {
    return (
      <ThemedView style={[styles.box, { borderColor: colors.success, backgroundColor: `${colors.success}1A` }]}>
        <ThemedText style={{ color: colors.success, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
          Video qabul qilindi — ishlov berish boshlandi.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ width: '100%', gap: 10 }}>
      <ThemedView style={{ gap: 2, alignItems: 'center' }}>
        <ThemedText style={{ fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
          Bu videoni havola orqali olishning imkoni bo&apos;lmadi.
        </ThemedText>
        <ThemedText variant="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
          Videoni qurilmangizdan yuklashingiz mumkin.
        </ThemedText>
      </ThemedView>

      {state === 'uploading' ? (
        <ThemedView style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={colors.accent} />
            <ThemedText numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
              {pendingFile?.name}
            </ThemedText>
            <ThemedText variant="secondary" style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
              {progress}%
            </ThemedText>
          </ThemedView>
          <ThemedView style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <ThemedView style={[styles.progressFill, { backgroundColor: colors.accent, width: `${progress}%` }]} />
          </ThemedView>
          <Pressable onPress={handleCancel} hitSlop={8} style={{ alignSelf: 'center' }}>
            <ThemedText variant="secondary" style={{ fontSize: 12, fontWeight: '600' }}>
              Bekor qilish
            </ThemedText>
          </Pressable>
        </ThemedView>
      ) : (
        <>
          <Pressable
            onPress={handlePick}
            style={[styles.dropzone, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <ThemedText style={{ fontSize: 22 }}>📁</ThemedText>
            <ThemedText style={{ fontSize: 13, fontWeight: '700' }}>Videoni yuklash</ThemedText>
            <ThemedText variant="secondary" style={{ fontSize: 11 }}>
              MP4, MOV, MKV yoki WebM · {formatMaxSize(dubbingApi.UPLOAD_MAX_SIZE_BYTES)} gacha
            </ThemedText>
          </Pressable>

          {state === 'error' && error && (
            <ThemedView style={[styles.box, { borderColor: colors.danger, backgroundColor: `${colors.danger}1A` }]}>
              <ThemedText style={{ color: colors.danger, fontSize: 12 }}>{error}</ThemedText>
              {pendingFile && (
                <Pressable onPress={handleRetry} hitSlop={8}>
                  <ThemedText style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                    Qayta urinish
                  </ThemedText>
                </Pressable>
              )}
            </ThemedView>
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 4,
  },
  box: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
