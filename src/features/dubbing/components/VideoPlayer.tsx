import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { useTheme } from '../../../theme/ThemeProvider';

interface VideoPlayerProps {
  uri: string;
  title?: string;
}

// Plays the dubbed MP4 from GET /api/outputs/{job_id}/video (S3-signed
// redirect or local file stream — see MOBILE_INTEGRATION_AUDIT.md §10).
// Native controls give play/pause/seek/fullscreen for free and match
// platform conventions, per the spec's "respect iOS/Android UX" rule.
// No subtitle overlay yet — not in Phase 5's checklist (source, playback,
// seek, fullscreen, controls, loading, error only).
export function DubbedVideoPlayer({ uri, title }: VideoPlayerProps) {
  const { colors } = useTheme();

  const player = useVideoPlayer({ uri, metadata: title ? { title } : undefined }, (p) => {
    p.loop = false;
  });

  const { status, error } = useEvent(player, 'statusChange', { status: player.status });

  return (
    <ThemedView style={styles.wrapper}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        allowsFullscreen
        contentFit="contain"
      />
      {status === 'loading' && (
        <ThemedView style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color="#ffffff" />
        </ThemedView>
      )}
      {status === 'error' && (
        <ThemedView style={styles.overlay}>
          <ThemedText style={{ color: colors.danger, textAlign: 'center', paddingHorizontal: 16 }}>
            {error?.message || 'Videoni yuklab bo‘lmadi.'}
          </ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
