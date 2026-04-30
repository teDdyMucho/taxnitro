import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { StatusBadge } from './StatusBadge';

interface DocumentLike {
  id: string;
  name: string;
  document_url: string;
  file_type: string;
  status: 'new' | 'viewed' | 'not_viewed';
  created_at: string;
}

interface Props {
  item: DocumentLike;
  onPress: () => void;
}

const fileTypeConfig: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pdf:  { icon: 'document-text', color: '#EF4444' },
  xlsx: { icon: 'grid',          color: '#22C55E' },
  xls:  { icon: 'grid',          color: '#22C55E' },
  docx: { icon: 'document',      color: '#3B82F6' },
  doc:  { icon: 'document',      color: '#3B82F6' },
  jpg:  { icon: 'image',         color: '#F59E0B' },
  jpeg: { icon: 'image',         color: '#F59E0B' },
  png:  { icon: 'image',         color: '#F59E0B' },
  default: { icon: 'document-outline', color: Colors.textMuted },
};

function guessFileType(url: string, fileType: string): string {
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
  return ext && fileTypeConfig[ext] ? ext : fileType?.toLowerCase() || 'default';
}

export function FileItem({ item, onPress }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const type = guessFileType(item.document_url, item.file_type);
  const fileConfig = fileTypeConfig[type] || fileTypeConfig.default;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, damping: 15 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 15 }).start()}
        activeOpacity={1}
      >
        <View style={[styles.iconBg, { backgroundColor: `${fileConfig.color}15` }]}>
          <Ionicons name={fileConfig.icon} size={22} color={fileConfig.color} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.metaText}>{formatDate(item.created_at)}</Text>
        </View>
        <View style={styles.right}>
          <StatusBadge status={item.status} size="sm" />
          <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} style={{ marginTop: 4 }} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  name: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
});
