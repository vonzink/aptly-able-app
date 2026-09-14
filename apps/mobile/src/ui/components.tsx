import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fontFamily, useTheme } from './theme';

export function ScreenFrame({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      {children}
    </SafeAreaView>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScreenFrame>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </ScreenFrame>
  );
}

export function PageHeader({
  eyebrow,
  title,
  copy,
  mode,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  mode?: 'simulated' | 'local';
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: colors.orangeInk }]}>{eyebrow}</Text>
      ) : null}
      <View style={styles.headerRow}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {title}
        </Text>
        {mode === 'simulated' ? (
          <MockBadge />
        ) : mode === 'local' ? (
          <View style={[styles.badge, { backgroundColor: colors.mintBg }]}>
            <Text style={[styles.badgeText, { color: colors.mintInk }]}>LOCAL</Text>
          </View>
        ) : null}
      </View>
      {copy ? <Text style={[styles.copy, { color: colors.inkSecondary }]}>{copy}</Text> : null}
    </View>
  );
}

export function MockBadge() {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel="Simulation mode"
      style={[styles.badge, { backgroundColor: colors.orangeBg }]}
    >
      <Text style={[styles.badgeText, { color: colors.orangeInk }]}>SIMULATED</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, style]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'text';
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const backgroundColor =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : 'transparent';
  const borderColor =
    variant === 'secondary' ? colors.line : variant === 'danger' ? colors.danger : 'transparent';
  const color =
    variant === 'primary'
      ? colors.accentInk
      : variant === 'danger'
        ? colors.accentInk
        : variant === 'text'
          ? colors.accent
          : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={loading || disabled}
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor, opacity: disabled ? 0.45 : pressed || loading ? 0.72 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.buttonText, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  copy,
  action,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
  action: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.line }]}>
      {icon}
      <Text style={[styles.emptyTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.emptyCopy, { color: colors.inkSecondary }]}>{copy}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.sectionLabel, { color: colors.inkMuted }]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  safe: { flex: 1 },
  screen: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, gap: 18 },
  header: { gap: 8, marginBottom: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: { fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 2 },
  title: { flexShrink: 1, fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 35 },
  copy: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 23 },
  badge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 1 },
  card: { borderWidth: 1, borderRadius: 16, padding: 18 },
  button: {
    minHeight: 52,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fontFamily.semibold, fontSize: 15.5, textAlign: 'center' },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 18,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 19, marginTop: 18 },
  emptyCopy: {
    fontFamily: fontFamily.regular,
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 7,
  },
  emptyAction: { width: '100%', marginTop: 22 },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10.5,
    letterSpacing: 2,
    marginLeft: 4,
    marginTop: 4,
  },
});
