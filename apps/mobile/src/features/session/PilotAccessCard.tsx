import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '@aptly/api-client';
import { useAuthClient } from '../../bootstrap/AppProviders';
import { Button, Card } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';

export function PilotAccessCard({
  loading,
  message,
  onSubmit,
}: {
  loading: boolean;
  message: string | null;
  onSubmit(credential: string): void;
}) {
  const { colors } = useTheme();
  const auth = useAuthClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function signIn() {
    if (request.current || loading) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await auth.login({ email, password }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setPassword('');
        onSubmit(result.credential);
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof ApiError ? failure.message : 'Unable to sign in. Try again.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }
  const inputStyle = [
    styles.input,
    { borderColor: colors.line, color: colors.ink, backgroundColor: colors.bg },
  ];
  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.ink }]}>Sign in to Aptly Able</Text>
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        Use the email and password you created in the dashboard. Your recorder invitation will stay
        here while you sign in.
      </Text>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.ink }]}>Email address</Text>
        <TextInput
          accessibilityLabel="Email address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          maxLength={254}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.inkMuted}
          editable={!busy && !loading}
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.ink }]}>Password</Text>
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          secureTextEntry
          maxLength={128}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => void signIn()}
          placeholder="Password"
          placeholderTextColor={colors.inkMuted}
          editable={!busy && !loading}
          style={inputStyle}
        />
      </View>
      {(error || message) && (
        <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          {error ?? message}
        </Text>
      )}
      <Button label="Sign in" loading={busy || loading} onPress={() => void signIn()} />
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: 13 },
  field: { gap: 8 },
  label: { fontFamily: fontFamily.semibold, fontSize: 14 },
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
});
