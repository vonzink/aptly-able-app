import { Image, type ImageSourcePropType } from 'react-native';
import { recorderModels, type RecorderModel } from './device-models';

const photos: Record<RecorderModel, ImageSourcePropType> = {
  notepins: require('../../../assets/devices/notepins.png'),
  notepro: require('../../../assets/devices/notepro.png'),
};

export function RecorderPhoto({ model, size = 140 }: { model: RecorderModel; size?: number }) {
  const device = recorderModels[model];
  return (
    <Image
      source={photos[model]}
      accessibilityLabel={device.name}
      accessible
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}
