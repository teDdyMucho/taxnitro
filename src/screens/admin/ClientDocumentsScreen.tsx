import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Colors } from '../../constants/colors';
import { StatusBadge } from '../../components/StatusBadge';
import { Profile } from '../../db/profiles';
import { useAuth } from '../../context/AuthContext';
import { useSheetStyles } from '../../hooks/useSheetStyles';
import {
  getDocumentsByEmail,
  deleteDocument,
  renameDocument,
  updateDocumentStatus,
  Document,
} from '../../db/documents';
import { createCustomRequest } from '../../db/customRequests';
import {
  useDownloadSelection, DownloadSelectionBar, DownloadNotice, SelectCheckbox,
} from '../../components/DownloadSelectionBar';
import { listSubfoldersForClient, renameSubfolder, subfolderPath, Subfolder } from '../../db/subfolders';
import { dashboardForClient } from '../../lib/clientDashboards';
import { ClientDetailsPanel } from '../../components/ClientDetailsPanel';
import { AdminUploadModal } from '../../components/AdminUploadModal';
import { ClientQuestionnairePanel } from '../../components/ClientQuestionnairePanel';
import {
  monthOf,
  itemsForClient, requiredItemForDocName, stripRequirementPrefix,
  folderTableLabel, normalizeBankAccounts, RequiredItem, BANK_STATEMENTS_KEY,
} from '../../db/requirements';

interface Props {
  client: Profile;
  onBack: () => void;
  /** Opens this client's financial dashboard, when one has been built. */
  onOpenDashboard?: () => void;
  /**
   * The folder that was open last time. This screen is unmounted whenever
   * another tab is shown, so where you were has to be kept above it.
   */
  openFolderKey?: string | null;
  onFolderChange?: (key: string | null) => void;
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

function RenameModal({ visible, current, onConfirm, onCancel, what = 'Document', note }: {
  visible: boolean; current: string; onConfirm: (v: string) => void; onCancel: () => void;
  /** What is being renamed, so the title says it. */
  what?: string;
  /** A line under the title, when there is something worth saying. */
  note?: string;
}) {
  const [value, setValue] = useState(current);
  useEffect(() => { setValue(current); }, [current, visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={rm.overlay} onPress={onCancel}>
        <Pressable style={rm.box} onPress={() => {}}>
          <Text style={rm.title}>Rename {what}</Text>
          {note ? <Text style={rm.note}>{note}</Text> : null}
          <TextInput
            style={rm.input}
            value={value}
            onChangeText={setValue}
            placeholder="New name..."
            placeholderTextColor={Colors.textMuted}
            autoFocus
            selectTextOnFocus
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
  // The box already spaces its children; no margins needed here.
  note: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: -8 },
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
const su = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 28, gap: 10, maxHeight: '88%' },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 13, marginBottom: 4 },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.bgMid },
  folderRowActive: { borderColor: 'rgba(232,185,35,0.5)', backgroundColor: 'rgba(232,185,35,0.1)' },
  folderText: { color: Colors.textSecondary, fontSize: 14 },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,185,35,0.4)', backgroundColor: 'rgba(232,185,35,0.08)' },
  pickText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  sendBtn: { flex: 2, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sendText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
});

// ── Request-a-Document Modal (staff → client custom request) ──────────────────

function RequestDocModal({ client, visible, onClose, onCreated }: {
  client: Profile; visible: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { user } = useAuth();
  const sheet = useSheetStyles('md');
  const [title, setTitle] = useState('');
  const [note, setNote]   = useState('');
  const [busy, setBusy]   = useState(false);

  const reset = () => { setTitle(''); setNote(''); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const ok = await createCustomRequest({
      clientEmail: client.email,
      title: title.trim(),
      note: note.trim() || undefined,
      month: monthOf(),
      requestedBy: user?.email ?? 'staff',
    });
    setBusy(false);
    if (ok) { onCreated(); close(); }
    else Alert.alert('Error', 'Could not create the request.');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[su.overlay, sheet.overlay]} onPress={close}>
        <Pressable style={[su.sheet, sheet.sheet]} onPress={() => {}}>
          <View style={su.handle} />
          <Text style={su.title}>Request a Document</Text>
          <Text style={su.sub}>Ask {client.full_name?.split(' ')[0] || 'the client'} for a one-off document this month. It appears in their Required Documents list.</Text>

          <Text style={su.label}>What do you need?</Text>
          <TextInput
            style={rq.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. August bank reconciliation"
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={su.label}>Note (optional)</Text>
          <TextInput
            style={[rq.input, { minHeight: 70, textAlignVertical: 'top' }]}
            value={note}
            onChangeText={setNote}
            placeholder="Any instructions for the client…"
            placeholderTextColor={Colors.textMuted}
            multiline
          />

          <View style={su.row}>
            <TouchableOpacity style={su.cancelBtn} onPress={close}>
              <Text style={su.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[su.sendBtn, (!title.trim() || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!title.trim() || busy}>
              {busy ? <ActivityIndicator color="#3A3131" size="small" /> : <Text style={su.sendText}>Send Request</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rq = StyleSheet.create({
  input: { backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function ClientDocumentsScreen({
  client, onBack, onOpenDashboard, openFolderKey = null, onFolderChange,
}: Props) {
  // Built per client from their own workbook, so most clients have none.
  const clientDashboard = dashboardForClient(client);
  // Renaming a subfolder from where it is actually browsed. Only the staff-made
  // ones can be renamed — the folder categories are the system's, not a client's.
  const [renameSub, setRenameSub] = useState<Subfolder | null>(null);
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [renameDoc, setRenameDoc] = useState<Document | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  // null → the folder list; otherwise the folder being looked inside.
  const [activeFolderKey, setActiveFolder] = useState<string | null>(openFolderKey);
  // One setter, so the parent is told every time — there is no way to change
  // the folder here and forget to report it.
  const setActiveFolderKey = useCallback((key: string | null) => {
    setActiveFolder(key);
    onFolderChange?.(key);
  }, [onFolderChange]);
  // Staff can file a document into a subfolder from the upload or the file
  // browser. Those are real folders to the client, so they have to appear here
  // too — grouping by the upload label alone hid them on this screen.
  const [subfolders, setSubfolders] = useState<Subfolder[]>([]);
  useEffect(() => {
    let alive = true;
    listSubfoldersForClient(client.email).then(list => { if (alive) setSubfolders(list); });
    return () => { alive = false; };
  }, [client.email]);

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

  // ── Folders, mirroring what the client picked when they uploaded ───────────
  // Required items all share one collector table, so grouping by table would
  // merge every bank account and item into one heap. Regroup by the label the
  // client chose (carried in the filename), falling back to the folder table
  // for staff-delivered and non-required documents.
  const clientItems = useMemo<RequiredItem[]>(
    () => itemsForClient(client.services, client.has_qbo_access, normalizeBankAccounts(client.bank_accounts)),
    [client.services, client.has_qbo_access, client.bank_accounts],
  );

  type DocRow = Document & { displayName: string };
  type FolderBucket = {
    key: string;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    order: number;
    data: DocRow[];
  };

  const folders = useMemo<FolderBucket[]>(() => {
    const buckets = new Map<string, FolderBucket>();

    const subById = new Map(subfolders.map(sf => [sf.id, sf]));

    documents.forEach(doc => {
      const item = requiredItemForDocName(doc.name, clientItems);
      const sub  = doc.subfolder_id ? subById.get(doc.subfolder_id) : undefined;

      // A document filed into a subfolder belongs to that folder first — that is
      // where staff put it, and where they expect to find it again.
      let key: string, title: string, order: number;
      let icon: keyof typeof Ionicons.glyphMap;
      if (sub) {
        // The whole path, so a folder called "January" is not adrift from the
        // bank and year it belongs to.
        key = `sub:${sub.id}`;
        title = subfolderPath(subfolders, sub.id).map(p => p.name).join(' › ') || sub.name;
        order = 500; icon = 'folder';
      } else if (item) {
        key = `req:${item.service}:${item.key}`; title = item.label;
        order = clientItems.indexOf(item);
        icon = item.key.startsWith(BANK_STATEMENTS_KEY) ? 'business-outline' : 'document-text-outline';
      } else {
        key = `tbl:${doc.document_type ?? ''}`; title = folderTableLabel(doc.document_type);
        order = 1000; icon = 'folder-outline';
      }

      const row: DocRow = { ...doc, displayName: stripRequirementPrefix(doc.name, item) };
      const bucket = buckets.get(key);
      if (bucket) bucket.data.push(row);
      else buckets.set(key, { key, title, icon, order, data: [row] });
    });

    // A subfolder with nothing in it yet still gets a card. The standard three
    // are made for every client before anything is filed, and a folder you
    // cannot see is a folder nobody puts anything in.
    subfolders.forEach(sf => {
      const key = `sub:${sf.id}`;
      if (buckets.has(key)) return;
      buckets.set(key, {
        key,
        title: subfolderPath(subfolders, sf.id).map(p => p.name).join(' › ') || sf.name,
        icon: 'folder',
        order: 500,
        data: [],
      });
    });

    return [...buckets.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }, [documents, clientItems, subfolders]);

  const totalDocs   = documents.length;
  const openFolder  = folders.find(f => f.key === activeFolderKey) ?? null;
  const unreadIn    = (rows: DocRow[]) => rows.filter(d => d.status !== 'viewed').length;

  const dl = useDownloadSelection<DocRow>(
    useCallback((d: DocRow) => ({ url: d.document_url, name: d.displayName || d.name }), []),
  );
  // Archives are named for the client and the folder, so several downloads
  // don't all land as "documents.zip".
  const clientSlug = client.full_name || client.email;

  // A folder that empties out (last file deleted) must not strand the view.
  // Not while loading, though: the folder list is empty until the documents
  // arrive, and clearing then would throw away the folder we came back to.
  useEffect(() => {
    if (loading) return;
    if (activeFolderKey && !folders.some(f => f.key === activeFolderKey)) setActiveFolderKey(null);
  }, [loading, folders, activeFolderKey]);

  const renderFolderCard = ({ item }: { item: FolderBucket }) => {
    const unread = unreadIn(item.data);
    const pct    = totalDocs > 0 ? (item.data.length / totalDocs) * 100 : 0;
    return (
      <TouchableOpacity style={s.fCard} onPress={() => setActiveFolderKey(item.key)} activeOpacity={0.8}>
        <View style={s.fIconBox}>
          <Ionicons name={item.icon} size={24} color="#E8B923" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.fTitleRow}>
            <Text style={s.fName} numberOfLines={1}>{item.title}</Text>
            {unread > 0 && (
              <View style={s.fBadge}><Text style={s.fBadgeText}>{unread}</Text></View>
            )}
          </View>
          <Text style={s.fMeta}>
            {item.data.length} document{item.data.length !== 1 ? 's' : ''}
            {unread > 0 ? ` · ${unread} unread` : ' · All viewed'}
          </Text>
          <View style={s.miniBar}>
            <View style={[s.miniBarFill, { width: `${pct}%` as any }]} />
          </View>
        </View>

        {/* Staff-made folders can be renamed; the built-in categories cannot. */}
        {item.key.startsWith('sub:') && (
          <TouchableOpacity
            style={s.folderDlBtn}
            onPress={() => {
              const sf = subfolders.find(x => `sub:${x.id}` === item.key);
              if (sf) setRenameSub(sf);
            }}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Grab the whole folder without opening it. */}
        <TouchableOpacity
          style={[s.folderDlBtn, dl.busy && { opacity: 0.5 }]}
          onPress={() => dl.download(item.data, `${clientSlug} — ${item.title}`)}
          disabled={dl.busy}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="download-outline" size={16} color="#B5905B" />
        </TouchableOpacity>

        <Ionicons name="chevron-forward" size={17} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: DocRow }) => {
    const marked = dl.selected.has(item.id);
    // While marking, the whole row is the checkbox — the per-row actions would
    // only get in the way.
    return (
      <TouchableOpacity
        style={[s.docRow, dl.selecting && marked && s.docRowMarked]}
        activeOpacity={dl.selecting ? 0.7 : 1}
        onPress={dl.selecting ? () => dl.toggle(item.id) : undefined}
        disabled={!dl.selecting}
      >
        {dl.selecting ? (
          <SelectCheckbox checked={marked} />
        ) : (
          <View style={s.docIcon}>
            <Ionicons name="document-outline" size={20} color={Colors.primary} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={s.docName} numberOfLines={1}>{item.displayName}</Text>
          <Text style={[s.docMeta, { marginTop: 4 }]}>{fmtDate(item.created_at)}</Text>
        </View>

        <StatusBadge status={item.status} />

        {!dl.selecting && (
          <View style={s.docActions}>
            <TouchableOpacity style={s.actionBtn} onPress={() => handleView(item)}>
              <Ionicons name="eye-outline" size={16} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => dl.downloadSingle(item)}>
              <Ionicons name="download-outline" size={16} color="#B5905B" />
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => setRenameDoc(item)}>
              <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => setDeleteDoc(item)}>
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const mkInitials = (n: string) => (n ?? '?').split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        <View style={s.headerOverlay} pointerEvents="none" />
        <View style={s.decorCircle1} pointerEvents="none" />
        <View style={s.decorCircle2} pointerEvents="none" />
        {/* Back steps out of a folder first, then off the screen. */}
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => (openFolder ? setActiveFolderKey(null) : onBack())}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <LinearGradient colors={[Colors.primary, Colors.accent]} style={s.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={s.avatarText}>{mkInitials(client.full_name)}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={s.clientName} numberOfLines={1}>
            {openFolder ? openFolder.title : (client.full_name || 'Client')}
          </Text>
          <Text style={s.clientEmail} numberOfLines={1}>
            {openFolder ? client.full_name || client.email : client.email}
          </Text>
          {!loading && (
            <View style={s.metaRow}>
              {openFolder ? (
                <View style={s.metaPill}>
                  <Ionicons name="document-outline" size={11} color="rgba(255,255,255,0.6)" />
                  <Text style={s.metaPillText}>
                    {openFolder.data.length} document{openFolder.data.length !== 1 ? 's' : ''}
                    {unreadIn(openFolder.data) > 0 ? ` · ${unreadIn(openFolder.data)} unread` : ''}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={s.metaPill}>
                    <Ionicons name="folder-outline" size={11} color="rgba(255,255,255,0.6)" />
                    <Text style={s.metaPillText}>{folders.length} folder{folders.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={s.metaPill}>
                    <Ionicons name="document-outline" size={11} color="rgba(255,255,255,0.6)" />
                    <Text style={s.metaPillText}>{totalDocs} document{totalDocs !== 1 ? 's' : ''}</Text>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
        <View style={{ gap: 6 }}>
          <TouchableOpacity style={s.sendFileBtn} onPress={() => setUploadOpen(true)} activeOpacity={0.85}>
            <Ionicons name="cloud-upload-outline" size={15} color="#3A3131" />
            <Text style={s.sendFileText}>Send File</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.requestBtn} onPress={() => setRequestOpen(true)} activeOpacity={0.85}>
            <Ionicons name="clipboard-outline" size={14} color="#E8B923" />
            <Text style={s.requestText}>Request Doc</Text>
          </TouchableOpacity>
          {clientDashboard && onOpenDashboard && (
            <TouchableOpacity style={s.requestBtn} onPress={onOpenDashboard} activeOpacity={0.85}>
              <Ionicons name="stats-chart-outline" size={14} color="#E8B923" />
              <Text style={s.requestText}>Dashboard</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        /* Level 2 — the documents inside one folder */
        openFolder ? (
          <FlatList
            data={openFolder.data}
            keyExtractor={d => d.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            ListHeaderComponent={
              <>
                <Text style={s.sectionLabel}>Documents</Text>
                <DownloadSelectionBar
                  selection={dl}
                  items={openFolder.data}
                  zipName={`${clientSlug} — ${openFolder.title}`}
                  label="documents"
                />
              </>
            }
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
            ListEmptyComponent={<Text style={s.empty}>This folder is empty.</Text>}
          />
        ) : (
          /* Level 1 — a folder per document type the client uploaded under */
          <FlatList
            data={folders}
            keyExtractor={f => f.key}
            renderItem={renderFolderCard}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            ListHeaderComponent={
              <>
                {/* What the team knows about this business, where the files are. */}
                <ClientDetailsPanel clientEmail={client.email} clientName={client.full_name} />
                {/* And what the client told us themselves, month by month. */}
                <ClientQuestionnairePanel
                  clientEmail={client.email}
                  accounts={normalizeBankAccounts(client.bank_accounts)}
                />
                {folders.length > 0 && (
                  <>
                    <Text style={s.sectionLabel}>Folders</Text>
                    {/* Everything this client has, in one archive. */}
                    <DownloadSelectionBar
                      selection={dl}
                      items={folders.flatMap(f => f.data)}
                      zipName={`${clientSlug} — All documents`}
                      label="documents"
                      allowSelect={false}
                    />
                  </>
                )}
              </>
            }
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
            ListEmptyComponent={<Text style={s.empty}>No documents for this client.</Text>}
          />
        )
      )}

      <DownloadNotice message={dl.notice} />

      {/* Modals */}
      {viewerUrl && <DocViewerModal url={viewerUrl} onClose={() => setViewerUrl(null)} />}

      <RenameModal
        visible={!!renameSub}
        what="Folder"
        note="The files inside stay where they are."
        current={renameSub?.name ?? ''}
        onConfirm={async name => {
          const target = renameSub;
          setRenameSub(null);
          if (!target) return;
          const row = await renameSubfolder(target.id, name);
          // A clash with another folder of that name is the usual failure; the
          // list is left untouched rather than showing a rename that did not happen.
          if (row) setSubfolders(prev => prev.map(sf => (sf.id === row.id ? row : sf)));
        }}
        onCancel={() => setRenameSub(null)}
      />

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

      {/* The same upload used from the Documents tab — drag and drop, several
          files at once, queued by where each one is going. The client is fixed
          here, so it does not ask which one. */}
      <AdminUploadModal
        fixedClient={client}
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={d => setDocuments(prev => [d, ...prev])}
      />

      <RequestDocModal
        client={client}
        visible={requestOpen}
        onClose={() => setRequestOpen(false)}
        onCreated={() => {}}
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
  sendFileBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8B923', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  sendFileText: { color: '#3A3131', fontSize: 12, fontWeight: '700' },
  requestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(232,185,35,0.5)' },
  requestText: { color: '#E8B923', fontSize: 12, fontWeight: '700' },
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
  docRowMarked: {
    backgroundColor: 'rgba(232,185,35,0.08)',
    borderColor: 'rgba(232,185,35,0.5)',
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

  /* Header meta pills — folder / document counts */
  metaRow:      { flexDirection: 'row', gap: 10, marginTop: 4 },
  metaPill:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaPillText: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  /* Folder cards — one per document type the client uploaded under.
     Mirrors the client's own Documents tab so both sides read the same. */
  fCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E0D0',
    gap: 14,
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  fIconBox: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(232,185,35,0.12)',
  },
  fTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  fName:     { color: '#1C1713', fontSize: 15, fontWeight: '700', flex: 1 },
  fBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5, backgroundColor: '#E8B923',
  },
  fBadgeText: { color: '#2C2320', fontSize: 10, fontWeight: '800' },
  folderDlBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(232,185,35,0.12)',
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.35)',
  },
  fMeta:      { color: '#A8998A', fontSize: 12, marginBottom: 8 },
  miniBar:    { height: 3, backgroundColor: '#F5F0E8', borderRadius: 2, overflow: 'hidden' },
  miniBarFill:{ height: '100%', borderRadius: 2, backgroundColor: '#E8B923' },
});
