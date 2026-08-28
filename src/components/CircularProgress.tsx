import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

interface CircularProgressProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
}

// SVG ring for the "Dubbing Progress" screen (2026-08-22 redesign) — a
// centered percentage is a clearer "is this stuck?" signal than a thin
// linear bar alone, per the design brief.
export function CircularProgress({ progress, size = 160, strokeWidth = 12, color, trackColor }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, progress));
  const offset = circumference * (1 - clamped / 100);

  return (
    <ThemedView style={[styles.wrapper, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          // Start the arc at 12 o'clock instead of SVG's default 3 o'clock.
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <ThemedText style={styles.label}>{Math.round(clamped)}%</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 28, fontWeight: '800' },
});
