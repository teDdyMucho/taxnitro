import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Colors } from '../../constants/colors';
import { StatusBadge } from '../../components/StatusBadge';
import { Profile } from '../../db/profiles';
import {
  getDocumentsByEmail,
  deleteDocument,
  renameDocument,
  updateDocumentStatus,
  Document,
} from '../../db/documents';

interface Props {
  client: Profile;
  onBack: () => void;
}

// ── Viewer Modal ──────────────────────────────────────────────────────────────

function DocViewerModal({ url, onClose }: { url: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bgDeep, paddingTop: insets.top }}>
        <View style={vm.bar}>
          <TouchableOpacity onPress={onClose} style={vm.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={vm.barTitle} numberOfLines={1}>Document Preview</Text>
        </View>
        {Platform.OS === 'web'
          ? React.createElement('iframe', {
              src: url,
              style: { flex: 1, width: '100%', height: '100%', border: 'none' },
            })
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
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
});

// ── Rename Modal ──────────────────────────────────────────────────────────────

function RenameModal({ visible, current, onConfirm, onCancel }: {
  visible: boolean; current: string; onConfirm: (v: string) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState(current);
  useEffect(() => { setValue(current); }, [current, visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={rm.overlay} onPress={onCancel}>
        <Pressable style={rm.box} onPress={() => {}}>
          <Text style={rm.title}>Rename Document</Text>
          <TextInput
            style={rm.input}
            value={value}
            onChangeText={setValue}
            placeholder="New name..."
            placeholderTextColor={Colors.textMuted}
            autoFocus
          />
          <View style={rm.row}>
            <TouchableOpacity style={rm.cancelBtn} onPress={onCancel}>
              <Text style={rm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rm.confirmBtn} onPress={() => value.trim() && onConfirm(value.trim())}>
              <Text style={rm.confirmText}>Rename</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  box: { backgroundColor: Colors.bgCard, borderRadius: 20, padding: 24, width: 320, gap: 16, borderWidth: 1, borderColor: Colors.border },
  title: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  input: { backgroundColor: Colors.bgMid, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: Colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  confirmBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  confirmText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({ visible, name, onConfirm, onCancel }: {
  visible: boolean; name: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={dm.overlay} onPress={onCancel}>
        <Pressable style={dm.box} onPress={() => {}}>
          <View style={dm.iconWrap}>
            <Ionicons name="trash-outline" size={28} color={Colors.error} />
          </View>
          <Text style={dm.title}>Delete Document?</Text>
          <Text style={dm.sub} numberOfLines={2}>{name}</Text>
          <View style={dm.row}>
            <TouchableOpacity style={dm.cancelBtn} onPress={onCancel}>
              <Text style={dm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dm.deleteBtn} onPress={() => { onCancel(); onConfirm(); }}>
              <Text style={dm.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  box: { backgroundColor: Colors.bgCard, borderRadius: 20, padding: 24, width: 320, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border },
  iconWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.error + '20', alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  sub: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  deleteBtn: { flex: 1, backgroundColor: Colors.error, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  deleteText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function ClientDocumentsScreen({ client, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [renameDoc, setRenameDoc] = useState<Document | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const docs = await getDocumentsByEmail(client.email);
      setDocuments(docs);
    } catch (e) {
      console.error('ClientDocuments load:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client.email]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (doc: Document) => {
    const table = doc.document_type ?? '';
    const ok = await deleteDocument(doc.id, table);
    if (ok) setDocuments(prev => prev.filter(d => d.id !== doc.id));
  };

  const handleRename = async (doc: Document, newName: string) => {
    const table = doc.document_type ?? '';
    const ok = await renameDocument(doc.id, newName, table);
    if (ok) setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, name: newName, file_name: newName } : d));
  };

  const handleView = async (doc: Document) => {
    const table = doc.document_type ?? '';
    if (doc.status === 'new') {
      await updateDocumentStatus(doc.id, 'viewed', table);
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'viewed' } : d));
    }
    setViewerUrl(doc.document_url);
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const renderItem = ({ item }: { item: Document }) => (
    <View style={s.docRow}>
      <View style={s.docIcon}>
        <Ionicons name="document-outline" size={20} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.docName} numberOfLines={1}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text style={s.docMeta}>{item.document_type?.replace(/_/g, ' ')}</Text>
          <Text style={s.docMeta}>·</Text>
          <Text style={s.docMeta}>{fmtDate(item.created_at)}</Text>
        </View>
      </View>
      <StatusBadge status={item.status} />
      <View style={s.docActions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => handleView(item)}>
          <Ionicons name="eye-outline" size={16} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => setRenameDoc(item)}>
          <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => setDeleteDoc(item)}>
          <Ionicons name="trash-outline" size={16} color={Colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const mkInitials = (n: string) => (n ?? '?').split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        <View style={s.headerOverlay} pointerEvents="none" />
        <View style={s.decorCircle1} pointerEvents="none" />
        <View style={s.decorCircle2} pointerEvents="none" />
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <LinearGradient colors={[Colors.primary, Colors.accent]} style={s.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={s.avatarText}>{mkInitials(client.full_name)}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={s.clientName}>{client.full_name || 'Client'}</Text>
          <Text style={s.clientEmail}>{client.email}</Text>
        </View>
        <Text style={s.docCount}>{documents.length} docs</Text>
      </LinearGradient>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={d => d.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
          ListEmptyComponent={<Text style={s.empty}>No documents for this client.</Text>}
        />
      )}

      {/* Modals */}
      {viewerUrl && <DocViewerModal url={viewerUrl} onClose={() => setViewerUrl(null)} />}

      <RenameModal
        visible={!!renameDoc}
        current={renameDoc?.name ?? ''}
        onConfirm={name => { if (renameDoc) { handleRename(renameDoc, name); setRenameDoc(null); } }}
        onCancel={() => setRenameDoc(null)}
      />

      <DeleteConfirmModal
        visible={!!deleteDoc}
        name={deleteDoc?.name ?? ''}
        onConfirm={() => { if (deleteDoc) { handleDelete(deleteDoc); setDeleteDoc(null); } }}
        onCancel={() => setDeleteDoc(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  headerOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.04 },
  decorCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,185,35,0.06)', top: -60, right: -40 } as any,
  decorCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(232,185,35,0.05)', bottom: -30, left: 60 } as any,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  clientName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  clientEmail: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  docCount: { color: Colors.textMuted, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  docMeta: { color: Colors.textMuted, fontSize: 11 },
  docActions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
});
