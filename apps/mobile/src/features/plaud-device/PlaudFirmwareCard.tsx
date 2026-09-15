import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import { Card, SectionLabel } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { isStoreRelease } from '../../services/release-profile';

export function PlaudFirmwareCard() {
  return isStoreRelease ? null : <PilotFirmwareCard />;
}

function PilotFirmwareCard() {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 12 }}>
      <SectionLabel>FIRMWARE</SectionLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="download-outline" size={24} color={colors.inkSecondary} />
        <Text style={{ fontFamily: fontFamily.semibold, fontSize: 18, color: colors.ink }}>
          Coming soon
        </Text>
      </View>
      <Text
        style={{
          fontFamily: fontFamily.regular,
          fontSize: 14,
          lineHeight: 21,
          color: colors.inkSecondary,
        }}
      >
        Firmware updates for your recorder will be available here in a future app release.
      </Text>
    </Card>
  );
}
