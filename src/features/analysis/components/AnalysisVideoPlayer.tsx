import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import YoutubeIframe, { type YoutubeIframeRef } from 'react-native-youtube-iframe';

// PHASE 6 TECHNICAL SPIKE — resolved.
//
// Question: can the original YouTube video (analysis has no re-hosted file,
// see MOBILE_INTEGRATION_AUDIT.md §10) be embedded with seek-to-timestamp
// control WITHOUT a WebView, per the spec's general "avoid WebView" mandate?
//
// Answer: no. Verified directly (not assumed) by smoke-testing
// react-native-youtube-iframe in Expo Go on both iOS and Android — it
// renders, plays, and seekTo() works correctly on both. The underlying
// constraint is YouTube's own terms/APIs, not a library choice: YouTube's
// IFrame API (what the web app already uses) and Google's official iOS/Android
// player SDKs are ALL WebView-based internally — there is no first-party way
// to get interactive YouTube playback without one. Deep-linking to the native
// YouTube app was considered and rejected: it can open at a starting
// timestamp but cannot be seeked *from within our UI* afterwards, which
// breaks the core requirement (tapping a chapter/key-point/transcript row
// must seek the video the user is already watching, not relaunch an app).
//
// So: react-native-youtube-iframe (wraps the same IFrame API as
// frontend/components/YouTubePlayer.tsx) is the correct, minimal choice —
// full parity with web, actively maintained, works in Expo Go with no custom
// dev client.

export interface AnalysisVideoPlayerHandle {
  seekTo: (seconds: number) => void;
}

interface AnalysisVideoPlayerProps {
  videoId: string;
}

export const AnalysisVideoPlayer = forwardRef<AnalysisVideoPlayerHandle, AnalysisVideoPlayerProps>(
  function AnalysisVideoPlayer({ videoId }, ref) {
    const innerRef = useRef<YoutubeIframeRef>(null);
    const { width } = useWindowDimensions();
    const height = ((width - 40) * 9) / 16;

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => innerRef.current?.seekTo(seconds, true),
    }));

    return (
      <YoutubeIframe
        ref={innerRef}
        videoId={videoId}
        height={height}
        viewContainerStyle={styles.container}
      />
    );
  },
);

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
  },
});
