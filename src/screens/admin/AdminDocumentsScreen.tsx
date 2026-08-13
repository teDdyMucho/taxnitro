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
import { AdminReplyBell } from '../../components/AdminReplyBell';
import { AdminFileBrowser } from '../../components/AdminFileBrowser';
import { useAuth } from '../../context/AuthContext';
import { useSheetStyles } from '../../hooks/useSheetStyles';
import { useResponsive } from '../../hooks/useResponsive';
import { supabase } from '../../lib/supabase';
import { FileConversationPanel } from '../../components/FileConversationPanel';
import {
  useDownloadSelection, DownloadSelectionBar, DownloadNotice, SelectCheckbox,
} from '../../components/DownloadSelectionBar';
import { AdminUploadModal } from '../../components/AdminUploadModal';
import {
  getAllDocuments,
  deleteDocument,
  updateDocumentStatus,
  approveDocument,
  rejectDocument,
  Document,
} from '../../db/documents';
import {
  REQUIRED_UPLOADS,
  RequiredItem,
  BankAccount,
  BANK_STATEMENTS_KEY,
  bankAccountKey,
  bankAccountLabel,
  getBankAccountsByEmail,
  tagDocumentRequirement,
  approveRequirementForDocument,
  clearPendingRequirementForDocument,
  rejectRequirementForDocument,
  getRequirementForDocument,
  monthOf,
  formatMonthLabel,
  serviceLabel,
} from '../../db/requirements';

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
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12, backgroundColor: Colors.bgCard,
  },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.bgMid, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', flex: 1 },
});

// ── Delete Modal ───────────────────────────────────────────────────────────────

function DeleteModal({ visible, name, onConfirm, onCancel }: {
  visible: boolean; name: string; onConfirm: () => void; onCancel: () => void;
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
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  box:       { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28, width: 320, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.18, shadowRadius: 40, elevation: 24 },
  iconWrap:  { width: 64, height: 64, borderRadius: 20, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title:     { color: '#111827', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sub:       { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  warning:   { color: '#EF4444', fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
  row:       { flexDirection: 'row', gap: 10, width: '100%', marginTop: 10 },
  cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  cancelText:{ color: '#64748B', fontWeight: '700', fontSize: 14 },
  deleteBtn: { flex: 1, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  deleteText:{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

// ── Reject Modal ──────────────────────────────────────────────────────────────

function RejectModal({ visible, name, onConfirm, onCancel }: {
  visible: boolean; name: string; onConfirm: (note: string) => void; onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  useEffect(() => { if (visible) setNote(''); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={dm.overlay} onPress={onCancel}>
        <Pressable style={[dm.box, { gap: 12 }]} onPress={() => {}}>
          <View style={[dm.iconWrap, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="close-circle-outline" size={28} color="#EF4444" />
          </View>
          <Text style={dm.title}>Reject Document?</Text>
          <Text style={[dm.sub, { textAlign: 'center' }]} numberOfLines={2}>{name}</Text>

          <TextInput
            style={rj.input}
            placeholder="Reason for rejection (optional)"
            placeholderTextColor="#94A3B8"
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={dm.row}>
            <TouchableOpacity style={dm.cancelBtn} onPress={onCancel}>
              <Text style={dm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[dm.deleteBtn, { backgroundColor: '#EF4444' }]} onPress={() => { onCancel(); onConfirm(note.trim()); }}>
              <Text style={dm.deleteText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rj = StyleSheet.create({
  input: {
    width: '100%', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    padding: 12, color: '#111827', fontSize: 13, minHeight: 80,
  },
});

// ── Approve Modal ─────────────────────────────────────────────────────────────
// The CLIENT tags which required item an upload is for at upload time. Here the
// admin just SEES that tag (read-only) and approves — approval flips the client's
// pending slot to accepted (yellow → green). For legacy/untagged uploads (no client
// tag) the admin can still manually pick the item as a fallback.

function ApproveTagModal({ visible, doc, onConfirm, onCancel }: {
  visible: boolean;
  doc: Document | null;
  onConfirm: (item: RequiredItem | null) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected]     = useState<RequiredItem | null>(null); // manual pick (fallback only)
  const [clientTag, setClientTag]   = useState<RequiredItem | null>(null); // what the client chose
  const [loadingTag, setLoadingTag] = useState(false);
  const [clientNote, setClientNote] = useState<string | null>(null); // the client's upload note (first message)
  const [banks, setBanks]           = useState<BankAccount[]>([]);   // this client's bank accounts
  // The doc id the loaded clientTag belongs to — guards against showing a stale
  // tag from the previously-approved doc while the new lookup is in flight.
  const [tagDocId, setTagDocId]     = useState<string | null>(null);

  // On open, look up the item the client tagged this upload with + their note.
  useEffect(() => {
    let cancelled = false;
    setSelected(null);
    setClientTag(null);
    setClientNote(null);
    setBanks([]);
    setTagDocId(null);
    if (visible && doc) {
      setLoadingTag(true);
      getRequirementForDocument(doc.id)
        .then(item => { if (!cancelled) { setClientTag(item); setTagDocId(doc.id); } })
        .finally(() => { if (!cancelled) setLoadingTag(false); });
      // The manual picker offers one row per bank account this client was set up
      // with, so an untagged upload can be tagged to a specific account.
      if (doc.email) {
        getBankAccountsByEmail(doc.email)
          .then(list => { if (!cancelled) setBanks(list); });
      }
      // First message on the file from the client = the note they left on upload.
      supabase
        .from('file_conversations')
        .select('message, sender_role, created_at')
        .eq('file_id', doc.id)
        .eq('folder_table', doc.document_type)
        .eq('sender_role', 'client')
        .order('created_at', { ascending: true })
        .limit(1)
        .then(({ data }) => { if (!cancelled) setClientNote(data?.[0]?.message ?? null); });
    }
    return () => { cancelled = true; };
  }, [visible, doc?.id]);

  // Only trust the loaded tag if it matches the doc currently open (guards the
  // one-frame flash of the previously-approved doc's tag while the lookup runs).
  const tagReady = !!doc && tagDocId === doc.id;
  const showTag  = tagReady && !!clientTag;

  // Admin can tag which required item this upload fulfills. Show Bookkeeping and CFO
  // groups (both services' items). Each item is keyed by service+key so BK and CFO
  // items with the same key (e.g. bank_statements) don't select together.
  const services: Array<RequiredItem['service']> = ['BK', 'CFO'];

  // Items offered by the manual picker, with the generic "Bank Statements" row
  // replaced by one row per account this client was set up with. No accounts
  // configured → the generic row stays.
  const pickerItems = (svc: RequiredItem['service']): RequiredItem[] =>
    REQUIRED_UPLOADS
      .filter(i => i.service === svc)
      .flatMap(i =>
        i.key === BANK_STATEMENTS_KEY && banks.length > 0
          ? banks.map(a => ({ service: i.service, key: bankAccountKey(a.id), label: bankAccountLabel(a) }))
          : [i],
      );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={dm.overlay} onPress={onCancel}>
        <Pressable style={[dm.box, { gap: 10, width: 340, alignItems: 'stretch' }]} onPress={() => {}}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={[dm.iconWrap, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="checkmark-circle-outline" size={28} color="#065F46" />
            </View>
            <Text style={dm.title}>Approve Upload</Text>
            <Text style={[dm.sub, { textAlign: 'center' }]} numberOfLines={2}>{doc?.name}</Text>
          </View>

          {clientNote ? (
            <View style={at.noteCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color="#B5905B" />
              <View style={{ flex: 1 }}>
                <Text style={at.noteLabel}>Client note</Text>
                <Text style={at.noteText}>{clientNote}</Text>
              </View>
            </View>
          ) : null}

          {loadingTag || !tagReady ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color="#059669" />
            </View>
          ) : showTag ? (
            // ── Client already chose the item → read-only, no picker ──
            <>
              <Text style={at.prompt}>
                The client uploaded this for{' '}
                <Text style={{ fontWeight: '800' }}>{formatMonthLabel(monthOf())}</Text>:
              </Text>
              <View style={at.tagCard}>
                <Ionicons name="checkmark-circle" size={20} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={at.tagLabel}>{clientTag.label}</Text>
                  <Text style={at.tagService}>{serviceLabel(clientTag.service)}</Text>
                </View>
              </View>

              <View style={dm.row}>
                <TouchableOpacity style={dm.cancelBtn} onPress={onCancel}>
                  <Text style={dm.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[dm.deleteBtn, { backgroundColor: '#059669' }]}
                  onPress={() => { onCancel(); onConfirm(clientTag); }}
                >
                  <Text style={dm.deleteText}>Approve</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            // ── Untagged upload → admin picks the required item it fulfills ──
            <>
              <Text style={at.prompt}>
                Tag which required item this fulfills for{' '}
                <Text style={{ fontWeight: '800' }}>{formatMonthLabel(monthOf())}</Text>:
              </Text>

              <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                {services.map(svc => (
                  <View key={svc} style={{ marginBottom: 6 }}>
                    <Text style={at.groupLabel}>{serviceLabel(svc)}</Text>
                    {pickerItems(svc).map(item => {
                      const active = selected?.key === item.key && selected?.service === item.service;
                      return (
                        <TouchableOpacity
                          key={`${item.service}:${item.key}`}
                          style={[at.itemRow, active && at.itemRowActive]}
                          onPress={() => setSelected(active ? null : item)}
                          activeOpacity={0.75}
                        >
                          <Ionicons
                            name={active ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={active ? '#065F46' : '#94A3B8'}
                          />
                          <Text style={[at.itemText, active && { color: '#065F46', fontWeight: '700' }]}>{item.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>

              <View style={dm.row}>
                <TouchableOpacity style={dm.cancelBtn} onPress={() => { onCancel(); onConfirm(null); }}>
                  <Text style={dm.cancelText}>Approve only</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[dm.deleteBtn, { backgroundColor: selected ? '#059669' : '#A7F3D0' }]}
                  disabled={!selected}
                  onPress={() => { const s = selected; onCancel(); onConfirm(s); }}
                >
                  <Text style={dm.deleteText}>Approve & Tag</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const at = StyleSheet.create({
  noteCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EADFCB', backgroundColor: '#FBF6EC' },
  noteLabel: { color: '#B5905B', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  noteText:  { color: '#5B4A38', fontSize: 13, lineHeight: 18 },
  prompt:     { color: '#374151', fontSize: 12, fontWeight: '500', lineHeight: 17 },
  groupLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4, marginTop: 4 },
  itemRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 6, backgroundColor: '#FFFFFF' },
  itemRowActive:{ borderColor: '#059669', backgroundColor: '#ECFDF5' },
  itemText:     { color: '#374151', fontSize: 13, flex: 1 },
  tagCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#059669', backgroundColor: '#ECFDF5' },
  tagLabel:   { color: '#065F46', fontSize: 15, fontWeight: '800' },
  tagService: { color: '#059669', fontSize: 11, fontWeight: '600', marginTop: 2 },
});

// ── Config ─────────────────────────────────────────────────────────────────────

const FOLDERS = [
  { key: 'all',                    label: 'All',            color: '#2C2320' },
  { key: 'pending',                label: 'Pending',        color: '#F59E0B' },
  { key: 'tax_client_uploads',     label: 'Client Uploads', color: '#E8B923' },
  { key: 'tax_additional_docs',    label: 'Additional Tax Docs', color: '#E8B923' },
  { key: 'tax_contracts',          label: 'Tax Contracts',  color: '#B5905B' },
  { key: 'tax_invoices',           label: 'Tax Invoices',   color: '#E8B923' },
  { key: 'tax_return_information', label: 'Tax Returns',    color: '#B5905B' },
  { key: 'bk_contracts',           label: 'BK Contracts',   color: '#2C2320' },
  { key: 'bk_invoices',            label: 'BK Invoices',    color: '#E8B923' },
  { key: 'bk_final_pnl',           label: 'Additional BK Docs', color: '#2C2320' },
  { key: 'bk_mr_required_info',    label: 'Monthly Reporting (Required Info)',     color: '#E8B923' },
  { key: 'bk_mr_client_review',    label: 'Monthly Reporting (For Client Review)', color: '#B5905B' },
  { key: 'bk_mr_final_statements', label: 'Monthly Reporting (Final Statements)',  color: '#E8B923' },
  { key: 'cfo_contracts',          label: 'CFO Contracts',  color: '#B5905B' },
  { key: 'cfo_invoices',           label: 'CFO Invoices',   color: '#E8B923' },
  { key: 'cfo_additional_docs',    label: 'Additional CFO Docs', color: '#B5905B' },
  { key: 'cfo_mr_required_info',   label: 'Monthly Reporting (Required Info)',     color: '#E8B923' },
  { key: 'cfo_mr_client_review',   label: 'Monthly Reporting (For Client Review)', color: '#B5905B' },
  { key: 'cfo_mr_final_statements', label: 'Monthly Reporting (Final Statements & Insights)', color: '#E8B923' },
];

// Filter dropdown grouped by category for a clean per-folder picker.
const FILTER_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Quick',                     keys: ['all', 'pending'] },
  { title: 'Tax Documents & Returns',   keys: ['tax_contracts', 'tax_invoices', 'tax_client_uploads', 'tax_additional_docs', 'tax_return_information'] },
  { title: 'Bookkeeping & Financials',  keys: ['bk_contracts', 'bk_invoices', 'bk_final_pnl', 'bk_mr_required_info', 'bk_mr_client_review', 'bk_mr_final_statements'] },
  { title: 'CFO Advisory',              keys: ['cfo_contracts', 'cfo_invoices', 'cfo_additional_docs', 'cfo_mr_required_info', 'cfo_mr_client_review', 'cfo_mr_final_statements'] },
];

const EXT_COLOR: Record<string, string> = {
  pdf: '#2C2320', doc: '#B5905B', docx: '#B5905B',
  xls: '#E8B923', xlsx: '#E8B923', jpg: '#B5905B', jpeg: '#B5905B', png: '#B5905B',
};

const getExt   = (name: string) => name.split('.').pop()?.toLowerCase() ?? 'file';
const folderOf = (key: string)  => FOLDERS.find(f => f.key === key) ?? FOLDERS[0];
const fmtDate  = (iso: string)  => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ── Approval status pill ───────────────────────────────────────────────────────

function ApprovalPill({ status }: { status: string }) {
  if (status === 'approved') {
    return (
      <View style={[ap.pill, { backgroundColor: '#D1FAE5' }]}>
        <Ionicons name="checkmark-circle" size={10} color="#065F46" />
        <Text style={[ap.text, { color: '#065F46' }]}>Approved</Text>
      </View>
    );
  }
  if (status === 'pending') {
    return (
      <View style={[ap.pill, { backgroundColor: '#FEF3C7' }]}>
        <Ionicons name="time-outline" size={10} color="#92400E" />
        <Text style={[ap.text, { color: '#92400E' }]}>Pending</Text>
      </View>
    );
  }
  return (
    <View style={[ap.pill, { backgroundColor: '#FEE2E2' }]}>
      <Ionicons name="close-circle" size={10} color="#991B1B" />
      <Text style={[ap.text, { color: '#991B1B' }]}>Rejected</Text>
    </View>
  );
}

const ap = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  text: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },
});

// ── Filter dropdown (grouped by folder) ──────────────────────────────────────
const fd = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(28,23,19,0.55)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, gap: 6 },
  handle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 8 },
  title:   { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 4 },
  groupLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 10, marginBottom: 4 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  rowActive: { backgroundColor: '#FEFCE8', borderColor: 'rgba(232,185,35,0.5)' },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  rowText: { flex: 1, color: '#374151', fontSize: 14 },
  rowCount:{ color: '#94A3B8', fontSize: 12, fontWeight: '700' },
});

// ── Main ───────────────────────────────────────────────────────────────────────

export function AdminDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);


  const { user, isLoading: authLoading } = useAuth();

  const [documents, setDocuments]   = useState<Document[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState('pending'); // default: show pending first
  const [filterOpen, setFilterOpen] = useState(false);     // per-folder dropdown
  const filterSheet = useSheetStyles('sm');
  const [viewerDoc, setViewerDoc]   = useState<Document | null>(null);
  const [convDoc, setConvDoc]       = useState<Document | null>(null);
  const [deleteDoc, setDeleteDoc]   = useState<Document | null>(null);
  const [rejectDoc, setRejectDoc]   = useState<Document | null>(null);
  const [approveDoc, setApproveDoc] = useState<Document | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null); // doc id being actioned
  const [browserOpen, setBrowserOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }, 8000);
    try {
      const docs = await getAllDocuments();
      if (mountedRef.current) setDocuments(docs);
    } catch (e) { console.error(e); }
    finally { clearTimeout(safetyTimer); if (mountedRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => { if (!authLoading && user?.id) load(); }, [authLoading, user?.id]);

  const pendingCount = documents.filter(d => (d.approval_status ?? 'approved') === 'pending').length;

  const filtered = documents.filter(d => {
    const approval = d.approval_status ?? 'approved';
    if (filter === 'pending' && approval !== 'pending') return false;
    if (filter !== 'all' && filter !== 'pending' && d.document_type !== filter) return false;
    if (!query.trim()) return true;
    return (
      d.name?.toLowerCase().includes(query.toLowerCase()) ||
      d.email?.toLowerCase().includes(query.toLowerCase())
    );
  });

  const { isPhone } = useResponsive();

  const dl = useDownloadSelection<Document>(
    useCallback((d: Document) => ({ url: d.document_url, name: d.name }), []),
  );

  const handleView = async (doc: Document) => {
    if (doc.status === 'new') {
      await updateDocumentStatus(doc.id, 'viewed', doc.document_type ?? '');
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'viewed' } : d));
    }
    setViewerDoc(doc);
  };

  const handleDelete = async (doc: Document) => {
    if (await deleteDocument(doc.id, doc.document_type ?? '')) {
      // Drop any pending requirement slot this file was fulfilling → radio back to grey.
      await clearPendingRequirementForDocument(doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    }
  };

  const handleApprove = async (doc: Document, requirement: RequiredItem | null) => {
    if (actionBusy) return;
    setActionBusy(doc.id);
    const table    = doc.document_type ?? '';
    const approver = user?.email ?? 'admin';
    const ok = await approveDocument(doc.id, table, approver);
    if (ok) {
      // If the client already tagged this upload with a required item (Required
      // Documents folders), flip that pending slot to approved (yellow → green).
      const autoFlipped = await approveRequirementForDocument(doc.id, approver);

      // Otherwise, use the admin's manual tag from the Approve modal (legacy folders).
      if (!autoFlipped && requirement && doc.email) {
        await tagDocumentRequirement({
          clientEmail:    doc.email,
          documentId:     doc.id,
          documentTable:  table,
          service:        requirement.service,
          requirementKey: requirement.key,
          month:          monthOf(),
          taggedBy:       approver,
        });
      }
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, approval_status: 'approved', approved_by: approver } : d));
    }
    setActionBusy(null);
  };

  const handleReject = async (doc: Document, note: string) => {
    if (actionBusy) return;
    setActionBusy(doc.id);
    const rejecter = user?.email ?? 'admin';
    const ok = await rejectDocument(doc.id, doc.document_type ?? '', rejecter, note);
    if (ok) {
      // Declining marks the client's requirement slot 'rejected' → dashboard radio turns RED ("Declined").
      await rejectRequirementForDocument(doc.id, rejecter);
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, approval_status: 'rejected', approval_note: note || null } : d));
    }
    setActionBusy(null);
  };

  // ── Document Card ────────────────────────────────────────────────────────────

  const renderDoc = ({ item }: { item: Document }) => {
    const marked = dl.selected.has(item.id);
    if (dl.selecting) {
      // Marking replaces the row's own actions — nothing else is reachable.
      return (
        <TouchableOpacity
          style={[s.card, marked && s.cardMarked]}
          onPress={() => dl.toggle(item.id)}
          activeOpacity={0.7}
        >
          <SelectCheckbox checked={marked} />
          <View style={s.info}>
            <Text style={s.docName} numberOfLines={1}>{item.name}</Text>
            <Text style={s.docEmail} numberOfLines={1}>{item.email}</Text>
          </View>
          <Text style={s.dateText}>{fmtDate(item.created_at)}</Text>
        </TouchableOpacity>
      );
    }
    return renderDocRow({ item });
  };

  const renderDocRow = ({ item }: { item: Document }) => {
    const ext      = getExt(item.name);
    const color    = EXT_COLOR[ext] ?? '#64748B';
    const folder   = folderOf(item.document_type ?? '');
    const approval = item.approval_status ?? 'approved';
    const isBusy   = actionBusy === item.id;

    return (
      <View style={[
        s.card,
        // On a phone the action column is wider than the space left for the
        // text, so the card stacks: details on top, actions on their own row.
        isPhone && s.cardPhone,
        approval === 'pending' && s.cardPending,
        approval === 'rejected' && s.cardRejected,
      ]}>
        <View style={isPhone ? s.cardPhoneTop : s.cardTopContents}>
        {/* File type badge */}
        <View style={[s.fileBadge, isPhone && s.fileBadgePhone, { backgroundColor: color + '15' }]}>
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
          {/* Rejection note */}
          {approval === 'rejected' && !!item.approval_note && (
            <Text style={s.rejectNote} numberOfLines={1}>Reason: {item.approval_note}</Text>
          )}
        </View>

          {/* The status pill rides with the text on a phone; the buttons drop
              to their own row below. */}
          {isPhone && <ApprovalPill status={approval} />}
        </View>

        {/* Actions */}
        <View style={isPhone ? s.actionsPhone : s.actions}>
          {!isPhone && <ApprovalPill status={approval} />}

          {/* Approve / Reject for pending */}
          {approval === 'pending' && (
            <View style={s.approvalRow}>
              <TouchableOpacity
                style={[s.approveBtn, isBusy && { opacity: 0.5 }]}
                onPress={() => setApproveDoc(item)}
                disabled={!!isBusy}
                activeOpacity={0.75}
              >
                {isBusy
                  ? <ActivityIndicator size={12} color="#065F46" />
                  : <Ionicons name="checkmark" size={14} color="#065F46" />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.rejectBtn, isBusy && { opacity: 0.5 }]}
                onPress={() => setRejectDoc(item)}
                disabled={!!isBusy}
                activeOpacity={0.75}
              >
                <Ionicons name="close" size={14} color="#991B1B" />
              </TouchableOpacity>
            </View>
          )}

          {/* View / Download / Notes / Delete always visible */}
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.actionBtn, s.viewBtn]} onPress={() => handleView(item)} activeOpacity={0.75}>
              <Ionicons name="eye-outline" size={14} color="#1C1713" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, s.dlBtn]} onPress={() => dl.downloadSingle(item)} activeOpacity={0.75}>
              <Ionicons name="download-outline" size={14} color="#1C1713" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, s.notesBtn]} onPress={() => setConvDoc(item)} activeOpacity={0.75}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color="#1C1713" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, s.deleteActionBtn]} onPress={() => setDeleteDoc(item)} activeOpacity={0.75}>
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
      <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={s.emptyCircle}>
        <Ionicons name="documents-outline" size={40} color="#E8B923" />
      </LinearGradient>
      <Text style={s.emptyTitle}>
        {filter === 'pending' ? 'No pending documents' : 'No documents found'}
      </Text>
      <Text style={s.emptyText}>
        {filter === 'pending'
          ? 'All uploads have been reviewed. Nothing waiting for approval.'
          : query
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

      {/* ── Header ── */}
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.header, isPhone && s.headerPhone, { paddingTop: insets.top + 16 }]}
      >
        <View style={s.headerOverlay} pointerEvents="none" />
        <View style={s.decorCircle1} pointerEvents="none" />
        <View style={s.decorCircle2} pointerEvents="none" />

        <View style={isPhone ? s.headerTitleWrapPhone : { flex: 1 }}>
          <Text style={[s.headerTitle, isPhone && s.headerTitlePhone]} numberOfLines={1}>
            All Documents
          </Text>
          <Text style={s.headerSub} numberOfLines={1}>
            {documents.length} total
            {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
            {newCount > 0 ? ` · ${newCount} new` : ''}
          </Text>
        </View>

        {/* Six controls beside a title leave it a few pixels wide on a phone,
            so there they sit on their own row under it. */}
        <View style={isPhone ? s.headerActionsPhone : s.headerActions}>
          {pendingCount > 0 && (
            <View style={s.pendingBadge}>
              <Ionicons name="time-outline" size={13} color="#92400E" />
              <Text style={s.pendingBadgeText}>{pendingCount}</Text>
            </View>
          )}
          {/* Upload a document (admin/staff → any client, any folder) */}
          <TouchableOpacity style={s.uploadHeaderBtn} onPress={() => setUploadOpen(true)} activeOpacity={0.85}>
            <Ionicons name="cloud-upload-outline" size={16} color="#2C2320" />
            <Text style={s.uploadHeaderText}>Upload</Text>
          </TouchableOpacity>
          {/* Browse by folder */}
          <TouchableOpacity style={s.browseBtn} onPress={() => setBrowserOpen(true)} activeOpacity={0.75}>
            <Ionicons name="folder-open-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          {/* Reply notification bell */}
          <AdminReplyBell onMarkedRead={() => load()} />
          <TouchableOpacity style={s.refreshBtn} onPress={() => load(true)} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={18} color="#2C2320" />
          </TouchableOpacity>
        </View>
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

      {/* ── Filter dropdown (per-folder, grouped) ── */}
      <View style={s.filterWrap}>
        <TouchableOpacity style={s.filterBtn} onPress={() => setFilterOpen(true)} activeOpacity={0.8}>
          <Ionicons name="funnel-outline" size={15} color="#B5905B" />
          <Text style={s.filterBtnText} numberOfLines={1}>
            {FOLDERS.find(f => f.key === filter)?.label ?? 'All'}
          </Text>
          {(() => {
            const cnt = filter === 'pending' ? pendingCount
              : filter === 'all' ? documents.length
              : documents.filter(d => d.document_type === filter).length;
            return cnt > 0 ? (
              <View style={s.filterBtnCount}><Text style={s.filterBtnCountText}>{cnt}</Text></View>
            ) : null;
          })()}
          <Ionicons name="chevron-down" size={16} color="#94A3B8" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </View>

      {/* Filter dropdown modal — grouped by category */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={[fd.overlay, filterSheet.overlay]} onPress={() => setFilterOpen(false)}>
          <Pressable style={[fd.sheet, filterSheet.sheet]} onPress={() => {}}>
            <View style={fd.handle} />
            <Text style={fd.title}>Filter by folder</Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {FILTER_GROUPS.map(group => (
                <View key={group.title} style={{ marginBottom: 6 }}>
                  <Text style={fd.groupLabel}>{group.title}</Text>
                  {group.keys.map(key => {
                    const f = FOLDERS.find(x => x.key === key);
                    if (!f) return null;
                    const active = filter === key;
                    const cnt = key === 'pending' ? pendingCount
                      : key === 'all' ? documents.length
                      : documents.filter(d => d.document_type === key).length;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[fd.row, active && fd.rowActive]}
                        onPress={() => { setFilter(key); setFilterOpen(false); }}
                        activeOpacity={0.7}
                      >
                        <View style={[fd.dot, { backgroundColor: f.color }]} />
                        <Text style={[fd.rowText, active && { color: '#1C1713', fontWeight: '700' }]} numberOfLines={1}>{f.label}</Text>
                        {cnt > 0 && <Text style={[fd.rowCount, active && { color: '#B5905B' }]}>{cnt}</Text>}
                        {active && <Ionicons name="checkmark" size={16} color="#E8B923" style={{ marginLeft: 6 }} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Pending notice banner ── */}
      {filter === 'pending' && pendingCount > 0 && (
        <View style={s.pendingBanner}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#92400E" />
          <Text style={s.pendingBannerText}>
            {pendingCount} file{pendingCount !== 1 ? 's' : ''} waiting for your review
          </Text>
        </View>
      )}

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
          ListHeaderComponent={
            filtered.length > 0 ? (
              <DownloadSelectionBar
                selection={dl}
                /* Whatever the search box and filter pills currently leave. */
                items={filtered}
                zipName={filter === 'all' ? 'All documents' : `Documents — ${filter}`}
                label="documents"
              />
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#10B981" colors={['#10B981']} />
          }
          ListEmptyComponent={<EmptyState />}
        />
      )}

      <DownloadNotice message={dl.notice} />

      {/* ── Modals ── */}
      {viewerDoc && (
        <DocViewerModal url={viewerDoc.document_url} name={viewerDoc.name} onClose={() => setViewerDoc(null)} />
      )}
      {convDoc && (
        <FileConversationPanel
          visible={!!convDoc}
          doc={convDoc}
          fileOwnerId={convDoc.user_id ?? ''}
          onClose={() => setConvDoc(null)}
        />
      )}
      <DeleteModal
        visible={!!deleteDoc}
        name={deleteDoc?.name ?? ''}
        onConfirm={() => { if (deleteDoc) { handleDelete(deleteDoc); setDeleteDoc(null); } }}
        onCancel={() => setDeleteDoc(null)}
      />
      <RejectModal
        visible={!!rejectDoc}
        name={rejectDoc?.name ?? ''}
        onConfirm={note => { if (rejectDoc) { handleReject(rejectDoc, note); setRejectDoc(null); } }}
        onCancel={() => setRejectDoc(null)}
      />
      <ApproveTagModal
        visible={!!approveDoc}
        doc={approveDoc}
        onConfirm={item => { if (approveDoc) handleApprove(approveDoc, item); }}
        onCancel={() => setApproveDoc(null)}
      />

      {/* ── File Browser ── */}
      <AdminFileBrowser visible={browserOpen} onClose={() => setBrowserOpen(false)} />

      <AdminUploadModal
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => load(true)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, gap: 12,
    overflow: 'hidden', position: 'relative',
  },
  headerOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.04 },
  decorCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,185,35,0.06)', top: -60, right: -40 } as any,
  decorCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(232,185,35,0.05)', bottom: -30, left: 60 } as any,
  headerPhone:          { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  headerTitleWrapPhone: { width: '100%' },
  headerTitlePhone:     { fontSize: 19 },
  headerActions:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerActionsPhone:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerSub:   { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2, fontWeight: '500' },

  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  pendingBadgeText: { color: '#92400E', fontWeight: '800', fontSize: 13 },

  uploadHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 10,
    backgroundColor: '#E8B923', paddingHorizontal: 12,
  },
  uploadHeaderText: { color: '#2C2320', fontSize: 13, fontWeight: '800' },
  browseBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },

  refreshBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8B923',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },

  searchWrap:  { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, backgroundColor: '#FFFFFF' },
  searchBox:   {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF',
    borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  searchInput: { flex: 1, color: '#111827', fontSize: 14, fontWeight: '500' },

  filterWrap:   { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 10 },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FAFAF8', borderWidth: 1, borderColor: '#E8E0D0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
  },
  filterBtnText:  { fontSize: 14, fontWeight: '700', color: '#1C1713', maxWidth: 260 },
  filterBtnCount: { minWidth: 22, height: 20, borderRadius: 10, backgroundColor: '#E8B923', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  filterBtnCountText: { fontSize: 11, fontWeight: '800', color: '#1C1713' },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  pendingBannerText: { color: '#92400E', fontSize: 12, fontWeight: '600', flex: 1 },

  list: { padding: 16, gap: 10, paddingBottom: 48 },

  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 20, padding: 16, gap: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  cardTopContents: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardPhone:       { flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: 14 },
  cardPhoneTop:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileBadgePhone:  { width: 44, height: 44, borderRadius: 14 },
  // Buttons get a full-width row of their own, so they can never ride over
  // the file name or the folder pill.
  actionsPhone: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    flexWrap: 'wrap', gap: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', paddingTop: 11,
  },
  cardPending:  { borderColor: '#F59E0B', borderLeftWidth: 3, backgroundColor: '#FFFBEB' },
  cardRejected: { borderColor: '#EF4444', borderLeftWidth: 3, backgroundColor: '#FFF5F5' },

  fileBadge:    { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3 },
  fileBadgeExt: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },

  info:        { flex: 1, gap: 3 },
  docName:     { color: '#111827', fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  docEmail:    { color: '#94A3B8', fontSize: 12, fontWeight: '400' },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  folderPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  folderDot:   { width: 5, height: 5, borderRadius: 3 },
  folderLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  dateText:    { color: '#94A3B8', fontSize: 10, fontWeight: '500' },
  rejectNote:  { color: '#EF4444', fontSize: 10, fontStyle: 'italic', marginTop: 2 },

  actions:     { alignItems: 'flex-end', gap: 6 },
  approvalRow: { flexDirection: 'row', gap: 5 },
  approveBtn:  {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#D1FAE5', borderWidth: 1, borderColor: '#A7F3D0',
  },
  rejectBtn: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA',
  },
  btnRow:         { flexDirection: 'row', gap: 6 },
  actionBtn:      { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  viewBtn:        { backgroundColor: '#E8B923' },
  notesBtn:       { backgroundColor: '#EADFCB' },
  dlBtn: { backgroundColor: 'rgba(232,185,35,0.22)' },
  cardMarked: { backgroundColor: 'rgba(232,185,35,0.10)', borderColor: 'rgba(232,185,35,0.55)' },
  deleteActionBtn:{ backgroundColor: '#DC2626' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 14, paddingHorizontal: 32 },
  emptyCircle: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { color: '#111827', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  emptyText:  { color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 20, fontWeight: '400' },
});
