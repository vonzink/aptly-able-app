import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fontFamily, useTheme } from './theme';

export function MediaControl({
  icon,
  label,
  onPress,
  prominent = false,
  recording = false,
  disabled = false,
  loading = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress(): void;
  prominent?: boolean;
  recording?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  const background = prominent ? (recording ? colors.danger : colors.accent) : colors.surfaceAlt;
  const foreground = prominent ? colors.accentInk : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        { opacity: disabled ? 0.45 : pressed || loading ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.circle, prominent && styles.large, { backgroundColor: background }]}>
        {loading ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <Ionicons name={icon} size={prominent ? 32 : 24} color={foreground} />
        )}
      </View>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  control: { alignItems: 'center', justifyContent: 'center', gap: 9, minWidth: 72, flexShrink: 1 },
  circle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { width: 76, height: 76, borderRadius: 38 },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 124,
  },
});
