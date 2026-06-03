import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Colors } from '../../constants/colors';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import {
  getAllDocuments,
  deleteDocument,
  updateDocumentStatus,
  Document,
} from '../../db/documents';

// ── Viewer Modal ───────────────────────────────────────────────────────────────

function DocViewerModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bgDeep, paddingTop: insets.top }}>
        <View style={vm.bar}>
          <TouchableOpacity onPress={onClose} style={vm.closeBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={vm.title} numberOfLines={1}>{name}</Text>
        </View>
        {Platform.OS === 'web'
          ? React.createElement('iframe', { src: url, style: { flex: 1, width: '100%', height: '100%', border: 'none' } })
          : <WebView source={{ uri: url }} style={{ flex: 1 }} />}
      </View>
    </Modal>
  );
}

const vm = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
    backgroundColor: Colors.bgCard,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', flex: 1 },
});

// ── Delete Modal ───────────────────────────────────────────────────────────────

function DeleteModal({
  visible,
  name,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={dm.overlay} onPress={onCancel}>
        <Pressable style={dm.box} onPress={() => {}}>
          <View style={dm.iconWrap}>
            <Ionicons name="trash-outline" size={28} color="#EF4444" />
          </View>
          <Text style={dm.title}>Delete Document?</Text>
          <Text style={dm.sub} numberOfLines={2}>{name}</Text>
          <Text style={dm.warning}>This action cannot be undone.</Text>
          <View style={dm.row}>
            <TouchableOpacity style={dm.cancelBtn} onPress={onCancel}>
              <Text style={dm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dm.deleteBtn}
              onPress={() => { onCancel(); onConfirm(); }}
            >
              <Text style={dm.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    width: 320,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { color: '#111827', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sub: { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  warning: { color: '#EF4444', fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 10 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelText: { color: '#64748B', fontWeight: '700', fontSize: 14 },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

// ── Config ─────────────────────────────────────────────────────────────────────

const FOLDERS = [
  { key: 'all',                    label: 'All',            color: '#2C2320' },
  { key: 'tax_client_uploads',     label: 'Client Uploads', color: '#E8B923' },
  { key: 'tax_contracts',          label: 'Tax Contracts',  color: '#B5905B' },
  { key: 'tax_invoices',           label: 'Tax Invoices',   color: '#E8B923' },
  { key: 'tax_return_information', label: 'Returns',        color: '#B5905B' },
  { key: 'bk_contracts',           label: 'BK Contracts',   color: '#2C2320' },
  { key: 'bk_invoices',            label: 'BK Invoices',    color: '#E8B923' },
  { key: 'bk_for_client_review',   label: 'Client Review',  color: '#B5905B' },
  { key: 'bk_final_pnl',           label: 'Final P&L',      color: '#2C2320' },
];

const EXT_COLOR: Record<string, string> = {
  pdf:  '#2C2320',
  doc:  '#B5905B',
  docx: '#B5905B',
  xls:  '#E8B923',
  xlsx: '#E8B923',
  jpg:  '#B5905B',
  jpeg: '#B5905B',
  png:  '#B5905B',
};

const getExt    = (name: string) => name.split('.').pop()?.toLowerCase() ?? 'file';
const folderOf  = (key: string)  => FOLDERS.find(f => f.key === key) ?? FOLDERS[0];
const fmtDate   = (iso: string)  => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ── Main ───────────────────────────────────────────────────────────────────────

export function AdminDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [documents, setDocuments]   = useState<Document[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('all'); // 'all' = show all, used internally
  const [viewerDoc, setViewerDoc]   = useState<Document | null>(null);
  const [deleteDoc, setDeleteDoc]   = useState<Document | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    // No setLoading(true) — show existing content immediately
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }, 8000);
    try {
      const docs = await getAllDocuments();
      if (mountedRef.current) setDocuments(docs);
    }
    catch (e) { console.error(e); }
    finally { clearTimeout(safetyTimer); if (mountedRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  const { user, isLoading: authLoading } = useAuth();
  useEffect(() => { if (!authLoading && user?.id) load(); }, [authLoading, user?.id]);

  const filtered = documents.filter(d =>
    (filter === 'all' || d.document_type === filter) &&
    (!query.trim() ||
      d.name?.toLowerCase().includes(query.toLowerCase()) ||
      d.email?.toLowerCase().includes(query.toLowerCase()))
  );

  const handleView = async (doc: Document) => {
    if (doc.status === 'new') {
      await updateDocumentStatus(doc.id, 'viewed', doc.document_type ?? '');
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'viewed' } : d));
    }
    setViewerDoc(doc);
  };

  const handleDelete = async (doc: Document) => {
    if (await deleteDocument(doc.id, doc.document_type ?? ''))
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
  };

  // ── Document Card ────────────────────────────────────────────────────────────

  const renderDoc = ({ item }: { item: Document }) => {
    const ext    = getExt(item.name);
    const color  = EXT_COLOR[ext] ?? '#64748B';
    const folder = folderOf(item.document_type ?? '');

    return (
      <View style={s.card}>
        {/* File type badge */}
        <View style={[s.fileBadge, { backgroundColor: color + '15' }]}>
          <Text style={[s.fileBadgeExt, { color }]}>{ext.slice(0, 4).toUpperCase()}</Text>
          <Ionicons name="document-outline" size={11} color={color} style={{ opacity: 0.7 }} />
        </View>

        {/* Info */}
        <View style={s.info}>
          <Text style={s.docName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.docEmail} numberOfLines={1}>{item.email}</Text>
          <View style={s.metaRow}>
            <View style={[s.folderPill, { backgroundColor: folder.color + '12', borderColor: folder.color + '40' }]}>
              <View style={[s.folderDot, { backgroundColor: folder.color }]} />
              <Text style={[s.folderLabel, { color: folder.color }]}>{folder.label}</Text>
            </View>
            <Text style={s.dateText}>{fmtDate(item.created_at)}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <StatusBadge status={item.status} />
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.actionBtn, s.viewBtn]}
              onPress={() => handleView(item)}
              activeOpacity={0.75}
            >
              <Ionicons name="eye-outline" size={14} color="#1C1713" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.deleteBtn]}
              onPress={() => setDeleteDoc(item)}
              activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // ── Empty State ──────────────────────────────────────────────────────────────

  const EmptyState = () => (
    <View style={s.emptyWrap}>
      <LinearGradient
        colors={['#FEF3C7', '#FDE68A']}
        style={s.emptyCircle}
      >
        <Ionicons name="documents-outline" size={40} color="#E8B923" />
      </LinearGradient>
      <Text style={s.emptyTitle}>No documents found</Text>
      <Text style={s.emptyText}>
        {query
          ? `No results for "${query}"`
          : filter !== 'all'
          ? 'No documents in this folder yet.'
          : 'No documents have been uploaded yet.'}
      </Text>
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  const newCount = documents.filter(d => d.status === 'new').length;

  return (
    <View style={s.root}>

      {/* ── Header — same gradient as dashboard ── */}
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>All Documents</Text>
          <Text style={s.headerSub}>
            {documents.length} total{newCount > 0 ? ` · ${newCount} new` : ''}
          </Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={() => load(true)} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={18} color="#2C2320" />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Search Bar ── */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" />
          <TextInput
            style={[s.searchInput, { outlineWidth: 0 } as any]}
            placeholder="Search by name or client email..."
            placeholderTextColor="#94A3B8"
            value={query}
            onChangeText={setQuery}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Filter Chips ── */}
      <View style={s.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterScroll}
        >
          {FOLDERS.map(f => {
            const active = filter === f.key;
            const cnt = f.key === 'all' ? documents.length : documents.filter(d => d.document_type === f.key).length;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.75}
                style={[
                  s.chip,
                  active
                    ? { backgroundColor: '#E8B923', borderColor: '#E8B923' }
                    : { backgroundColor: '#FFFFFF', borderColor: '#E8E0D0' },
                ]}
              >
                <Text
                  style={[
                    s.chipText,
                    active ? { color: '#1C1713' } : { color: '#6B5E52' },
                  ]}
                >
                  {f.label}
                </Text>
                {cnt > 0 && (
                  <View
                    style={[
                      s.chipCount,
                      active
                        ? { backgroundColor: 'rgba(255,255,255,0.25)' }
                        : { backgroundColor: '#F1F5F9' },
                    ]}
                  >
                    <Text
                      style={[
                        s.chipCountText,
                        active ? { color: '#FFFFFF' } : { color: '#94A3B8' },
                      ]}
                    >
                      {cnt}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color="#10B981" size="large" />
          <Text style={s.loadingText}>Fetching documents…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={d => d.id}
          renderItem={renderDoc}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#10B981"
              colors={['#10B981']}
            />
          }
          ListEmptyComponent={<EmptyState />}
        />
      )}

      {/* ── Modals ── */}
      {viewerDoc && (
        <DocViewerModal
          url={viewerDoc.document_url}
          name={viewerDoc.name}
          onClose={() => setViewerDoc(null)}
        />
      )}
      <DeleteModal
        visible={!!deleteDoc}
        name={deleteDoc?.name ?? ''}
        onConfirm={() => { if (deleteDoc) { handleDelete(deleteDoc); setDeleteDoc(null); } }}
        onCancel={() => setDeleteDoc(null)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  // Header — gradient matches dashboard
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E8B923',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    fontWeight: '500',
  },

  // Filter chips
  filterWrap: {
    height: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  chipCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  chipCountText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // List
  list: { padding: 16, gap: 10, paddingBottom: 48 },

  // Document card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },

  // File badge (left side)
  fileBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  fileBadgeExt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Middle info
  info:     { flex: 1, gap: 3 },
  docName:  { color: '#111827', fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  docEmail: { color: '#94A3B8', fontSize: 12, fontWeight: '400' },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },

  folderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  folderDot:   { width: 5, height: 5, borderRadius: 3 },
  folderLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  dateText:    { color: '#94A3B8', fontSize: 10, fontWeight: '500' },

  // Right actions
  actions: { alignItems: 'flex-end', gap: 8 },
  btnRow:  { flexDirection: 'row', gap: 6 },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtn:   { backgroundColor: '#E8B923' },
  deleteBtn: { backgroundColor: '#DC2626' },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 14,
    paddingHorizontal: 32,
  },
  emptyCircle: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '400',
  },
});
