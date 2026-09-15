import { appDataNotice } from '@aptly/product-content';
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, PageHeader, Screen } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { CompanyLinks } from './CompanyLinks';

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <Button label="Back to Settings" variant="text" onPress={() => router.replace('/settings')} />
      <PageHeader title={appDataNotice.title} copy={appDataNotice.introduction} />
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        App data notice · {appDataNotice.updatedAt}
      </Text>
      {appDataNotice.sections.map((section) => (
        <Card key={section.title} style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
            {section.title}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={[styles.copy, { color: colors.inkSecondary }]}>
              {paragraph}
            </Text>
          ))}
        </Card>
      ))}
      <Card>
        <CompanyLinks accountDeletion />
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 25 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 23 },
});
