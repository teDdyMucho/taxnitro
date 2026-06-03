export const Colors = {
  // FTG Brand
  primary:     '#E8B923',
  primaryDark: '#B5905B',
  primaryDeep: '#2C2320',

  // Backgrounds
  bgDeep:     '#FAFAF8',
  bgDark:     '#2C2320',
  bgMid:      '#F5F0E8',
  bgCard:     '#FFFFFF',
  bgElevated: '#FFFFFF',

  // Text
  textPrimary:   '#1C1713',
  textSecondary: '#6B5E52',
  textMuted:     '#A8998A',

  // Accents
  accent:       '#B5905B',
  accentPurple: '#7C3AED',
  accentGold:   '#E8B923',

  // Status
  viewed:    '#16A34A',
  notViewed: '#D97706',
  error:     '#DC2626',
  newDoc:    '#2563EB',

  // Borders
  border:      '#E8E0D0',
  borderLight: '#F2EDE3',

  // Absolute
  white: '#FFFFFF',
  black: '#000000',

  // Overlay
  transparent: 'transparent',
  overlay: 'rgba(28,23,19,0.5)',

  // Tab bar
  tabActive:   '#E8B923',
  tabInactive: '#A8998A',
};

export type ColorKey = keyof typeof Colors;
