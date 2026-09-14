import { useState } from 'react';
import { PilotAccessCard } from './PilotAccessCard';
import { StyleSheet, Text, TextInput } from 'react-native';

import { Button, Card } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';

export function LocalAccessCard({
  loading,
  message,
  onSubmit,
}: {
  loading: boolean;
  message: string | null;
  onSubmit(code: string): void;
}) {
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  if (process.env.EXPO_PUBLIC_AUTH_MODE === 'pilot')
    return <PilotAccessCard loading={loading} message={message} onSubmit={onSubmit} />;
  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.ink }]}>Local development access</Text>
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        Enter the user access code configured on your local API. It stays in memory and is cleared
        when you sign out.
      </Text>
      <TextInput
        accessibilityLabel="Local user access code"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setCode}
        onSubmitEditing={() => code.trim() && onSubmit(code.trim())}
        placeholder="User access code"
        placeholderTextColor={colors.inkMuted}
        secureTextEntry
        style={[
          styles.input,
          { borderColor: colors.line, color: colors.ink, backgroundColor: colors.bg },
        ]}
        value={code}
      />
      {message ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
          {message}
        </Text>
      ) : null}
      <Button
        label="Continue"
        loading={loading}
        onPress={() => code.trim() && onSubmit(code.trim())}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 13 },
  title: { fontFamily: fontFamily.bold, fontSize: 19 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  error: { fontFamily: fontFamily.medium, fontSize: 13.5, lineHeight: 20 },
});
