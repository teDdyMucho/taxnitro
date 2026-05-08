import { nativeDriver } from '../constants/platform';
import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { StatusBadge } from './StatusBadge';

interface FolderLike {
  id: string;
  name: string;
  status: 'new' | 'viewed' | 'not_viewed';
  doc_count: number;
  created_at: string;
}

interface Props {
  item: FolderLike;
  onPress: () => void;
  viewMode: 'grid' | 'list';
}

const folderColors = {
  viewed: '#22C55E',
  not_viewed: '#F59E0B',
  new: '#3B82F6',
};

const folderBgColors = {
  viewed: 'rgba(34,197,94,0.08)',
  not_viewed: 'rgba(245,158,11,0.08)',
  new: 'rgba(59,130,246,0.08)',
};

export function FolderItem({ item, onPress, viewMode }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: nativeDriver, damping: 15 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: nativeDriver, damping: 15 }).start();

  if (viewMode === 'grid') {
    return (
      <Animated.View style={[styles.gridCard, { transform: [{ scale }] }]}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={onPress}
          onPressIn={() => pressIn(0.96)}
          onPressOut={pressOut}
          activeOpacity={1}
        >
          <View style={[styles.folderIconBg, { backgroundColor: folderBgColors[item.status] }]}>
            <Ionicons name="folder" size={36} color={folderColors[item.status]} />
            {item.status === 'new' && <View style={styles.newDot} />}
          </View>
          <Text style={styles.gridName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.gridMeta}>
            <Text style={styles.countText}>{item.doc_count} files</Text>
            <StatusBadge status={item.status} size="sm" />
          </View>
          <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={styles.listCard}
        onPress={onPress}
        onPressIn={() => pressIn(0.98)}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        <View style={[styles.listIconBg, { backgroundColor: folderBgColors[item.status] }]}>
          <Ionicons name="folder" size={26} color={folderColors[item.status]} />
        </View>
        <View style={styles.listInfo}>
          <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.listMeta}>{item.doc_count} files · {formatDate(item.created_at)}</Text>
        </View>
        <View style={styles.listRight}>
          <StatusBadge status={item.status} size="sm" />
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginTop: 4 }} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  gridCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 14,
    margin: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 150,
  },
  folderIconBg: {
    width: 58,
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  newDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.newDoc,
    borderWidth: 1.5,
    borderColor: Colors.bgCard,
  },
  gridName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 18,
  },
  gridMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  countText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  dateText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  listCard: {
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
  listIconBg: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  listMeta: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  listRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
});
