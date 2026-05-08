import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  Modal,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Colors } from '../../constants/colors';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { getDocumentsByEmail, updateDocumentStatus, Document } from '../../db/documents';
import { supabase } from '../../lib/supabase';

// ── types ────────────────────────────────────────────────────
type FolderKey = 'Internal' | 'External';
type FilterType = 'all' | 'new' | 'viewed';
type SortType   = 'date' | 'name';

const FOLDERS: { key: FolderKey; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { key: 'Internal', label: 'Internal',  icon: 'lock-closed', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  { key: 'External', label: 'External',  icon: 'globe-outline', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
];

// ── helpers ──────────────────────────────────────────────────
function folderOf(doc: Document): FolderKey {
  const t = (doc.document_type ?? '').toLowerCase();
  return t === 'internal' ? 'Internal' : 'External';
}

function displayName(doc: Document): string {
  return doc.file_name || doc.name || 'Document';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── main screen ──────────────────────────────────────────────
export function DocumentsScreen() {
  const { user } = useAuth();
  const [documents, setDocuments]   = useState<Document[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openFolder, setOpenFolder] = useState<FolderKey | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [opening, setOpening]       = useState(false);
  const insets = useSafeAreaInsets();

  // folder-level search / filter / sort
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<FilterType>('all');
  const [sort, setSort]       = useState<SortType>('date');

  const loadDocuments = useCallback(async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    const data = await getDocumentsByEmail(user.email);
    setDocuments(data);
    setLoading(false);
  }, [user?.email]);

  useEffect(() => {
    setLoading(true);
    loadDocuments();
  }, [loadDocuments]);

  // Real-time subscription for documents
  useEffect(() => {
    if (!user?.email) return;

    const channel = supabase
      .channel(`documents:${user.email}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'documents', filter: `email=eq.${user.email}` },
        (payload) => {
          setDocuments(prev => [payload.new as Document, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'documents', filter: `email=eq.${user.email}` },
        (payload) => {
          const updated = payload.new as Document;
          setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
          setSelectedDoc(prev => prev?.id === updated.id ? updated : prev);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'documents' },
        (payload) => {
          setDocuments(prev => prev.filter(d => d.id !== (payload.old as Document).id));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.email]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDocuments();
    setRefreshing(false);
  }, [loadDocuments]);

  // split into folders
  const folderCounts = useMemo(() => {
    const counts: Record<FolderKey, { total: number; unread: number }> = {
      Internal: { total: 0, unread: 0 },
      External: { total: 0, unread: 0 },
    };
    documents.forEach(d => {
      const f = folderOf(d);
      counts[f].total++;
      if (d.status !== 'viewed') counts[f].unread++;
    });
    return counts;
  }, [documents]);

  const totalDocs   = documents.length;
  const totalUnread = documents.filter(d => d.status !== 'viewed').length;

  // docs inside open folder, filtered / sorted
  const folderDocs = useMemo(() => {
    if (!openFolder) return [];
    let items = documents.filter(d => folderOf(d) === openFolder);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(d => displayName(d).toLowerCase().includes(q));
    }
    if (filter !== 'all') items = items.filter(d => d.status === filter);
    if (sort === 'name') items.sort((a, b) => displayName(a).localeCompare(displayName(b)));
    else items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items;
  }, [documents, openFolder, search, filter, sort]);

  const markViewed = useCallback(async (doc: Document) => {
    if (doc.status === 'viewed') return;
    await updateDocumentStatus(doc.id, 'viewed');
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'viewed' } : d));
    setSelectedDoc(prev => prev?.id === doc.id ? { ...prev, status: 'viewed' } : prev);
  }, []);

  const openDocument = useCallback(async (doc: Document) => {
    if (!doc.document_url) { Alert.alert('No URL', 'This document has no link.'); return; }
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(doc.document_url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        toolbarColor: Colors.bgDark,
        controlsColor: Colors.primary,
      });
      await markViewed(doc);
    } catch {
      Alert.alert('Error', 'Could not open the document.');
    } finally {
      setOpening(false);
    }
  }, [markViewed]);

  const filterOptions: { key: FilterType; label: string }[] = [
    { key: 'all',    label: 'All' },
    { key: 'new',    label: 'New' },
    { key: 'viewed', label: 'Viewed' },
  ];

  // ── folder list view ─────────────────────────────────────
  if (!openFolder) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 16 : insets.top + 12 }]}>
          <Text style={styles.headerTitle}>Documents</Text>
          <Text style={styles.headerSubtitle}>
            {loading ? '—' : `${totalDocs} document${totalDocs !== 1 ? 's' : ''}${totalUnread > 0 ? ` · ${totalUnread} unread` : ''}`}
          </Text>
        </View>

        {loading ? (
          <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.folderList, { paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 90 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            showsVerticalScrollIndicator={false}
          >
            {FOLDERS.map(folder => {
              const counts = folderCounts[folder.key];
              return (
                <TouchableOpacity
                  key={folder.key}
                  style={styles.folderCard}
                  onPress={() => { setSearch(''); setFilter('all'); setSort('date'); setOpenFolder(folder.key); }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.folderIconWrap, { backgroundColor: folder.bg }]}>
                    <Ionicons name={folder.icon} size={28} color={folder.color} />
                    {counts.unread > 0 && (
                      <View style={styles.folderBadge}>
                        <Text style={styles.folderBadgeText}>{counts.unread > 9 ? '9+' : counts.unread}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.folderInfo}>
                    <Text style={styles.folderName}>{folder.label}</Text>
                    <Text style={styles.folderMeta}>
                      {counts.total} document{counts.total !== 1 ? 's' : ''}
                      {counts.unread > 0 ? ` · ${counts.unread} unread` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            })}

            {totalDocs === 0 && (
              <View style={styles.emptyFolders}>
                <Ionicons name="folder-open-outline" size={56} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No documents yet</Text>
                <Text style={styles.emptySub}>Documents shared with you will appear here</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  // ── document list inside folder ──────────────────────────
  const currentFolder = FOLDERS.find(f => f.key === openFolder)!;

  return (
    <View style={styles.root}>
      {/* Folder header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 16 : insets.top + 12 }]}>
        <View style={styles.folderHeaderTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setOpenFolder(null)}>
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.folderHeaderTitle}>
            <View style={[styles.folderIconSm, { backgroundColor: currentFolder.bg }]}>
              <Ionicons name={currentFolder.icon} size={16} color={currentFolder.color} />
            </View>
            <Text style={styles.headerTitle}>{currentFolder.label}</Text>
          </View>
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setSort(s => s === 'date' ? 'name' : 'date')}
          >
            <Ionicons name="swap-vertical-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.sortText}>{sort === 'date' ? 'Date' : 'Name'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search documents..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {filterOptions.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
              onPress={() => setFilter(opt.key)}
            >
              <Text style={[styles.filterText, filter === opt.key && styles.filterTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={folderDocs}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        renderItem={({ item }) => (
          <DocCard
            doc={item}
            onPress={() => setSelectedDoc(item)}
            onOpen={() => openDocument(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyFolders}>
            <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No documents here</Text>
          </View>
        }
      />

      {/* Document detail sheet */}
      <Modal visible={!!selectedDoc} animationType="slide" transparent onRequestClose={() => setSelectedDoc(null)}>
        {selectedDoc && (
          <Pressable style={sheetStyles.overlay} onPress={() => setSelectedDoc(null)}>
            <Pressable style={sheetStyles.sheet} onPress={e => e.stopPropagation()}>
              <View style={sheetStyles.handle} />

              <View style={[sheetStyles.iconWrap, { backgroundColor: currentFolder.bg }]}>
                <Ionicons name="document-text" size={40} color={currentFolder.color} />
              </View>

              <Text style={sheetStyles.fileName}>{displayName(selectedDoc)}</Text>
              <View style={{ marginBottom: 16 }}>
                <StatusBadge status={selectedDoc.status} />
              </View>

              <View style={sheetStyles.meta}>
                <MetaRow icon="calendar-outline" label="Date"   value={formatDateLong(selectedDoc.created_at)} />
                <MetaRow icon="folder-outline"   label="Folder" value={folderOf(selectedDoc)} />
                <MetaRow icon="mail-outline"     label="Email"  value={selectedDoc.email ?? '—'} />
              </View>

              <TouchableOpacity
                style={sheetStyles.openBtn}
                onPress={() => openDocument(selectedDoc)}
                disabled={opening}
              >
                {opening
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Ionicons name="eye-outline" size={20} color={Colors.white} />}
                <Text style={sheetStyles.openBtnText}>{opening ? 'Opening…' : 'View Document'}</Text>
              </TouchableOpacity>

              {selectedDoc.status !== 'viewed' && (
                <TouchableOpacity style={sheetStyles.markBtn} onPress={() => markViewed(selectedDoc)}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={Colors.primary} />
                  <Text style={sheetStyles.markBtnText}>Mark as Viewed</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={sheetStyles.closeBtn} onPress={() => setSelectedDoc(null)}>
                <Text style={sheetStyles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        )}
      </Modal>
    </View>
  );
}

// ── Doc card ─────────────────────────────────────────────────
function DocCard({ doc, onPress, onOpen }: { doc: Document; onPress: () => void; onOpen: () => void }) {
  const isUnread = doc.status !== 'viewed';
  return (
    <TouchableOpacity style={[styles.card, isUnread && styles.cardUnread]} onPress={onPress} activeOpacity={0.75}>
      {isUnread && <View style={styles.unreadBar} />}
      <View style={[styles.cardIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
        <Ionicons name="document-text" size={22} color="#EF4444" />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>{displayName(doc)}</Text>
        <Text style={styles.cardMeta}>{formatDate(doc.created_at)}</Text>
      </View>
      <View style={styles.cardRight}>
        <StatusBadge status={doc.status} size="sm" />
        <TouchableOpacity onPress={onOpen} style={styles.quickOpen} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="open-outline" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function MetaRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={sheetStyles.metaRow}>
      <Ionicons name={icon} size={14} color={Colors.textMuted} />
      <Text style={sheetStyles.metaLabel}>{label}</Text>
      <Text style={sheetStyles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: Colors.bgDark,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle:    { color: Colors.textPrimary, fontSize: 22, fontWeight: '700' },
  headerSubtitle: { color: Colors.textMuted,   fontSize: 12, marginTop: 2, marginBottom: 4 },
  folderHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.bgMid, alignItems: 'center', justifyContent: 'center' },
  folderHeaderTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  folderIconSm: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgMid, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  sortText: { color: Colors.textMuted, fontSize: 11, fontWeight: '500' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgMid, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, paddingVertical: 10 },
  filterRow: { flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.bgMid, marginRight: 8, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText:       { color: Colors.textMuted, fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: Colors.white, fontWeight: '600' },
  // folder list
  folderList: { padding: 16, gap: 12 },
  folderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 14 },
  folderIconWrap: { width: 58, height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  folderBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: Colors.bgCard },
  folderBadgeText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
  folderInfo: { flex: 1 },
  folderName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  folderMeta: { color: Colors.textMuted, fontSize: 13 },
  emptyFolders: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  emptySub:   { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
  // doc list
  list: { padding: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 12, position: 'relative', overflow: 'hidden' },
  cardUnread: { backgroundColor: Colors.bgElevated, borderColor: 'rgba(37,99,235,0.25)' },
  unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: Colors.primary, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  cardIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 4, lineHeight: 20 },
  cardMeta: { color: Colors.textMuted, fontSize: 12 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  quickOpen: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' },
});

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: 'center', borderTopWidth: 1, borderColor: Colors.border },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 20 },
  iconWrap: { width: 76, height: 76, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  fileName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 10, paddingHorizontal: 8 },
  meta: { width: '100%', backgroundColor: Colors.bgMid, borderRadius: 14, padding: 14, marginBottom: 20, gap: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaLabel: { color: Colors.textMuted, fontSize: 13, width: 52 },
  metaValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 15, borderRadius: 14, width: '100%', justifyContent: 'center', marginBottom: 10, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  openBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  markBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)', backgroundColor: 'rgba(37,99,235,0.08)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, width: '100%', justifyContent: 'center', marginBottom: 10 },
  markBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  closeBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  closeBtnText: { color: Colors.textMuted, fontSize: 14 },
});
