import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from './theme';

/** Animates real readings, never fabricates a charging or storage value. */
export function AnimatedMeter({
  percent,
  color,
  label,
}: {
  percent: number | null;
  color: string;
  label: string;
}) {
  const { colors } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(true);
  const amount = useRef(new Animated.Value(0)).current;
  const value =
    percent !== null && Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;
  useEffect(() => {
    let active = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
      changed = true;
      setReduceMotion(reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (active && !changed) setReduceMotion(reduced);
      })
      .catch(() => {
        /* Keep motion disabled if the preference cannot be read. */
      });
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(amount, {
      toValue: value ?? 0,
      duration: reduceMotion ? 0 : 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [amount, value, reduceMotion]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={
        value === null
          ? { text: 'Unavailable' }
          : { min: 0, max: 100, now: value, text: `${Math.round(value)} percent` }
      }
      style={[styles.track, { backgroundColor: colors.line }]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            width: amount.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});
