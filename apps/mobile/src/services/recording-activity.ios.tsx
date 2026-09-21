import { Image, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type {
  RecordingActivityContent,
  RecordingActivityPort,
} from '../features/phone-recording/recording-activity';

function RecordingActivity(props: RecordingActivityContent, environment: LiveActivityEnvironment) {
  'widget';
  const stale = environment.isStale === true;
  const status = stale
    ? 'Open app to check recording'
    : props.paused
      ? 'Recording paused'
      : 'Recording audio';
  const ink = environment.colorScheme === 'dark' ? '#f8fafc' : '#172b3a';
  const timer =
    props.paused || stale ? (
      <Text
        modifiers={[
          font({ size: 22, weight: 'semibold', design: 'monospaced' }),
          foregroundStyle(ink),
        ]}
      >
        {Math.floor(props.elapsedSeconds / 60)}:{String(props.elapsedSeconds % 60).padStart(2, '0')}
      </Text>
    ) : (
      <Text
        timerInterval={{ lower: new Date(props.timerStart), upper: new Date(props.timerEnd) }}
        countsDown={false}
        modifiers={[
          font({ size: 22, weight: 'semibold', design: 'monospaced' }),
          foregroundStyle(ink),
        ]}
      />
    );
  return {
    banner: (
      <VStack spacing={6} modifiers={[padding({ all: 16 })]}>
        <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(ink)]}>
          APTLY ABLE
        </Text>
        <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(ink)]}>
          {status}
        </Text>
        {timer}
        <Text modifiers={[font({ size: 13 }), foregroundStyle(ink)]}>
          Tap to open recording controls
        </Text>
      </VStack>
    ),
    compactLeading: <Image systemName={props.paused || stale ? 'pause.fill' : 'mic.fill'} />,
    compactTrailing: timer,
    minimal: <Image systemName={props.paused || stale ? 'pause.fill' : 'mic.fill'} />,
    expandedCenter: <Text>{status}</Text>,
    expandedBottom: (
      <VStack spacing={4}>
        {timer}
        <Text>Tap to open recording controls</Text>
      </VStack>
    ),
  };
}

const activity = createLiveActivity('PhoneRecording', RecordingActivity);
export const recordingActivity: RecordingActivityPort = {
  async show(content, staleAt) {
    const instances = activity.getInstances();
    const [current, ...extras] = instances;
    await Promise.all(extras.map((item) => item.end('immediate')));
    if (current) await current.update(content, new Date(staleAt));
    else activity.start(content, 'aptlyable://phone-recording', new Date(staleAt));
  },
  async end() {
    await Promise.all(activity.getInstances().map((item) => item.end('immediate')));
  },
};
