import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

// Saytdagi kabi Geist 400/500/600 -- app.json'dagi expo-font plugini ilovaga joylaydi
// (ishga tushishda yuklash kutilmaydi). Android'da maxsus shriftning fontWeight'i
// ishlamaydi -- har vazn alohida oila (fayl nomi), shuning uchun weight -> family almashtiriladi.

const FAMILY = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
} as const;

function familyFor(weight: TextStyle['fontWeight']): string {
  const w = typeof weight === 'number' ? weight : parseInt(String(weight ?? '400'), 10) || (weight === 'bold' ? 700 : 400);
  // Sayt 600 dan og'irroq vazn ishlatmaydi -- 700/800/900 ham 600 bo'lib chiqadi
  if (w >= 600) return FAMILY.semibold;
  if (w >= 500) return FAMILY.medium;
  return FAMILY.regular;
}

/** Matn uslubiga Geist oilasini qo'yadi (fontWeight'ni oilaga aylantirib). */
export function withFont(style: StyleProp<TextStyle>): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return flat;
  const { fontWeight, ...rest } = flat;
  return { ...rest, fontFamily: familyFor(fontWeight) };
}
