import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './components';
import { fontFamily, useTheme } from './theme';

interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmationDialog({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  loading = false,
  disabled = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dismiss = () => {
    if (!loading) onCancel();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View
        style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      >
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={dismiss}
          style={[styles.dialog, { backgroundColor: colors.surface }]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
              {title}
            </Text>
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>{description}</Text>
            {children}
            <Button
              label={confirmLabel}
              variant="danger"
              loading={loading}
              disabled={disabled}
              onPress={() => {
                if (!loading && !disabled) onConfirm();
              }}
            />
            <Button label={cancelLabel} variant="text" disabled={loading} onPress={dismiss} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: { width: '100%', maxWidth: 430, maxHeight: '100%', borderRadius: 18, overflow: 'hidden' },
  scroll: { flexGrow: 0 },
  content: { padding: 24, gap: 17 },
  title: { fontFamily: fontFamily.bold, fontSize: 21, lineHeight: 28 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
});
