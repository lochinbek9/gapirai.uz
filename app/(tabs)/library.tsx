import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import * as libraryApi from '../../src/features/library/api';
import type { LibraryItem } from '../../src/features/library/types';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatDuration } from '../../src/utils/format';

// Mirrors frontend/app/library/page.tsx: paginated grid of every dubbed
// video, gated behind a one-time library-access purchase (Click or Payme).
// Moved under (tabs)/ in the bottom-nav redesign (2026-08-22) — no back
// button any more, this is a tab root now, not a pushed screen.
const LIBRARY_ACCESS_PRICE = 5000;
const PAGE_SIZE = 24;

function LibraryCard({ item, locked, onPress }: { item: LibraryItem; locked: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <ThemedView style={styles.thumbWrap}>
        {item.video_thumbnail && (
          <Image source={{ uri: item.video_thumbnail }} style={styles.thumb} contentFit="cover" />
        )}
        {item.video_duration != null && (
          <ThemedView style={styles.durationBadge}>
            <ThemedText style={styles.durationText}>{formatDuration(item.video_duration)}</ThemedText>
          </ThemedView>
        )}
        {locked && (
          <ThemedView style={styles.lockOverlay}>
            <ThemedText style={styles.lockIcon}>🔒</ThemedText>
          </ThemedView>
        )}
      </ThemedView>
      <ThemedText numberOfLines={2} style={styles.cardTitle}>
        {item.video_title || 'Nomsiz video'}
      </ThemedText>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const authStatus = useAuthStore((s) => s.status);
  const isLoggedIn = authStatus === 'signedIn';

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  useEffect(() => {
    libraryApi
      .getLibrary(PAGE_SIZE, 0)
      .then((res) => {
        setItems(res);
        setHasMore(res.length === PAGE_SIZE);
      })
      .catch(() => setError("Ro'yxatni yuklashda xatolik yuz berdi."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (authStatus === 'idle' || authStatus === 'loading' || !isLoggedIn) return;
    libraryApi
      .getLibraryAccess()
      .then((res) => setHasAccess(res.has_access))
      .catch(() => setHasAccess(false));
  }, [authStatus, isLoggedIn]);

  const handleLoadMore = async () => {
    // FlatList can fire onEndReached before the initial page has loaded
    // (an empty/short list already satisfies "near the end"), which would
    // otherwise re-fetch offset=0 and append it on top of the real first
    // page, appending its already-loaded job_ids twice as duplicate keys
    // (found 2026-08-22 on a real device: "Encountered two children with
    // the same key").
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await libraryApi.getLibrary(PAGE_SIZE, items.length);
      setItems((prev) => [...prev, ...res]);
      setHasMore(res.length === PAGE_SIZE);
    } catch {
      setError("Ko'proq videolarni yuklashda xatolik yuz berdi.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePurchase = async (provider: 'click' | 'payme' = 'click') => {
    if (!isLoggedIn) {
      router.push('/(auth)/login');
      return;
    }
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      const res =
        provider === 'payme' ? await libraryApi.purchaseLibraryAccessPayme() : await libraryApi.purchaseLibraryAccess();
      if (res.payment_url) {
        await Linking.openURL(res.payment_url);
        setPurchaseLoading(false);
      } else {
        setHasAccess(true);
        setPurchaseLoading(false);
      }
    } catch {
      setPurchaseError("To'lovni boshlashda xatolik yuz berdi.");
      setPurchaseLoading(false);
    }
  };

  const handleOpen = (item: LibraryItem) => {
    if (!isLoggedIn) {
      router.push('/(auth)/login');
      return;
    }
    if (!hasAccess) {
      handlePurchase();
      return;
    }
    router.push(`/library/${item.job_id}`);
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ThemedView style={styles.header}>
          <ThemedText style={styles.headerTitle}>Ommaviy videolar</ThemedText>
        </ThemedView>

        <FlatList
          data={items}
          keyExtractor={(item) => item.job_id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          ListHeaderComponent={
            <>
              {hasAccess !== true && (
                <ThemedView
                  style={[styles.accessCard, { borderColor: colors.accent, backgroundColor: colors.background }]}
                >
                  <ThemedText style={styles.accessTitle}>
                    Kutubxonaga umrbod kirish — {LIBRARY_ACCESS_PRICE.toLocaleString('uz-UZ')} so&apos;m
                  </ThemedText>
                  <ThemedText variant="secondary" style={styles.accessSubtitle}>
                    Bir martalik to&apos;lov — barcha (hozirgi va kelajakdagi) dublyaj qilingan videolarni cheksiz
                    tomosha qiling
                  </ThemedText>
                  {purchaseError && (
                    <ThemedText style={{ color: colors.danger, fontSize: 12, fontWeight: '600' }}>
                      {purchaseError}
                    </ThemedText>
                  )}
                  <ThemedView style={styles.accessButtons}>
                    <Pressable
                      onPress={() => handlePurchase('click')}
                      disabled={purchaseLoading}
                      style={[styles.accessButton, { backgroundColor: colors.accent, opacity: purchaseLoading ? 0.6 : 1 }]}
                    >
                      {purchaseLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <ThemedText style={styles.accessButtonText}>
                          {isLoggedIn ? "Click orqali to'lash" : 'Kirib, huquq olish'}
                        </ThemedText>
                      )}
                    </Pressable>
                    {isLoggedIn && (
                      <Pressable
                        onPress={() => handlePurchase('payme')}
                        disabled={purchaseLoading}
                        style={[styles.accessButton, { borderWidth: 1, borderColor: colors.border, opacity: purchaseLoading ? 0.6 : 1 }]}
                      >
                        <ThemedText style={[styles.accessButtonText, { color: colors.textPrimary }]}>
                          Payme orqali to&apos;lash
                        </ThemedText>
                      </Pressable>
                    )}
                  </ThemedView>
                </ThemedView>
              )}
              {hasAccess === true && (
                <ThemedText style={[styles.accessGranted, { color: colors.success }]}>
                  ✓ Kutubxonaga kirish huquqingiz bor — istalgan videoni bepul tomosha qiling
                </ThemedText>
              )}
              {loading && (
                <ThemedView style={styles.loadingRow}>
                  <ActivityIndicator color={colors.textSecondary} />
                  <ThemedText variant="secondary" style={{ fontSize: 12, fontWeight: '600' }}>
                    Yuklanmoqda...
                  </ThemedText>
                </ThemedView>
              )}
              {!loading && error && (
                <ThemedText style={{ color: colors.danger, textAlign: 'center', fontSize: 13, fontWeight: '600' }}>
                  {error}
                </ThemedText>
              )}
            </>
          }
          renderItem={({ item }) => (
            <LibraryCard item={item} locked={!hasAccess} onPress={() => handleOpen(item)} />
          )}
          ListEmptyComponent={
            !loading ? (
              <ThemedView style={styles.empty}>
                <ThemedText variant="secondary">Hozircha ommaviy videolar mavjud emas.</ThemedText>
              </ThemedView>
            ) : null
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.textSecondary} /> : null}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  columnWrap: { gap: 12 },
  accessCard: { borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 10, marginBottom: 16 },
  accessTitle: { fontSize: 14, fontWeight: '800' },
  accessSubtitle: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  accessButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  accessButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  accessButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  accessGranted: { fontSize: 12, fontWeight: '700', marginBottom: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 24, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  card: { flex: 1, borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  thumbWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#00000010' },
  thumb: { width: '100%', height: '100%' },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: { fontSize: 22 },
  cardTitle: { fontSize: 12, fontWeight: '700', padding: 10, lineHeight: 16 },
});
