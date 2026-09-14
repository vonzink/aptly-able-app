import { useColorScheme } from 'react-native';

export const lightColors = {
  bg: '#F5F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EAF0F6',
  line: '#E3E9EF',
  ink: '#2E2E2E',
  inkSecondary: '#5D6672',
  inkMuted: '#5F6B78',
  accent: '#193E66',
  accentInk: '#FFFFFF',
  blue: '#4F7CAB',
  orange: '#CC5B2C',
  orangeInk: '#B34E24',
  orangeBg: '#FAEEE8',
  mint: '#7FD1A0',
  mintInk: '#1C7A50',
  mintBg: '#E7F5ED',
  danger: '#B3402C',
  dangerBg: '#FBEAE6',
  waveform: '#C7D6E5',
  amber: '#E8B64C',
} as const;

export const darkColors = {
  bg: '#0D2137',
  surface: '#13304E',
  surfaceAlt: '#193E66',
  line: '#22496F',
  ink: '#FFFFFF',
  inkSecondary: '#A3ADB8',
  inkMuted: '#A3B2C1',
  accent: '#8FB3D9',
  accentInk: '#0D2137',
  blue: '#8FB3D9',
  orange: '#E27A48',
  orangeInk: '#EC9366',
  orangeBg: 'rgba(204,91,44,.22)',
  mint: '#7FD1A0',
  mintInk: '#7FD1A0',
  mintBg: 'rgba(127,209,160,.14)',
  danger: '#F09080',
  dangerBg: 'rgba(179,64,44,.24)',
  waveform: '#2C5480',
  amber: '#E8B64C',
} as const;

export type Colors = { [Key in keyof typeof lightColors]: string };
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export function useTheme(): { colors: Colors; dark: boolean } {
  const dark = useColorScheme() === 'dark';
  return { colors: dark ? darkColors : lightColors, dark };
}
