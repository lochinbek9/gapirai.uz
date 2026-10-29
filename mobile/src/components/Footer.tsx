import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Mail, Send } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { SITE_URL } from '../config/env';
import { radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { Instagram, Youtube } from './BrandIcons';
import { ThemedText } from './ThemedText';

type Link = { label: string } & ({ href: Href } | { url: string });

const PROJECT: Link[] = [
  { label: 'Loyiha haqida', href: '/about' },
  { label: 'Ommaviy videolar', url: `${SITE_URL}/videos` },
  { label: 'Tariflar', href: '/pricing' },
  { label: 'Loyihani qoʻllab-quvvatlash', url: `${SITE_URL}/donate` },
];

const COMMUNITY: Link[] = [
  { label: 'Hamjamiyat', url: 'https://t.me/gapir_uz_muhokama' },
  { label: 'Foydalanish shartlari', href: '/terms' },
  { label: 'Maxfiylik siyosati', href: '/privacy' },
  { label: 'Yordam va savollar', href: '/faq' },
];

const SOCIAL: { label: string; url: string; icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }[] = [
  { label: 'Telegram kanalimiz', url: 'https://t.me/gapirai_uz', icon: Send },
  { label: 'YouTube kanalimiz', url: 'https://youtube.com', icon: Youtube },
  { label: 'Instagram sahifamiz', url: 'https://www.instagram.com/gapirai_uz/', icon: Instagram },
  { label: 'Bizga email yozing', url: 'mailto:lodexgroups@gmail.com', icon: Mail },
];

const LOGO_LIGHT = require('../../assets/logo.png');
const LOGO_DARK = require('../../assets/logo-dark.png');

/** Saytdagi Footer: ground fon, logotip + tavsif, "Loyiha", "Hamjamiyat va qoidalar", ijtimoiy tarmoqlar. */
export function Footer() {
  const { colors, mode } = useTheme();
  const router = useRouter();

  const open = (l: Link) => {
    if ('href' in l) return router.push(l.href);
    if (l.url.startsWith('http')) WebBrowser.openBrowserAsync(l.url).catch(() => {});
    else Linking.openURL(l.url).catch(() => {});
  };

  const column = (title: string, links: Link[]) => (
    <View>
      <ThemedText accessibilityRole="header" style={styles.colTitle}>
        {title}
      </ThemedText>
      <View style={styles.links}>
        {links.map((l) => (
          <Pressable key={l.label} onPress={() => open(l)} accessibilityRole="link" hitSlop={4}>
            {({ pressed }) => (
              <ThemedText style={[styles.link, { color: pressed ? colors.ink : colors.muted }]}>{l.label}</ThemedText>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.footer, { backgroundColor: colors.ground, borderTopColor: colors.rule }]}>
      <View style={styles.brand}>
        <Image source={mode === 'dark' ? LOGO_DARK : LOGO_LIGHT} style={styles.logo} contentFit="contain" />
        <ThemedText variant="secondary" style={styles.about}>
          Videolarni sunʼiy intellekt yordamida oʻzbek tiliga dublyaj qiluvchi platforma.
        </ThemedText>
        <ThemedText variant="secondary" style={styles.copy}>
          © {new Date().getFullYear()} GapirAI.uz. Barcha huquqlar himoyalangan.
        </ThemedText>
      </View>
      {column('Loyiha', PROJECT)}
      {column('Hamjamiyat va qoidalar', COMMUNITY)}
      <View>
        <ThemedText accessibilityRole="header" style={styles.colTitle}>
          Ijtimoiy tarmoqlar
        </ThemedText>
        <View style={styles.socialRow}>
          {SOCIAL.map(({ label, url, icon: Icon }) => (
            <Pressable
              key={label}
              onPress={() => open({ label, url })}
              accessibilityRole="link"
              accessibilityLabel={label}
              style={({ pressed }) => [styles.social, { borderColor: colors.rule }, pressed && { backgroundColor: colors.surface }]}
            >
              <Icon size={16} color={colors.muted} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 56, gap: 40 },
  brand: { gap: 16 },
  logo: { width: 45, height: 32 },
  about: { fontSize: 15, lineHeight: 24, maxWidth: 300 },
  copy: { fontSize: 14 },
  colTitle: { fontSize: 14, fontWeight: '500' },
  links: { marginTop: 12, gap: 4 },
  link: { fontSize: 15, paddingVertical: 6 },
  socialRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  social: {
    width: 40,
    height: 40,
    borderRadius: radius.tab,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
