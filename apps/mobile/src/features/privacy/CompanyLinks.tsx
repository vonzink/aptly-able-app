import { company } from '@aptly/product-content';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';

export function CompanyLinks({ supportOnly = false }: { supportOnly?: boolean }) {
  const { colors } = useTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  async function open(url: string) {
    setFailedUrl(null);
    try {
      await Linking.openURL(url);
    } catch {
      setFailedUrl(url);
    }
  }
  return (
    <View style={styles.links}>
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>{company.name}</Text>
      <Text selectable style={[styles.copy, { color: colors.ink }]}>
        {company.supportEmail}
      </Text>
      <Button
        label="Email support"
        variant="secondary"
        onPress={() => void open(`mailto:${company.supportEmail}`)}
      />
      <Button
        label="Open contact page"
        variant="text"
        onPress={() => void open(company.supportUrl)}
      />
      {!supportOnly && (
        <>
          <Button
            label="Company Privacy Policy"
            variant="text"
            onPress={() => void open(company.privacyUrl)}
          />
          <Button label="Terms of Use" variant="text" onPress={() => void open(company.termsUrl)} />
          <Button
            label="Accessibility statement"
            variant="text"
            onPress={() => void open(company.accessibilityUrl)}
          />
        </>
      )}
      {failedUrl && (
        <Text selectable accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          This link could not open. Copy this address into your browser or email app: {failedUrl}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  links: { gap: 8 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
});
