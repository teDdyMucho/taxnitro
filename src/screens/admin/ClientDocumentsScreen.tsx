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
import * as DocumentPicker from 'expo-document-picker';
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
  uploadDocumentToStorage,
  createDocumentRecord,
  Document,
} from '../../db/documents';
import { createCustomRequest } from '../../db/customRequests';
import {
  useDownloadSelection, DownloadSelectionBar, DownloadNotice, SelectCheckbox,
} from '../../components/DownloadSelectionBar';
import { listSubfoldersForClient, Subfolder } from '../../db/subfolders';
import { dashboardForClient } from '../../lib/clientDashboards';
import {
  monthOf, isStaffLabelFolder, staffLabelsForFolder,
  itemsForClient, requiredItemForDocName, stripRequirementPrefix,
  folderTableLabel, normalizeBankAccounts, RequiredItem, BANK_STATEMENTS_KEY,
} from '../../db/requirements';

interface Props {
  client: Profile;
  onBack: () => void;
  /** Opens this client's financial dashboard, when one has been built. */
  onOpenDashboard?: () => void;
}

// Folders staff can deliver files into, per the client's services.
// (Only staff-deliverable folders — not the client-upload / required-docs ones.)
const STAFF_UPLOAD_FOLDERS: { key: string; label: string; service: 'BK' | 'TAX' | 'CFO' }[] = [
  { key: 'bk_final_pnl',         label: 'Additional BK Docs',          service: 'BK'  },
  { key: 'bk_contracts',         label: 'Contracts (BK)',              service: 'BK'  },
  { key: 'bk_invoices',          label: 'Invoices (BK)',               service: 'BK'  },
  { key: 'bk_mr_client_review',  label: 'Monthly Reporting (For Client Review)', service: 'BK' },
  { key: 'bk_mr_final_statements', label: 'Monthly Reporting (Final Statements)', service: 'BK' },
  { key: 'tax_return_information', label: 'Tax Returns',               service: 'TAX' },
  { key: 'tax_contracts',        label: 'Contracts (TAX)',             service: 'TAX' },
  { key: 'tax_invoices',         label: 'Invoices (TAX)',              service: 'TAX' },
  { key: 'tax_additional_docs',  label: 'Additional Tax Docs',         service: 'TAX' },
  { key: 'cfo_mr_client_review',  label: 'Monthly Reporting (For Client Review)', service: 'CFO' },
  { key: 'cfo_mr_final_statements', label: 'Monthly Reporting (Final Statements & Insights)', service: 'CFO' },
  { key: 'cfo_contracts',        label: 'Contracts (CFO)',             service: 'CFO' },
  { key: 'cfo_invoices',         label: 'Invoices (CFO)',              service: 'CFO' },
  { key: 'cfo_additional_docs',  label: 'Additional CFO Docs',         service: 'CFO' },
];

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

// ── Staff Upload-to-Client Modal ──────────────────────────────────────────────
// Staff delivers a file into one of the client's folders. It enters as
// 'pending' + uploaded_by_role='staff', so the CLIENT approves/rejects it.

function StaffUploadModal({ client, visible, onClose, onUploaded }: {
  client: Profile; visible: boolean; onClose: () => void; onUploaded: (d: Document) => void;
}) {
  const { user } = useAuth();
  const sheet = useSheetStyles('lg');
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [docLabel, setDocLabel]   = useState<string | null>(null); // for staff-label folders
  const [picked, setPicked] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const services = Array.isArray(client.services) && client.services.length > 0 ? client.services : ['BK'];
  const folders = STAFF_UPLOAD_FOLDERS.filter(f => services.includes(f.service));

  // Staff-deliverable folders (For Client Review / Final Statements) require a label pick.
  const labelOptions = folderKey ? staffLabelsForFolder(folderKey) : [];
  const needsLabel   = !!folderKey && isStaffLabelFolder(folderKey);

  const reset = () => { setFolderKey(null); setDocLabel(null); setPicked(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (r.canceled) return;
      const a = r.assets[0];
      setPicked({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' });
    } catch { Alert.alert('Error', 'Could not pick a file.'); }
  };

  const upload = async () => {
    if (!folderKey || !picked) return;
    setBusy(true);
    try {
      const url = await uploadDocumentToStorage(client.id, folderKey, picked.uri, picked.name, picked.mimeType);
      if (!url) { setBusy(false); Alert.alert('Upload failed', 'Could not save file to storage.'); return; }
      // For staff-label folders, prefix the chosen label so it's clear to the client.
      const displayName = needsLabel && docLabel ? `${docLabel} — ${picked.name}` : picked.name;
      const doc = await createDocumentRecord({
        userId: client.id,
        email: client.email,
        name: displayName,
        documentUrl: url,
        documentType: folderKey,
        uploadedByRole: (user?.role === 'admin' ? 'admin' : 'staff'),
        uploadedBy: user?.email ?? 'staff',
      });
      setBusy(false);
      if (!doc) { Alert.alert('Partial success', 'File saved but record creation failed.'); return; }
      onUploaded(doc);
      close();
    } catch (e: any) {
      setBusy(false);
      Alert.alert('Upload failed', e?.message ?? 'Something went wrong.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[su.overlay, sheet.overlay]} onPress={close}>
        <Pressable style={[su.sheet, sheet.sheet]} onPress={() => {}}>
          <View style={su.handle} />
          <Text style={su.title}>Send a File to {client.full_name?.split(' ')[0] || 'Client'}</Text>
          <Text style={su.sub}>The client will be asked to approve or reject it.</Text>

          <Text style={su.label}>Folder</Text>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            {folders.map(f => {
              const active = folderKey === f.key;
              return (
                <TouchableOpacity key={f.key} style={[su.folderRow, active && su.folderRowActive]} onPress={() => { setFolderKey(f.key); setDocLabel(null); }} activeOpacity={0.75}>
                  <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? '#E8B923' : Colors.textMuted} />
                  <Text style={[su.folderText, active && { color: Colors.textPrimary, fontWeight: '700' }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Document label — required for staff-deliverable folders */}
          {needsLabel && (
            <>
              <Text style={su.label}>What is this document?</Text>
              <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                {labelOptions.map(opt => {
                  const active = docLabel === opt;
                  return (
                    <TouchableOpacity key={opt} style={[su.folderRow, active && su.folderRowActive]} onPress={() => setDocLabel(opt)} activeOpacity={0.75}>
                      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? '#E8B923' : Colors.textMuted} />
                      <Text style={[su.folderText, active && { color: Colors.textPrimary, fontWeight: '700' }]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          <Text style={su.label}>File</Text>
          <TouchableOpacity style={su.pickBtn} onPress={pick} activeOpacity={0.8}>
            <Ionicons name={picked ? 'document-text' : 'cloud-upload-outline'} size={18} color="#E8B923" />
            <Text style={su.pickText} numberOfLines={1}>{picked ? picked.name : 'Choose a file…'}</Text>
          </TouchableOpacity>

          <View style={su.row}>
            <TouchableOpacity style={su.cancelBtn} onPress={close}>
              <Text style={su.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[su.sendBtn, (!folderKey || !picked || busy || (needsLabel && !docLabel)) && { opacity: 0.5 }]}
              onPress={upload}
              disabled={!folderKey || !picked || busy || (needsLabel && !docLabel)}
            >
              {busy ? <ActivityIndicator color="#3A3131" size="small" /> : <Text style={su.sendText}>Send to Client</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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

export function ClientDocumentsScreen({ client, onBack, onOpenDashboard }: Props) {
  // Built per client from their own workbook, so most clients have none.
  const clientDashboard = dashboardForClient(client);
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
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
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
        key = `sub:${sub.id}`; title = sub.name; order = 500; icon = 'folder';
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
  useEffect(() => {
    if (activeFolderKey && !folders.some(f => f.key === activeFolderKey)) setActiveFolderKey(null);
  }, [folders, activeFolderKey]);

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
              folders.length > 0 ? (
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
              ) : null
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

      <StaffUploadModal
        client={client}
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
