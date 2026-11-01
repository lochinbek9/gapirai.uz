import { Image } from 'expo-image';
import { usePathname, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  CreditCard,
  Heart,
  HelpCircle,
  Info,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Moon,
  PlaySquare,
  Send,
  Sun,
  UserPlus,
  Video,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PAYMENTS_ENABLED, SITE_URL } from '../config/env';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { Instagram, type IconComponent } from './BrandIcons';
import { PrimaryButton } from './PrimaryButton';
import { ThemedText } from './ThemedText';

const LOGO_LIGHT = require('../../assets/logo.png');
const LOGO_DARK = require('../../assets/logo-dark.png');

type MenuLink = { label: string; icon: LucideIcon } & ({ href: Href } | { url: string });

/** Saytdagi SiteHeader: 64px, oq fon, pastda ingichka chiziq; logotip, asosiy tugma,
 *  mavzu almashtirgich va menyu. Ichki sahifalarda chapda "orqaga" strelkasi. */
export function AppHeader({ back }: { back?: boolean }) {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const signedIn = status === 'signedIn';
  const setPreference = useThemeStore((s) => s.setPreference);
  const [menuOpen, setMenuOpen] = useState(false);

  const showBack = back ?? (pathname !== '/' && router.canGoBack());

  return (
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.rule }]}>
      {showBack && (
        <IconButton icon={ArrowLeft} label="Orqaga" onPress={() => router.back()} style={styles.backButton} />
      )}
      <Pressable
        onPress={() => router.navigate('/')}
        accessibilityRole="link"
        accessibilityLabel="GapirAI.uz — bosh sahifa"
        hitSlop={6}
      >
        <Image source={mode === 'dark' ? LOGO_DARK : LOGO_LIGHT} style={styles.logo} contentFit="contain" />
      </Pressable>

      <View style={styles.actions}>
        {status === 'idle' || status === 'loading' ? null : signedIn ? (
          <PrimaryButton label="Videolarim" size="sm" fullWidth={false} onPress={() => router.push('/dashboard')} />
        ) : (
          // Ilovada reklama chaqirig'i emas, oddiy "Kirish" (ro'yxatdan o'tish taklifi bosh ekranda)
          <PrimaryButton label="Kirish" variant="secondary" size="sm" fullWidth={false} onPress={() => router.push('/(auth)/login')} />
        )}
        <IconButton
          icon={mode === 'dark' ? Sun : Moon}
          label={mode === 'dark' ? 'Yorugʻ mavzu' : 'Qorongʻi mavzu'}
          onPress={() => setPreference(mode === 'dark' ? 'light' : 'dark')}
        />
        <IconButton icon={Menu} label="Menyu" onPress={() => setMenuOpen(true)} />
      </View>

      <NavSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

function IconButton({
  icon: Icon,
  label,
  onPress,
  style,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  style?: object;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.ground }, style]}
    >
      <Icon size={20} color={colors.muted} strokeWidth={2} />
    </Pressable>
  );
}

/** Saytdagi MobileNavMenu -- Android'da pastdan chiqadigan varaq (bottom sheet). */
function NavSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const signOut = useAuthStore((s) => s.signOut);

  // Play build'da to'lovga olib boruvchi bandlar (tariflar, donat, hisob) yo'q -- config/env.ts
  const main: MenuLink[] = [
    { label: 'Ommaviy videolar', icon: PlaySquare, href: '/videos' },
    ...(PAYMENTS_ENABLED
      ? [
          { label: 'Tariflar', icon: CreditCard, href: '/pricing' as const },
          { label: 'Donat', icon: Heart, url: `${SITE_URL}/donate` },
        ]
      : []),
    { label: 'Loyiha haqida', icon: Info, href: '/about' },
    { label: 'Yordam va savollar', icon: HelpCircle, href: '/faq' },
    { label: 'Telegram bot', icon: Send, url: 'https://t.me/gapirai_uz_bot' },
  ];
  const account: MenuLink[] = signedIn
    ? [
        { label: 'Mening videolarim', icon: Video, href: '/dashboard' },
        ...(PAYMENTS_ENABLED ? [{ label: 'Hisob va toʻlovlar', icon: Wallet, href: '/billing' as const }] : []),
      ]
    : [
        { label: 'Kirish', icon: LogIn, href: '/(auth)/login' },
        { label: 'Roʻyxatdan oʻtish', icon: UserPlus, href: '/(auth)/register' },
      ];

  const go = (link: MenuLink) => {
    onClose();
    if ('url' in link) WebBrowser.openBrowserAsync(link.url).catch(() => {});
    else router.push(link.href);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Menyuni yopish" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, borderColor: colors.rule, paddingBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.rule }]} />
        <View style={styles.sheetHead}>
          <ThemedText style={styles.sheetTitle}>Menyu</ThemedText>
          <IconButton icon={X} label="Menyuni yopish" onPress={onClose} />
        </View>
        {main.map((l) => (
          <MenuRow key={l.label} link={l} onPress={() => go(l)} />
        ))}
        <View style={[styles.divider, { backgroundColor: colors.rule }]} />
        {account.map((l) => (
          <MenuRow key={l.label} link={l} onPress={() => go(l)} />
        ))}
        {signedIn && (
          <MenuRow
            link={{ label: 'Chiqish', icon: LogOut, href: '/' }}
            onPress={() => {
              onClose();
              signOut();
            }}
          />
        )}
        <SheetFooter onNavigate={go} />
      </View>
    </Modal>
  );
}

// Saytda footer'dagi qoidalar va ijtimoiy havolalar; ilovada footer yo'q, shuning uchun menyu ostida
const SMALL_LINKS: { label: string; href?: Href; url?: string }[] = [
  { label: 'Foydalanish shartlari', href: '/terms' },
  { label: 'Maxfiylik siyosati', href: '/privacy' },
  { label: 'Hamjamiyat', url: 'https://t.me/gapir_uz_muhokama' },
];
const SOCIAL: { label: string; url: string; icon: IconComponent }[] = [
  { label: 'Telegram kanalimiz', url: 'https://t.me/gapirai_uz', icon: Send },
  { label: 'Instagram sahifamiz', url: 'https://www.instagram.com/gapirai_uz/', icon: Instagram },
  { label: 'Bizga email yozing', url: 'mailto:lodexgroups@gmail.com', icon: Mail },
];

function SheetFooter({ onNavigate }: { onNavigate: (link: MenuLink) => void }) {
  const { colors } = useTheme();
  const open = (l: { label: string; href?: Href; url?: string }) => {
    if (l.href) return onNavigate({ label: l.label, icon: Info, href: l.href });
    if (l.url?.startsWith('mailto:')) return Linking.openURL(l.url).catch(() => {});
    if (l.url) onNavigate({ label: l.label, icon: Info, url: l.url });
  };
  return (
    <View style={[styles.sheetFoot, { borderTopColor: colors.rule }]}>
      <View style={styles.smallLinks}>
        {SMALL_LINKS.map((l) => (
          <Pressable key={l.label} onPress={() => open(l)} accessibilityRole="link" hitSlop={6}>
            {({ pressed }) => (
              <ThemedText style={[styles.smallLink, { color: pressed ? colors.ink : colors.muted }]}>{l.label}</ThemedText>
            )}
          </Pressable>
        ))}
      </View>
      <View style={styles.socialRow}>
        {SOCIAL.map(({ label, url, icon: Icon }) => (
          <Pressable
            key={label}
            onPress={() => open({ label, url })}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.social, pressed && { backgroundColor: colors.ground }]}
          >
            <Icon size={18} color={colors.muted} strokeWidth={2} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MenuRow({ link, onPress }: { link: MenuLink; onPress: () => void }) {
  const { colors } = useTheme();
  const Icon = link.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={'url' in link ? 'link' : 'button'}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.ground }]}
    >
      <Icon size={18} color={colors.muted} strokeWidth={2} />
      <ThemedText style={styles.rowLabel}>{link.label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { marginLeft: -8, marginRight: 4 },
  logo: { width: 45, height: 32 },
  actions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 40, height: 40, borderRadius: radius.tab, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.tab },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6, marginHorizontal: 12 },
  sheetFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    marginHorizontal: 12,
    paddingTop: 12,
  },
  smallLinks: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  smallLink: { fontSize: 13 },
  socialRow: { flexDirection: 'row', gap: 2, marginRight: -10 },
  social: { width: 40, height: 40, borderRadius: radius.tab, alignItems: 'center', justifyContent: 'center' },
});
