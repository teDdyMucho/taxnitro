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

// ── Types ─────────────────────────────────────────────────────────────────────

interface UnreadFile {
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

const FOLDER_LABELS: Record<string, string> = {
  tax_client_uploads:     'Client Uploads',
  tax_required_documents: 'Required Documents',
  tax_contracts:          'Tax Contracts',
  tax_invoices:           'Tax Invoices',
  tax_return_information: 'Tax Returns',
  bk_required_documents:  'Required Documents',
  bk_contracts:           'BK Contracts',
  bk_invoices:            'BK Invoices',
  bk_for_client_review:   'Client Review',
  bk_final_pnl:           'Final P&L',
  cfo_contracts:          'CFO Contracts',
  cfo_invoices:           'CFO Invoices',
  cfo_additional_docs:    'Additional CFO Docs',
  cfo_mr_required_info:   'MR · Required Info',
  cfo_mr_client_review:   'MR · Client Review',
  cfo_mr_final_statements:'MR · Final Statements',
};

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
    const { data } = await supabase
      .from('file_conversations')
      .select('id, file_id, folder_table, sender_name, message, created_at')
      .eq('sender_role', 'client')
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (!mountedRef.current) return;

    const rows = data ?? [];

    // Group by (folder_table, file_id)
    const map = new Map<string, UnreadFile>();
    for (const r of rows) {
      const key = `${r.folder_table}::${r.file_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.unread_count += 1;
        existing.message_ids.push(r.id);
        // keep the latest message (rows are desc so first entry is latest)
      } else {
        map.set(key, {
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

    const grouped = Array.from(map.values());

    // Fetch file names from each table in parallel
    const withNames = await Promise.all(
      grouped.map(async (item) => {
        const { data: fileData } = await supabase
          .from(item.folder_table)
          .select('name, file_name')
          .eq('id', item.file_id)
          .maybeSingle();

        const name = (fileData as any)?.file_name || (fileData as any)?.name || 'Unknown file';
        return { ...item, file_name: name };
      })
    );

    if (mountedRef.current) {
      // Sort by last_at descending
      setItems(withNames.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime()));
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
      }, () => { load(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // ── Mark file read ─────────────────────────────────────────────────────────

  const markFileRead = async (item: UnreadFile) => {
    setMarking(item.file_id);
    await supabase
      .from('file_conversations')
      .update({ is_read: true })
      .in('id', item.message_ids);

    setItems(prev => prev.filter(f => f.file_id !== item.file_id));
    setMarking(null);
    onMarkedRead?.();
  };

  const markAllRead = async () => {
    const allIds = items.flatMap(f => f.message_ids);
    if (allIds.length === 0) return;
    setMarking('__all__');
    await supabase.from('file_conversations').update({ is_read: true }).in('id', allIds);
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
                  <Text style={bs.panelTitle}>Client Replies</Text>
                  <Text style={bs.panelSub}>
                    {totalUnread > 0 ? `${totalUnread} unread message${totalUnread !== 1 ? 's' : ''}` : 'All caught up'}
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
                <Text style={bs.emptyTitle}>No new replies</Text>
                <Text style={bs.emptySub}>All client messages have been read.</Text>
              </View>
            ) : (
              <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {items.map((item, idx) => (
                  <View key={`${item.folder_table}::${item.file_id}`}>
                    {idx > 0 && <View style={bs.sep} />}
                    <View style={bs.item}>
                      {/* Icon */}
                      <LinearGradient
                        colors={['#E8B923', '#B5905B']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={bs.itemAvatar}
                      >
                        <Ionicons name="chatbubble-ellipses" size={14} color="#1C1713" />
                      </LinearGradient>

                      {/* Content */}
                      <View style={bs.itemBody}>
                        <View style={bs.itemTopRow}>
                          <Text style={bs.itemFileName} numberOfLines={1}>{item.file_name}</Text>
                          <Text style={bs.itemTime}>{fmtRelative(item.last_at)}</Text>
                        </View>
                        <View style={bs.itemFolderRow}>
                          <View style={bs.folderTag}>
                            <Text style={bs.folderTagText}>{FOLDER_LABELS[item.folder_table] ?? item.folder_table}</Text>
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
                          disabled={marking === item.file_id}
                          activeOpacity={0.75}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {marking === item.file_id
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
