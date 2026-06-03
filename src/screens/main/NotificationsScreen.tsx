import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  Notification,
} from '../../db/notifications';

const notifTypeConfig: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  new:      { icon: 'document-text', color: '#E8B923', bg: 'rgba(232,185,35,0.12)' },
  upload:   { icon: 'cloud-upload',  color: '#E8B923', bg: 'rgba(232,185,35,0.12)' },
  viewed:   { icon: 'eye',           color: '#B5905B', bg: 'rgba(181,144,91,0.12)' },
  reminder: { icon: 'notifications', color: '#E8B923', bg: 'rgba(232,185,35,0.12)' },
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NotifCard({ item, onRead }: { item: Notification; onRead: (id: string) => void }) {
  const config = notifTypeConfig[item.type] || notifTypeConfig.upload;

  return (
    <TouchableOpacity
      style={[styles.notifCard, !item.read && styles.notifCardUnread]}
      onPress={() => onRead(item.id)}
      activeOpacity={0.8}
    >
      {!item.read && <View style={styles.unreadBar} />}
      <View style={[styles.notifIcon, { backgroundColor: config.bg }]}>
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      <View style={styles.notifContent}>
        <View style={styles.notifHeader}>
          <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
        </View>
        <Text style={styles.notifMessage} numberOfLines={2}>{item.message}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function NotificationsScreen() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const data = await getNotifications(user.id);
    setNotifications(data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    loadNotifications();
  }, [loadNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(prev =>
            prev.map(n => n.id === updated.id ? updated : n)
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await markAllNotificationsRead(user.id);
  }, [user]);

  const unread = notifications.filter(n => !n.read);
  const read = notifications.filter(n => n.read);
  const unreadCount = unread.length;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Platform.OS === 'web' ? 16 : insets.top + 16 }]}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={styles.bellWrap}>
            <Ionicons name="notifications" size={20} color="#E8B923" />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color='#E8B923' />
        </View>
      ) : (
        <FlatList
          data={[...unread, ...read]}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor='#E8B923' />
          }
          ListHeaderComponent={
            unread.length > 0 ? (
              <Text style={styles.sectionLabel}>New · {unread.length}</Text>
            ) : null
          }
          renderItem={({ item, index }) => {
            const isFirstRead = index === unread.length && read.length > 0;
            return (
              <>
                {isFirstRead && <Text style={styles.sectionLabel}>Earlier</Text>}
                <NotifCard item={item} onRead={markRead} />
              </>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySubtext}>You'll see document updates here</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF8' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  bellWrap: { position: 'relative', width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(232,185,35,0.15)', alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8B923', borderWidth: 1.5, borderColor: '#3A3131' },
  badge: {
    backgroundColor: '#E8B923',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#2C2320', fontSize: 11, fontWeight: '800' },
  markAllBtn: {
    backgroundColor: 'rgba(232,185,35,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.3)',
  },
  markAllText: { color: '#E8B923', fontSize: 12, fontWeight: '600' },
  list: { padding: 16 },
  sectionLabel: {
    color: '#A8998A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 8,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E8E0D0',
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  notifCardUnread: {
    backgroundColor: '#FFFDF5',
    borderColor: 'rgba(232,185,35,0.4)',
  },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#E8B923',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifContent: { flex: 1 },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
    gap: 8,
  },
  notifTitle: { color: '#1C1713', fontSize: 14, fontWeight: '700', flex: 1 },
  notifTime: { color: '#A8998A', fontSize: 11, flexShrink: 0, marginTop: 1 },
  notifMessage: { color: '#6B5E52', fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: '#6B5E52', fontSize: 17, fontWeight: '600' },
  emptySubtext: { color: '#A8998A', fontSize: 14 },
});
