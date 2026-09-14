import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../ui/theme';
import { durationLabel } from '../presentation';

export interface PlaybackSliderProps {
  duration: number;
  position: number;
  enabled: boolean;
  onSeek: (seconds: number) => void;
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function PlaybackSlider({ duration, position, enabled, onSeek }: PlaybackSliderProps) {
  const { colors } = useTheme();
  const width = useRef(1);
  const start = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);
  const current = useRef({ duration, position, enabled, onSeek });
  current.current = { duration, position, enabled, onSeek };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => current.current.enabled && current.current.duration > 0,
        onPanResponderGrant: (event) => {
          start.current = event.nativeEvent.locationX;
          setDrag(clamp(start.current / width.current));
        },
        onPanResponderMove: (_event, gesture) =>
          setDrag(clamp((start.current + gesture.dx) / width.current)),
        onPanResponderRelease: (_event, gesture) => {
          const fraction = clamp((start.current + gesture.dx) / width.current);
          setDrag(null);
          if (current.current.enabled) current.current.onSeek(fraction * current.current.duration);
        },
        onPanResponderTerminate: () => setDrag(null),
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );
  const fraction = drag ?? (duration > 0 ? clamp(position / duration) : 0);
  const value = drag === null ? position : fraction * duration;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Playback position"
      accessibilityHint="Drag to a moment in the recording"
      accessibilityState={{ disabled: !enabled }}
      accessibilityValue={{
        min: 0,
        max: Math.ceil(duration),
        now: Math.floor(value),
        text: `${durationLabel(value)} of ${durationLabel(duration)}`,
      }}
      accessibilityActions={[
        { name: 'increment', label: 'Forward 15 seconds' },
        { name: 'decrement', label: 'Back 15 seconds' },
      ]}
      onAccessibilityAction={(event) => {
        if (!enabled) return;
        const delta = event.nativeEvent.actionName === 'increment' ? 15 : -15;
        onSeek(Math.max(0, Math.min(duration, position + delta)));
      }}
      onLayout={(event) => {
        width.current = Math.max(1, event.nativeEvent.layout.width);
      }}
      {...responder.panHandlers}
      style={[styles.touchTarget, { opacity: enabled ? 1 : 0.45 }]}
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: colors.line }]}>
        <View
          style={[styles.fill, { backgroundColor: colors.accent, width: `${fraction * 100}%` }]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            backgroundColor: colors.accent,
            left: `${fraction * 100}%`,
            transform: [{ translateX: -9 }],
          },
        ]}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  touchTarget: { height: 48, justifyContent: 'center', marginHorizontal: 9 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
});
