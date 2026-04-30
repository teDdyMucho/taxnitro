import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

type DocStatus = 'new' | 'viewed' | 'not_viewed';

interface Props {
  status: DocStatus;
  size?: 'sm' | 'md';
}

const statusConfig = {
  viewed: { label: 'Viewed', color: Colors.viewed, bg: 'rgba(34,197,94,0.12)' },
  not_viewed: { label: 'Not Viewed', color: Colors.notViewed, bg: 'rgba(245,158,11,0.12)' },
  new: { label: 'New', color: Colors.newDoc, bg: 'rgba(59,130,246,0.12)' },
};

export function StatusBadge({ status, size = 'md' }: Props) {
  const config = statusConfig[status];
  const isSmall = size === 'sm';

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, isSmall && styles.badgeSm]}>
      <View style={[styles.dot, { backgroundColor: config.color }, isSmall && styles.dotSm]} />
      <Text style={[styles.label, { color: config.color }, isSmall && styles.labelSm]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSm: {
    width: 5,
    height: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  labelSm: {
    fontSize: 10,
  },
});
