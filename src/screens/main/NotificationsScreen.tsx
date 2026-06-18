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
  Modal,
  Pressable,
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
  deleteNotification,
  deleteAllNotifications,
  Notification,
} from '../../db/notifications';

// ── Type config ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  accent: string;
}> = {
  approved: { icon: 'checkmark-circle', color: '#10B981', bg: 'rgba(16,185,129,0.12)', accent: '#10B981' },
  rejected: { icon: 'close-circle',     color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  accent: '#EF4444' },
  new:      { icon: 'document-text',    color: '#E8B923', bg: 'rgba(232,185,35,0.12)', accent: '#E8B923' },
  upload:   { icon: 'cloud-upload',     color: '#E8B923', bg: 'rgba(232,185,35,0.12)', accent: '#E8B923' },
  viewed:   { icon: 'eye',              color: '#B5905B', bg: 'rgba(181,144,91,0.12)', accent: '#B5905B' },
  reminder: { icon: 'notifications',    color: '#E8B923', bg: 'rgba(232,185,35,0.12)', accent: '#E8B923' },
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now  = new Date();
  const diffMs    = now.getTime() - date.getTime();
  const diffMins  = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays  = Math.floor(diffHours / 24);

  if (diffMins < 1)  return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7)  return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Confirm clear-all modal ────────────────────────────────────────────────────

function ClearAllModal({ visible, onConfirm, onCancel }: {
  visible: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={cm.overlay} onPress={onCancel}>
        <Pressable style={cm.box} onPress={() => {}}>
          <View style={cm.iconWrap}>
            <Ionicons name="trash-outline" size={28} color="#EF4444" />
          </View>
          <Text style={cm.title}>Clear All Notifications?</Text>
          <Text style={cm.sub}>This will permanently delete all notifications.</Text>
          <View style={cm.row}>
            <TouchableOpacity style={cm.cancelBtn} onPress={onCancel}>
              <Text style={cm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cm.deleteBtn} onPress={() => { onCancel(); onConfirm(); }}>
              <Text style={cm.deleteText}>Clear All</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  box:       { backgroundColor: '#FFF', borderRadius: 28, padding: 28, width: 320, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.18, shadowRadius: 40, elevation: 24 },
  iconWrap:  { width: 64, height: 64, borderRadius: 20, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title:     { color: '#111827', fontSize: 17, fontWeight: '800' },
  sub:       { color: '#64748B', fontSize: 13, textAlign: 'center' },
  row:       { flexDirection: 'row', gap: 10, width: '100%', marginTop: 10 },
  cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  cancelText:{ color: '#64748B', fontWeight: '700', fontSize: 14 },
  deleteBtn: { flex: 1, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  deleteText:{ color: '#FFF', fontWeight: '700', fontSize: 14 },
});

// ── Notification Card ──────────────────────────────────────────────────────────

function NotifCard({ item, onRead, onDelete }: {
  item: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.upload;
  const isApproved = item.type === 'approved';
  const isRejected = item.type === 'rejected';

  return (
    <TouchableOpacity
      style={[
        styles.notifCard,
        !item.read && styles.notifCardUnread,
        isApproved && styles.notifCardApproved,
        isRejected && styles.notifCardRejected,
      ]}
      onPress={() => onRead(item.id)}
      activeOpacity={0.82}
    >
      {/* Left accent bar */}
      {!item.read && (
        <View style={[styles.unreadBar, { backgroundColor: cfg.accent }]} />
      )}

      {/* Icon */}
      <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={22} color={cfg.color} />
      </View>

      {/* Content */}
      <View style={styles.notifContent}>
        <View style={styles.notifHeader}>
          <Text style={[styles.notifTitle, isApproved && { color: '#065F46' }, isRejected && { color: '#991B1B' }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
        </View>
        <Text style={styles.notifMessage} numberOfLines={3}>{item.message}</Text>

        {/* Status chip */}
        {(isApproved || isRejected) && (
          <View style={[styles.statusChip, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={10} color={cfg.color} />
            <Text style={[styles.statusChipText, { color: cfg.color }]}>
              {isApproved ? 'Approved' : 'Declined'}
            </Text>
          </View>
        )}
      </View>

      {/* Delete button */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => onDelete(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Ionicons name="trash-outline" size={15} color="#CBD5E1" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function NotificationsScreen() {
  const { user }    = useAuth();
  const insets      = useSafeAreaInsets();
  const channelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearModal, setClearModal] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const data = await getNotifications(user.id);
    setNotifications(data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { setLoading(true); loadNotifications(); }, [loadNotifications]);

  // Real-time: INSERT, UPDATE, DELETE
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        p => setNotifications(prev => [p.new as Notification, ...prev]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        p => setNotifications(prev => prev.map(n => n.id === (p.new as Notification).id ? p.new as Notification : n)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' },
        p => setNotifications(prev => prev.filter(n => n.id !== (p.old as any).id)))
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
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

  const handleDelete = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await deleteNotification(id);
  }, []);

  const handleClearAll = useCallback(async () => {
    if (!user) return;
    setNotifications([]);
    await deleteAllNotifications(user.id);
  }, [user]);

  const unread = notifications.filter(n => !n.read);
  const read   = notifications.filter(n => n.read);

  return (
    <View style={styles.root}>

      {/* ── Header ── */}
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Platform.OS === 'web' ? 16 : insets.top + 16 }]}
      >
        <View style={styles.headerOverlay} pointerEvents="none" />
        <View style={styles.decorCircle1} pointerEvents="none" />
        <View style={styles.decorCircle2} pointerEvents="none" />
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unread.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread.length > 99 ? '99+' : unread.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          <View style={styles.bellWrap}>
            <Ionicons name="notifications" size={20} color="#E8B923" />
            {unread.length > 0 && <View style={styles.bellDot} />}
          </View>
          {unread.length > 0 && (
            <TouchableOpacity onPress={markAllRead} style={styles.actionChip}>
              <Ionicons name="checkmark-done-outline" size={13} color="#E8B923" />
              <Text style={styles.actionChipText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity onPress={() => setClearModal(true)} style={[styles.actionChip, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' }]}>
              <Ionicons name="trash-outline" size={13} color="#EF4444" />
              <Text style={[styles.actionChipText, { color: '#EF4444' }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E8B923" />
        </View>
      ) : (
        <FlatList
          data={[...unread, ...read]}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8B923" />}
          ListHeaderComponent={
            unread.length > 0
              ? <Text style={styles.sectionLabel}>New · {unread.length}</Text>
              : null
          }
          renderItem={({ item, index }) => {
            const isFirstRead = index === unread.length && read.length > 0;
            return (
              <>
                {isFirstRead && <Text style={styles.sectionLabel}>Earlier</Text>}
                <NotifCard item={item} onRead={markRead} onDelete={handleDelete} />
              </>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={44} color="#C4B49A" />
              </View>
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySubtext}>You'll be notified when documents are approved or declined</Text>
            </View>
          }
        />
      )}

      <ClearAllModal
        visible={clearModal}
        onConfirm={handleClearAll}
        onCancel={() => setClearModal(false)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: '#FAFAF8' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: 20, paddingBottom: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    overflow: 'hidden', position: 'relative',
  },
  headerOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.04 },
  decorCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,185,35,0.06)', top: -60, right: -40 } as any,
  decorCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(232,185,35,0.05)', bottom: -30, left: 60 } as any,
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },

  badge: {
    backgroundColor: '#E8B923', minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { color: '#2C2320', fontSize: 11, fontWeight: '800' },

  bellWrap: {
    position: 'relative', width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(232,185,35,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute', top: 6, right: 6, width: 8, height: 8,
    borderRadius: 4, backgroundColor: '#E8B923', borderWidth: 1.5, borderColor: '#3A3131',
  },

  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(232,185,35,0.12)', paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(232,185,35,0.3)',
  },
  actionChipText: { color: '#E8B923', fontSize: 11, fontWeight: '600' },

  list:         { padding: 16 },
  sectionLabel: {
    color: '#A8998A', fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 8,
  },

  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#E8E0D0',
    gap: 12, position: 'relative', overflow: 'hidden',
    shadowColor: '#3A3131', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  notifCardUnread:   { backgroundColor: '#FFFDF5', borderColor: 'rgba(232,185,35,0.4)' },
  notifCardApproved: { borderColor: 'rgba(16,185,129,0.35)', backgroundColor: '#F0FDF4' },
  notifCardRejected: { borderColor: 'rgba(239,68,68,0.3)',  backgroundColor: '#FFF5F5' },

  unreadBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
  },
  notifIcon: {
    width: 46, height: 46, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifContent: { flex: 1 },
  notifHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, gap: 8 },
  notifTitle:   { color: '#1C1713', fontSize: 14, fontWeight: '700', flex: 1 },
  notifTime:    { color: '#A8998A', fontSize: 11, flexShrink: 0, marginTop: 1 },
  notifMessage: { color: '#6B5E52', fontSize: 13, lineHeight: 19 },

  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, marginTop: 6,
  },
  statusChipText: { fontSize: 10, fontWeight: '700' },

  deleteBtn: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB', flexShrink: 0,
  },

  empty: { alignItems: 'center', paddingTop: 80, gap: 14, paddingHorizontal: 32 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: 'rgba(196,180,154,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  emptyText:    { color: '#6B5E52', fontSize: 17, fontWeight: '700' },
  emptySubtext: { color: '#A8998A', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
