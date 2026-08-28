import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { useTheme } from '../../../theme/ThemeProvider';
import { formatTimestamp } from '../../../utils/format';

interface VideoPlayerProps {
  uri: string;
  title?: string;
}

// Mirrors AnalysisVideoPlayerHandle (mobile/src/features/analysis/components/
// AnalysisVideoPlayer.tsx) so callers (e.g. the Learning Workspace) can seek
// whichever player is currently mounted through one shared interface.
export interface DubbedVideoPlayerHandle {
  seekTo: (seconds: number) => void;
}

const CONTROLS_HIDE_DELAY = 3000;
const SEEK_SECONDS = 10;
const DOUBLE_TAP_DELAY = 300;

// Custom controls (YouTube-style: center play/pause + ±10s, scrubbable
// progress bar, tap-to-toggle, double-tap-to-seek, expand-to-fill
// "fullscreen") instead of expo-video's nativeControls, which only gave a
// generic platform control bar. No device-rotation-to-landscape — that needs
// expo-screen-orientation (a new native dependency + rebuild), not added
// here; "fullscreen" just expands the player to fill the screen in the
// current orientation via a Modal, matching the YouTube app's portrait
// fullscreen mode.
export const DubbedVideoPlayer = forwardRef<DubbedVideoPlayerHandle, VideoPlayerProps>(function DubbedVideoPlayer(
  { uri, title },
  ref,
) {
  const { colors } = useTheme();

  const player = useVideoPlayer({ uri, metadata: title ? { title } : undefined }, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      player.currentTime = seconds;
    },
  }));

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime: playerTime, bufferedPosition } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: player.bufferedPosition,
  });

  const duration = player.duration;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [seekFlash, setSeekFlash] = useState<{ side: 'left' | 'right'; key: number } | null>(null);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; zone: 'left' | 'right' } | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayTime = scrubbing ? scrubTime : playerTime;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showControls = useCallback(
    (autoHide: boolean) => {
      setControlsVisible(true);
      Animated.timing(controlsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      clearHideTimer();
      if (autoHide) {
        hideTimerRef.current = setTimeout(() => {
          Animated.timing(controlsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
            setControlsVisible(false);
          });
        }, CONTROLS_HIDE_DELAY);
      }
    },
    [clearHideTimer, controlsOpacity],
  );

  const hideControlsNow = useCallback(() => {
    clearHideTimer();
    Animated.timing(controlsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setControlsVisible(false);
    });
  }, [clearHideTimer, controlsOpacity]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      hideControlsNow();
    } else {
      showControls(player.playing);
    }
  }, [controlsVisible, hideControlsNow, showControls, player]);

  // Restart the auto-hide timer whenever playback starts; pausing cancels it
  // so controls stay visible (matches YouTube — paused never auto-hides).
  useEffect(() => {
    if (!isPlaying) {
      clearHideTimer();
      return;
    }
    showControls(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  const togglePlayPause = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else if (duration > 0 && playerTime >= duration - 0.25) {
      player.replay();
    } else {
      player.play();
    }
    showControls(true);
  }, [player, duration, playerTime, showControls]);

  const seekBy = useCallback(
    (delta: number) => {
      player.seekBy(delta);
      showControls(true);
    },
    [player, showControls],
  );

  const flashSeek = useCallback(
    (side: 'left' | 'right') => {
      setSeekFlash({ side, key: Date.now() });
      flashOpacity.setValue(1);
      Animated.timing(flashOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setSeekFlash(null);
      });
    },
    [flashOpacity],
  );

  const handleZoneTap = useCallback(
    (zone: 'left' | 'right') => {
      const now = Date.now();
      if (lastTapRef.current && lastTapRef.current.zone === zone && now - lastTapRef.current.time < DOUBLE_TAP_DELAY) {
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapRef.current = null;
        seekBy(zone === 'left' ? -SEEK_SECONDS : SEEK_SECONDS);
        flashSeek(zone);
      } else {
        lastTapRef.current = { time: now, zone };
        singleTapTimerRef.current = setTimeout(() => {
          lastTapRef.current = null;
          toggleControls();
        }, DOUBLE_TAP_DELAY);
      }
    },
    [seekBy, flashSeek, toggleControls],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          clearHideTimer();
          setScrubbing(true);
          const ratio = trackWidth > 0 ? Math.min(1, Math.max(0, evt.nativeEvent.locationX / trackWidth)) : 0;
          setScrubTime(ratio * duration);
        },
        onPanResponderMove: (evt) => {
          const ratio = trackWidth > 0 ? Math.min(1, Math.max(0, evt.nativeEvent.locationX / trackWidth)) : 0;
          setScrubTime(ratio * duration);
        },
        onPanResponderRelease: (evt) => {
          const ratio = trackWidth > 0 ? Math.min(1, Math.max(0, evt.nativeEvent.locationX / trackWidth)) : 0;
          player.currentTime = ratio * duration;
          setScrubbing(false);
          showControls(true);
        },
        onPanResponderTerminate: () => {
          setScrubbing(false);
          showControls(true);
        },
      }),
    [trackWidth, duration, player, showControls, clearHideTimer],
  );

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
    showControls(true);
  }, [showControls]);

  // App-wide orientation is locked to portrait (app.json), so rotate to
  // landscape only while fullscreen and explicitly restore portrait after —
  // both on toggle and on unmount, in case the screen is left (e.g. back
  // navigation) while still fullscreen.
  useEffect(() => {
    if (isFullscreen) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  }, [isFullscreen]);

  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const progressRatio = duration > 0 ? Math.min(1, displayTime / duration) : 0;
  const bufferedRatio = duration > 0 ? Math.min(1, bufferedPosition / duration) : 0;

  const content = (
    <ThemedView style={[styles.wrapper, isFullscreen && styles.wrapperFullscreen]}>
      {isFullscreen && <StatusBar hidden />}
      <VideoView player={player} style={styles.video} nativeControls={false} contentFit="contain" />

      <View style={StyleSheet.absoluteFill} pointerEvents={status === 'error' ? 'none' : 'box-none'}>
        <View style={styles.tapZoneRow} pointerEvents="box-none">
          <Pressable style={styles.tapZone} onPress={() => handleZoneTap('left')} />
          <Pressable style={styles.tapZone} onPress={() => handleZoneTap('right')} />
        </View>
      </View>

      {seekFlash && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.seekFlash,
            seekFlash.side === 'left' ? styles.seekFlashLeft : styles.seekFlashRight,
            { opacity: flashOpacity },
          ]}
        >
          <MaterialCommunityIcons name={seekFlash.side === 'left' ? 'rewind-10' : 'fast-forward-10'} size={30} color="#ffffff" />
        </Animated.View>
      )}

      {status === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color="#ffffff" />
        </View>
      )}

      {status === 'error' && (
        <View style={styles.overlay}>
          <ThemedText style={{ color: colors.danger, textAlign: 'center', paddingHorizontal: 16 }}>
            Videoni yuklab bo‘lmadi — internet aloqasi zaif bo‘lishi mumkin.
          </ThemedText>
          <Pressable
            onPress={() => player.replaceAsync({ uri, metadata: title ? { title } : undefined })}
            style={[styles.retryButton, { backgroundColor: colors.accent }]}
          >
            <ThemedText style={styles.retryLabel}>Qayta urinish</ThemedText>
          </Pressable>
        </View>
      )}

      {controlsVisible && status !== 'error' && (
        <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]} pointerEvents="box-none">
          <View style={styles.topBar} pointerEvents="box-none">
            {isFullscreen && (
              <Pressable onPress={toggleFullscreen} hitSlop={12} style={styles.topBarButton}>
                <MaterialCommunityIcons name="fullscreen-exit" size={22} color="#ffffff" />
              </Pressable>
            )}
            {isFullscreen && title && (
              <Text style={styles.titleText} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>

          <View style={styles.centerControls} pointerEvents="box-none">
            <Pressable onPress={() => seekBy(-SEEK_SECONDS)} hitSlop={12} style={styles.sideButton}>
              <MaterialCommunityIcons name="rewind-10" size={26} color="#ffffff" />
            </Pressable>
            <Pressable onPress={togglePlayPause} hitSlop={12} style={styles.playButton}>
              <MaterialCommunityIcons name={isPlaying ? 'pause' : 'play'} size={34} color="#ffffff" />
            </Pressable>
            <Pressable onPress={() => seekBy(SEEK_SECONDS)} hitSlop={12} style={styles.sideButton}>
              <MaterialCommunityIcons name="fast-forward-10" size={26} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.bottomBar} pointerEvents="box-none">
            <Text style={styles.timeText}>{formatTimestamp(displayTime)}</Text>
            <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)} {...panResponder.panHandlers}>
              <View style={styles.trackBackground} />
              <View style={[styles.trackBuffered, { width: `${bufferedRatio * 100}%` }]} />
              <View style={[styles.trackProgress, { width: `${progressRatio * 100}%`, backgroundColor: colors.accent }]} />
              <View
                style={[
                  styles.trackThumb,
                  scrubbing && styles.trackThumbActive,
                  { left: `${progressRatio * 100}%`, backgroundColor: colors.accent },
                ]}
              />
            </View>
            <Text style={styles.timeText}>{formatTimestamp(duration)}</Text>
            <Pressable onPress={toggleFullscreen} hitSlop={12} style={styles.topBarButton}>
              <MaterialCommunityIcons name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'} size={20} color="#ffffff" />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </ThemedView>
  );

  if (isFullscreen) {
    return (
      <Modal visible animationType="fade" statusBarTranslucent onRequestClose={toggleFullscreen}>
        {content}
      </Modal>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  wrapperFullscreen: {
    flex: 1,
    width: '100%',
    height: '100%',
    aspectRatio: undefined,
    borderRadius: 0,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  tapZoneRow: {
    flex: 1,
    flexDirection: 'row',
  },
  tapZone: {
    flex: 1,
  },
  seekFlash: {
    position: 'absolute',
    top: '50%',
    marginTop: -26,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekFlashLeft: { left: '18%' },
  seekFlashRight: { right: '18%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    gap: 12,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  topBarButton: {
    padding: 6,
  },
  titleText: {
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  centerControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
  },
  sideButton: {
    padding: 8,
  },
  playButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  timeText: {
    color: '#ffffff',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  trackBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  trackBuffered: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  trackProgress: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  trackThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
  },
  trackThumbActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  retryLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
