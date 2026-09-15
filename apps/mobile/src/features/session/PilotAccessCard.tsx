import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '@aptly/api-client';
import { useRouter } from 'expo-router';
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
  onSubmit(credential: string, accountEmail?: string, expiresAt?: string): void;
}) {
  const { colors } = useTheme();
  const auth = useAuthClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
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
      const result =
        mode === 'register'
          ? await auth.register({ displayName, email, password }, { signal: controller.signal })
          : await auth.login({ email, password }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setPassword('');
        onSubmit(result.credential, email.trim().toLowerCase(), result.expiresAt);
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
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        {mode === 'register' ? 'Create your account' : 'Sign in to Aptly Able'}
      </Text>
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        {mode === 'register'
          ? 'One account for your recorder, this app and the web dashboard. Your invitation stays here while you create your account.'
          : 'Use your Aptly Able email and password. Your recorder invitation stays here while you sign in.'}
      </Text>
      {mode === 'register' && (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.ink }]}>Your name</Text>
          <TextInput
            accessibilityLabel="Your name"
            autoComplete="name"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={120}
            editable={!busy && !loading}
            style={inputStyle}
          />
        </View>
      )}
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
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
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
      {mode === 'register' && (
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Use at least 12 characters. Read Privacy & your recordings below to learn how your
          information is used.
        </Text>
      )}
      {(error || message) && (
        <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          {error ?? message}
        </Text>
      )}
      <Button
        label={mode === 'register' ? 'Create account' : 'Sign in'}
        loading={busy || loading}
        disabled={
          !email.trim() ||
          !password ||
          (mode === 'register' && (!displayName.trim() || password.length < 12))
        }
        onPress={() => void signIn()}
      />
      <Button
        label={
          mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'
        }
        variant="text"
        disabled={busy || loading}
        onPress={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setPassword('');
          setError(null);
        }}
      />
      <Button
        label="Need help signing in?"
        variant="text"
        onPress={() => router.push('/support')}
      />
      <Button
        label="Privacy & your recordings"
        variant="text"
        onPress={() => router.push('/privacy')}
      />
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
