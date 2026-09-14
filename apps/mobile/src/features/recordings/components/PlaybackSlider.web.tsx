import { useTheme } from '../../../ui/theme';
import { durationLabel } from '../presentation';
import type { PlaybackSliderProps } from './PlaybackSlider';

export function PlaybackSlider({ duration, position, enabled, onSeek }: PlaybackSliderProps) {
  const { colors } = useTheme();
  return (
    <input
      type="range"
      aria-label="Playback position"
      aria-valuetext={`${durationLabel(position)} of ${durationLabel(duration)}`}
      min={0}
      max={duration || 1}
      step={0.1}
      value={Math.min(duration, Math.max(0, position))}
      disabled={!enabled}
      onChange={(event) => onSeek(Number(event.currentTarget.value))}
      style={{
        width: '100%',
        height: 30,
        margin: 0,
        accentColor: colors.accent,
        cursor: 'pointer',
      }}
    />
  );
}
