import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { recorderModels, type RecorderModel } from './device-models';
import { RecorderPhoto } from './RecorderPhoto';

export function RecorderIdentityCard({
  model,
  serialSuffix,
  status,
  connected = false,
  children,
}: {
  model: RecorderModel;
  serialSuffix: string;
  status: string;
  connected?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.identity}>
        <View style={[styles.photo, { backgroundColor: colors.surfaceAlt }]}>
          <RecorderPhoto model={model} size={140} />
        </View>
        <View style={styles.words}>
          <Text style={[styles.label, { color: colors.inkSecondary }]}>Your recorder</Text>
          <Text accessibilityRole="header" style={[styles.name, { color: colors.ink }]}>
            {recorderModels[model].name}
          </Text>
          <Text style={[styles.serial, { color: colors.inkSecondary }]}>
            Serial ending {serialSuffix}
          </Text>
          <Text
            style={[styles.status, { color: connected ? colors.mintInk : colors.inkSecondary }]}
          >
            {status}
          </Text>
        </View>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  photo: {
    width: 116,
    height: 146,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  words: { flex: 1, minWidth: 140, gap: 7 },
  label: { fontFamily: fontFamily.medium, fontSize: 13 },
  name: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 29 },
  serial: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20 },
  status: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 20 },
});
