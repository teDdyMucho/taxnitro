import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { ContentMaxWidth } from '../constants/layout';

/**
 * Centers its children and caps their width on large screens so content doesn't
 * stretch edge-to-edge. On phones it's a transparent pass-through (full width).
 *
 * Drop this INSIDE a screen's scroll/content area (not around the whole screen,
 * so full-bleed headers/gradients can still span the viewport if desired).
 */
export function ResponsiveContainer({
  children,
  maxWidth = ContentMaxWidth,
  style,
  gutter = 0,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
  gutter?: number;   // horizontal padding applied at all sizes
}) {
  return (
    <View style={[{ width: '100%', alignItems: 'center' }, gutter ? { paddingHorizontal: gutter } : null]}>
      <View style={[{ width: '100%', maxWidth }, style]}>
        {children}
      </View>
    </View>
  );
}
