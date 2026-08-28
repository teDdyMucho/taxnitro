import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { FOLDER_TABLES } from '../db/documents';
import { folderLabel } from '../lib/folderCatalog';

// ── Types ─────────────────────────────────────────────────────────────────────

// One notification row — either a new client comment on a file, or a new client
// upload. Uploads carry no message_ids; they are "read" by flipping the doc status.
interface UnreadFile {
  kind: 'comment' | 'upload';
  file_id: string;
  folder_table: string;
  file_name: string;
  sender_name: string;
  last_message: string;
  last_at: string;
  unread_count: number;
  message_ids: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────


function fmtRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Called after admin marks a file's messages as read, so parent can react */
  onMarkedRead?: () => void;
}

export function AdminReplyBell({ onMarkedRead }: Props) {
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [open, setOpen]         = useState(false);
  const [items, setItems]       = useState<UnreadFile[]>([]);
  const [loading, setLoading]   = useState(false);
  const [marking, setMarking]   = useState<string | null>(null); // file_id being marked

  // ── Load unread client messages ─────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);

    // ── (a) Unread client comments ──────────────────────────────────────────
    const { data: convData } = await supabase
      .from('file_conversations')
      .select('id, file_id, folder_table, sender_name, message, created_at')
      .eq('sender_role', 'client')
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (!mountedRef.current) return;

    // Group comments by (folder_table, file_id)
    const map = new Map<string, UnreadFile>();
    for (const r of convData ?? []) {
      const key = `comment::${r.folder_table}::${r.file_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.unread_count += 1;
        existing.message_ids.push(r.id);
        // keep the latest message (rows are desc so first entry is latest)
      } else {
        map.set(key, {
          kind:          'comment',
          file_id:       r.file_id,
          folder_table:  r.folder_table,
          file_name:     '',   // filled in below
          sender_name:   r.sender_name,
          last_message:  r.message,
          last_at:       r.created_at,
          unread_count:  1,
          message_ids:   [r.id],
        });
      }
    }

    const commentItems = Array.from(map.values());

    // Fetch comment file names from each table in parallel
    const commentsWithNames = await Promise.all(
      commentItems.map(async (item) => {
        const { data: fileData } = await supabase
          .from(item.folder_table)
          .select('name, file_name')
          .eq('id', item.file_id)
          .maybeSingle();
        const name = (fileData as any)?.file_name || (fileData as any)?.name || 'Unknown file';
        return { ...item, file_name: name };
      })
    );

    // ── (b) New client uploads (status='new', uploaded by a client) ─────────
    const uploadResults = await Promise.all(
      FOLDER_TABLES.map(async (table) => {
        const { data } = await supabase
          .from(table)
          .select('id, name, file_name, email, created_at, uploaded_by_role')
          .eq('status', 'new')
          .order('created_at', { ascending: false });
        // Treat rows without an uploader tag as client uploads (legacy default).
        return (data ?? [])
          .filter((d: any) => (d.uploaded_by_role ?? 'client') === 'client')
          .map((d: any): UnreadFile => ({
            kind:         'upload',
            file_id:      d.id,
            folder_table: table,
            file_name:    d.file_name || d.name || 'Unknown file',
            sender_name:  d.email || 'Client',
            last_message: 'Uploaded a new file',
            last_at:      d.created_at,
            unread_count: 1,
            message_ids:  [],
          }));
      })
    );
    const uploadItems = uploadResults.flat();

    if (mountedRef.current) {
      const all = [...commentsWithNames, ...uploadItems]
        .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
      setItems(all);
      setLoading(false);
    }
  }, []);

  // ── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    load();
    const channel = supabase
      .channel('admin_reply_bell')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'file_conversations',
        filter: 'sender_role=eq.client',
      }, () => { load(); })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'file_conversations',
      }, () => { load(); });

    // Live-refresh when a client uploads into any folder table.
    for (const table of FOLDER_TABLES) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, () => { load(); });
    }

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // ── Mark file read ─────────────────────────────────────────────────────────

  const markOneRead = async (item: UnreadFile) => {
    if (item.kind === 'comment') {
      await supabase.from('file_conversations').update({ is_read: true }).in('id', item.message_ids);
    } else {
      // Upload: flip the document status from 'new' → 'viewed'.
      await supabase.from(item.folder_table).update({ status: 'viewed' }).eq('id', item.file_id);
    }
  };

  const markFileRead = async (item: UnreadFile) => {
    setMarking(`${item.kind}:${item.file_id}`);
    await markOneRead(item);
    setItems(prev => prev.filter(f => !(f.kind === item.kind && f.file_id === item.file_id)));
    setMarking(null);
    onMarkedRead?.();
  };

  const markAllRead = async () => {
    if (items.length === 0) return;
    setMarking('__all__');
    // Comments: one batched update. Uploads: per-table batched updates.
    const commentIds = items.filter(i => i.kind === 'comment').flatMap(i => i.message_ids);
    if (commentIds.length > 0) {
      await supabase.from('file_conversations').update({ is_read: true }).in('id', commentIds);
    }
    const uploadsByTable = new Map<string, string[]>();
    for (const i of items.filter(i => i.kind === 'upload')) {
      const arr = uploadsByTable.get(i.folder_table) ?? [];
      arr.push(i.file_id);
      uploadsByTable.set(i.folder_table, arr);
    }
    await Promise.all(
      [...uploadsByTable.entries()].map(([table, ids]) =>
        supabase.from(table).update({ status: 'viewed' }).in('id', ids)
      )
    );
    setItems([]);
    setMarking(null);
    setOpen(false);
    onMarkedRead?.();
  };

  const totalUnread = items.reduce((s, f) => s + f.unread_count, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Bell button ── */}
      <TouchableOpacity
        style={bs.bellWrap}
        onPress={() => { setOpen(true); load(); }}
        activeOpacity={0.75}
      >
        <Ionicons name="notifications-outline" size={20} color="#2C2320" />
        {totalUnread > 0 && (
          <View style={bs.badge}>
            <Text style={bs.badgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Notification panel ── */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={bs.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[bs.panel, { marginTop: insets.top + 70 }]} onPress={() => {}}>

            {/* Panel header */}
            <LinearGradient
              colors={['#3A3131', '#4A3E3E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={bs.panelHeader}
            >
              <View style={bs.panelHeaderLeft}>
                <View style={bs.bellIconWrap}>
                  <Ionicons name="notifications" size={16} color="#E8B923" />
                </View>
                <View>
                  <Text style={bs.panelTitle}>Notifications</Text>
                  <Text style={bs.panelSub}>
                    {totalUnread > 0 ? `${totalUnread} new item${totalUnread !== 1 ? 's' : ''}` : 'All caught up'}
                  </Text>
                </View>
              </View>
              {totalUnread > 0 && (
                <TouchableOpacity
                  style={bs.markAllBtn}
                  onPress={markAllRead}
                  disabled={marking === '__all__'}
                  activeOpacity={0.75}
                >
                  {marking === '__all__'
                    ? <ActivityIndicator size="small" color="#E8B923" />
                    : <Text style={bs.markAllText}>Mark all read</Text>
                  }
                </TouchableOpacity>
              )}
            </LinearGradient>

            {/* Body */}
            {loading ? (
              <View style={bs.loader}>
                <ActivityIndicator color="#E8B923" size="large" />
              </View>
            ) : items.length === 0 ? (
              <View style={bs.empty}>
                <Ionicons name="checkmark-circle-outline" size={48} color="rgba(232,185,35,0.3)" />
                <Text style={bs.emptyTitle}>No new notifications</Text>
                <Text style={bs.emptySub}>New client uploads and messages will appear here.</Text>
              </View>
            ) : (
              <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {items.map((item, idx) => (
                  <View key={`${item.kind}::${item.folder_table}::${item.file_id}`}>
                    {idx > 0 && <View style={bs.sep} />}
                    <View style={bs.item}>
                      {/* Icon */}
                      <LinearGradient
                        colors={item.kind === 'upload' ? ['#10B981', '#059669'] : ['#E8B923', '#B5905B']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={bs.itemAvatar}
                      >
                        <Ionicons name={item.kind === 'upload' ? 'cloud-upload' : 'chatbubble-ellipses'} size={14} color={item.kind === 'upload' ? '#FFFFFF' : '#1C1713'} />
                      </LinearGradient>

                      {/* Content */}
                      <View style={bs.itemBody}>
                        <View style={bs.itemTopRow}>
                          <Text style={bs.itemFileName} numberOfLines={1}>{item.file_name}</Text>
                          <Text style={bs.itemTime}>{fmtRelative(item.last_at)}</Text>
                        </View>
                        <View style={bs.itemFolderRow}>
                          <View style={bs.folderTag}>
                            <Text style={bs.folderTagText}>{folderLabel(item.folder_table)}</Text>
                          </View>
                          <Text style={bs.itemSender}>{item.sender_name}</Text>
                        </View>
                        <Text style={bs.itemMessage} numberOfLines={2}>{item.last_message}</Text>
                      </View>

                      {/* Right side: count + mark read */}
                      <View style={bs.itemRight}>
                        <View style={bs.unreadBubble}>
                          <Text style={bs.unreadBubbleText}>{item.unread_count}</Text>
                        </View>
                        <TouchableOpacity
                          style={bs.readBtn}
                          onPress={() => markFileRead(item)}
                          disabled={marking === `${item.kind}:${item.file_id}`}
                          activeOpacity={0.75}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {marking === `${item.kind}:${item.file_id}`
                            ? <ActivityIndicator size="small" color="#E8B923" />
                            : <Ionicons name="checkmark-done-outline" size={16} color="#E8B923" />
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const bs = StyleSheet.create({
  // Bell button
  bellWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#E8B923',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },

  // Overlay + panel
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    marginHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 40,
    elevation: 24,
  },

  // Panel header
  panelHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  panelHeaderLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellIconWrap: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: 'rgba(232,185,35,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  panelTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  panelSub:   { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 },
  markAllBtn: {
    backgroundColor: 'rgba(232,185,35,0.18)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  markAllText: { color: '#E8B923', fontSize: 11, fontWeight: '700' },

  // Loading / empty
  loader: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  empty:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { color: '#374151', fontSize: 15, fontWeight: '700' },
  emptySub:   { color: '#94A3B8', fontSize: 12 },

  // Item row
  sep:    { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 16 },
  item:   { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  itemAvatar: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  itemBody:  { flex: 1, gap: 4, minWidth: 0 },
  itemTopRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemFileName: { flex: 1, color: '#111827', fontSize: 13, fontWeight: '700' },
  itemTime:  { color: '#94A3B8', fontSize: 10, flexShrink: 0 },
  itemFolderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderTag: {
    backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A',
  },
  folderTagText: { color: '#92400E', fontSize: 9, fontWeight: '700' },
  itemSender:  { color: '#6B7280', fontSize: 10 },
  itemMessage: { color: '#374151', fontSize: 12, lineHeight: 17 },

  itemRight: { alignItems: 'center', gap: 8, flexShrink: 0 },
  unreadBubble: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBubbleText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  readBtn: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: 'rgba(232,185,35,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
});
