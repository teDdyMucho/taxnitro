export const Colors = {
  // Primary
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryDeep: '#0F172A',

  // Background
  bgDeep: '#020617',
  bgDark: '#111827',
  bgMid: '#1F2937',
  bgCard: '#1E293B',
  bgElevated: '#263344',

  // Text
  textPrimary: '#E5E7EB',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',

  // Status
  viewed: '#22C55E',
  notViewed: '#F59E0B',
  error: '#EF4444',
  newDoc: '#3B82F6',

  // Accent
  accent: '#7C3AED',

  // Borders
  border: '#2D3748',
  borderLight: '#374151',

  // White / Black
  white: '#FFFFFF',
  black: '#000000',

  // Transparent
  transparent: 'transparent',
  overlay: 'rgba(0,0,0,0.5)',

  // Tab bar
  tabActive: '#2563EB',
  tabInactive: '#6B7280',
};

export type ColorKey = keyof typeof Colors;
