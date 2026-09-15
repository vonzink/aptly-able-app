import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, PageHeader, Screen } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { CompanyLinks } from './CompanyLinks';

export default function SupportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Screen>
      <Button label="Back to Settings" variant="text" onPress={() => router.replace('/settings')} />
      <PageHeader
        title="Help & support"
        copy="Get help with sign-in, your recorder or your data."
      />
      <Card style={styles.card}>
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Describe what happened and your phone model. For connection issues, you can copy the
          diagnostics report in Settings and include it in your message. Do not send your password
          or private recordings.
        </Text>
        <CompanyLinks supportOnly />
      </Card>
      <Card style={styles.card}>
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          To request account deletion, use Delete account in Settings. If you cannot sign in,
          contact support for help with your request. Include your deletion reference if you have
          one.
        </Text>
        <Button
          label="Privacy & your recordings"
          variant="secondary"
          onPress={() => router.push('/privacy')}
        />
        <Button
          label="Delete account"
          variant="text"
          onPress={() => router.push('/delete-account')}
        />
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { gap: 14 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 23 },
});
