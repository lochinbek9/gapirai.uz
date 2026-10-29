import { CheckCircle2, CircleSlash, Clock, Loader2, MicOff, ShieldAlert, XCircle } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { alpha } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';

const LABELS: Record<string, string> = {
  pending: 'Navbatda',
  awaiting_payment: 'Toʻlov kutilmoqda',
  downloading: 'Yuklanmoqda',
  extracting_audio: 'Audio ajratilmoqda',
  transcribing: 'Matnga aylantirilmoqda',
  translating: 'Tarjima qilinmoqda',
  syncing: 'Talaffuzga moslashtirilmoqda',
  synthesizing: 'Ovoz yaratilmoqda',
  merging: 'Birlashtirilmoqda',
  analyzing: 'Tahlil qilinmoqda',
  completed: 'Tayyor',
  failed: 'Xatolik',
};

/** Saytdagi dashboard StatusBadge: holatga qarab rangli "pill". */
export function StatusBadge({ status, errorCode, errorMessage }: { status: string; errorCode?: string | null; errorMessage?: string | null }) {
  const { colors, mode } = useTheme();
  const msg = errorMessage?.toLowerCase() ?? '';
  const amber = mode === 'dark' ? '#FBBF24' : '#D97706';

  let tone = colors.accentInk;
  let base = colors.accent;
  let Icon = status === 'pending' ? Clock : Loader2;
  let label = LABELS[status] ?? status;

  if (status === 'completed') {
    tone = colors.greenInk;
    base = colors.green;
    Icon = CheckCircle2;
  } else if (status === 'failed') {
    if (errorCode === 'USER_CANCELLED' || msg.includes('user cancelled') || msg.includes('bekor qilindi')) {
      tone = colors.muted;
      base = colors.muted;
      Icon = CircleSlash;
      label = 'Bekor qilindi';
    } else if (errorCode === 'NO_SPEECH_FOUND' || msg.includes('nutq topilmadi')) {
      tone = amber;
      base = '#F59E0B';
      Icon = MicOff;
      label = 'Nutq topilmadi';
    } else if (errorCode === 'CONTENT_BLOCKED' || msg.includes('kontent siyosati') || msg.includes('taqiqlangan')) {
      tone = colors.redInk;
      base = colors.red;
      Icon = ShieldAlert;
      label = 'Rad etildi';
    } else {
      tone = colors.redInk;
      base = colors.red;
      Icon = XCircle;
    }
  }

  return (
    <View style={[styles.badge, { backgroundColor: alpha(base, 0.1), borderColor: alpha(base, 0.2) }]}>
      <Icon size={12} color={tone} strokeWidth={2} />
      <ThemedText style={[styles.text, { color: tone }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: '600' },
});
