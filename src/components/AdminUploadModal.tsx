import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useSheetStyles } from '../hooks/useSheetStyles';
import { uploadDocumentToStorage, createDocumentRecord, Document } from '../db/documents';
import { getAllClients, Profile } from '../db/profiles';

// Every folder an admin/staff can upload into, grouped by suite. Full access.
const UPLOAD_FOLDERS: { title: string; folders: { key: string; label: string }[] }[] = [
  { title: 'Tax Documents & Returns', folders: [
    { key: 'tax_contracts',          label: 'Tax Contracts' },
    { key: 'tax_invoices',           label: 'Tax Invoices' },
    { key: 'tax_client_uploads',     label: 'Client Uploads' },
    { key: 'tax_additional_docs',    label: 'Additional Tax Docs' },
    { key: 'tax_return_information',  label: 'Tax Returns' },
  ]},
  { title: 'Bookkeeping & Financials', folders: [
    { key: 'bk_contracts',           label: 'BK Contracts' },
    { key: 'bk_invoices',            label: 'BK Invoices' },
    { key: 'bk_final_pnl',           label: 'Additional BK Docs' },
    { key: 'bk_mr_required_info',    label: 'Monthly Reporting (Required Info)' },
    { key: 'bk_mr_client_review',    label: 'Monthly Reporting (For Client Review)' },
    { key: 'bk_mr_final_statements', label: 'Monthly Reporting (Final Statements)' },
  ]},
  { title: 'CFO Advisory', folders: [
    { key: 'cfo_contracts',           label: 'CFO Contracts' },
    { key: 'cfo_invoices',            label: 'CFO Invoices' },
    { key: 'cfo_additional_docs',     label: 'Additional CFO Docs' },
    { key: 'cfo_mr_required_info',    label: 'Monthly Reporting (Required Info)' },
    { key: 'cfo_mr_client_review',    label: 'Monthly Reporting (For Client Review)' },
    { key: 'cfo_mr_final_statements', label: 'Monthly Reporting (Final Statements & Insights)' },
  ]},
];

const FOLDER_LABEL: Record<string, string> = Object.fromEntries(
  UPLOAD_FOLDERS.flatMap(g => g.folders.map(f => [f.key, f.label])),
);

/**
 * One queued file, tagged with the folder it was added under, so a single
 * session can send files to several folders and the list shows them already
 * sorted before anything is uploaded.
 */
type PickedFile = {
  id: string;
  folderKey: string;
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

let fileSeq = 0;
const nextFileId = () => `af${++fileSeq}`;

/** Browser File objects (from a drop) → queue entries under one folder. */
function fromDomFiles(files: File[], folderKey: string): PickedFile[] {
  return files.map(f => ({
    id: nextFileId(),
    folderKey,
    // uploadDocumentToStorage fetches this URI on web, and fetch reads blob: URLs.
    uri: URL.createObjectURL(f),
    name: f.name,
    mimeType: f.type || 'application/octet-stream',
    size: f.size,
  }));
}

/** Release a blob: URL we created, so dropped files aren't held in memory. */
function revoke(f: PickedFile) {
  if (Platform.OS === 'web' && f.uri.startsWith('blob:')) {
    try { URL.revokeObjectURL(f.uri); } catch {}
  }
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '';
  return bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function AdminUploadModal({ visible, onClose, onUploaded }: {
  visible: boolean; onClose: () => void; onUploaded?: (d: Document) => void;
}) {
  const { user } = useAuth();
  const sheet = useSheetStyles('lg');
  const [clients, setClients] = useState<Profile[]>([]);
  const [clientQuery, setClientQuery] = useState('');
  const [client, setClient] = useState<Profile | null>(null);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  // Yes/no guard on the two ways a queued file is lost to a stray tap.
  // Not Alert.alert — react-native-web does not render it, so this is in-sheet.
  const [confirmRemove, setConfirmRemove] = useState<
    | null
    | { kind: 'all' }
    | { kind: 'group'; id: string; name: string }
    | { kind: 'one'; id: string; name: string }
  >(null);

  // ── "there is more" affordance ─────────────────────────────────────────────
  // Declared before reset(), which clears it.
  const [overflow, setOverflow] = useState({ up: false, down: false });
  const viewH    = useRef(0);
  const contentH = useRef(0);
  const scrollY  = useRef(0);

  const recomputeOverflow = useCallback(() => {
    const up   = scrollY.current > 6;
    const down = scrollY.current + viewH.current < contentH.current - 6;
    setOverflow(prev => (prev.up === up && prev.down === down ? prev : { up, down }));
  }, []);

  useEffect(() => { if (visible) getAllClients().then(setClients); }, [visible]);

  const reset = () => {
    picked.forEach(revoke);
    setClient(null); setClientQuery(''); setFolderKey(null); setPicked([]);
    setDragOver(false); setSent(0); setBusy(false); setDone(false);
    setUploadedCount(0); setConfirmRemove(null);
    setOverflow({ up: false, down: false });
    scrollY.current = 0;
  };
  const close = () => { reset(); onClose(); };

  const filteredClients = clientQuery.trim()
    ? clients.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(clientQuery.toLowerCase()) ||
        (c.email ?? '').toLowerCase().includes(clientQuery.toLowerCase()))
    : clients;

  /** The queue, split into one bucket per folder, in picker order. */
  const queued = useMemo(() => {
    const byFolder = new Map<string, PickedFile[]>();
    picked.forEach(f => {
      const bucket = byFolder.get(f.folderKey);
      if (bucket) bucket.push(f); else byFolder.set(f.folderKey, [f]);
    });
    return UPLOAD_FOLDERS
      .flatMap(g => g.folders)
      .filter(f => byFolder.has(f.key))
      .map(f => ({ key: f.key, label: f.label, files: byFolder.get(f.key)! }));
  }, [picked]);

  // ── Files ──────────────────────────────────────────────────────────────────

  const addFiles = (files: PickedFile[]) => setPicked(prev => [...prev, ...files]);

  const removeFile = (id: string) => setPicked(prev => {
    const hit = prev.find(f => f.id === id);
    if (hit) revoke(hit);
    return prev.filter(f => f.id !== id);
  });

  const removeGroup = (key: string) => setPicked(prev => {
    prev.filter(f => f.folderKey === key).forEach(revoke);
    return prev.filter(f => f.folderKey !== key);
  });

  const clearFiles = () => { picked.forEach(revoke); setPicked([]); };

  const pick = async () => {
    if (!folderKey) return;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (r.canceled) return;
      addFiles(r.assets.map(a => ({
        id: nextFileId(),
        folderKey,
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType ?? 'application/octet-stream',
        size: a.size ?? undefined,
      })));
    } catch { Alert.alert('Error', 'Could not pick a file.'); }
  };

  const canAddFiles = !!client && !!folderKey && !busy;

  // react-native-web's View does not forward drag events, so the drop target is
  // a real <div>. On native this collapses to the plain browse button.
  const dropHandlers = Platform.OS === 'web' ? {
    onDragOver:  (e: any) => { e.preventDefault(); if (canAddFiles) setDragOver(true); },
    onDragEnter: (e: any) => { e.preventDefault(); if (canAddFiles) setDragOver(true); },
    onDragLeave: (e: any) => { e.preventDefault(); setDragOver(false); },
    onDrop: (e: any) => {
      e.preventDefault();
      setDragOver(false);
      if (!canAddFiles || !folderKey) return;
      const files: File[] = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) addFiles(fromDomFiles(files, folderKey));
    },
  } : {};

  // ── Upload ─────────────────────────────────────────────────────────────────

  const upload = async () => {
    if (!client || picked.length === 0) return;
    setBusy(true);
    setSent(0);

    const uploaded: Document[] = [];
    const failed: string[] = [];

    try {
      // Bucket by bucket, so every file lands in the folder it was queued under.
      // One at a time so the count is honest and a single bad file can't take
      // the whole batch down with it.
      for (const bucket of queued) {
        for (const file of bucket.files) {
          const url = await uploadDocumentToStorage(client.id, bucket.key, file.uri, file.name, file.mimeType);
          if (!url) { failed.push(file.name); setSent(n => n + 1); continue; }

          const doc = await createDocumentRecord({
            userId: client.id,
            email: client.email,
            name: file.name,
            documentUrl: url,
            documentType: bucket.key,
            uploadedByRole: (user?.role === 'admin' ? 'admin' : 'staff'),
            uploadedBy: user?.email ?? 'staff',
          });
          if (doc) uploaded.push(doc); else failed.push(file.name);
          setSent(n => n + 1);
        }
      }

      if (uploaded.length === 0) {
        setBusy(false);
        Alert.alert('Upload failed', 'No files could be saved. Check your connection and try again.');
        return;
      }

      setBusy(false);
      setUploadedCount(uploaded.length);
      setDone(true);
      uploaded.forEach(d => onUploaded?.(d));

      if (failed.length > 0) {
        Alert.alert('Some files failed', `${uploaded.length} uploaded. Could not send: ${failed.join(', ')}`);
      }
      setTimeout(close, 1300);
    } catch (e: any) {
      setBusy(false);
      Alert.alert('Upload failed', e?.message ?? 'Something went wrong.');
    }
  };

  return (
    /* While a batch is in flight, a tap outside must not tear the modal down
       mid-upload — the remaining files would never be sent. */
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : close}>
      <Pressable style={[s.overlay, sheet.overlay]} onPress={busy ? undefined : close}>
        <Pressable style={[s.sheet, sheet.sheet]} onPress={() => {}}>
          <View style={s.handle} />

          {done ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
              <View style={s.doneCircle}><Ionicons name="checkmark" size={40} color="#16A34A" /></View>
              <Text style={s.title}>Uploaded</Text>
              <Text style={s.sub}>
                {uploadedCount > 1
                  ? `${uploadedCount} files added to ${client?.full_name || 'the client'}.`
                  : `File added to ${client?.full_name || 'the client'}.`}
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.title}>Upload a Document</Text>
              <Text style={s.sub}>Pick a client, choose a folder, then add the files.</Text>

              <View style={{ flexShrink: 1 }}>
              <ScrollView
                showsVerticalScrollIndicator
                {...({ dataSet: { ftgscroll: 'y' } } as any)}
                contentContainerStyle={{ gap: 8 }}
                scrollEventThrottle={16}
                onLayout={e => { viewH.current = e.nativeEvent.layout.height; recomputeOverflow(); }}
                onContentSizeChange={(_w, h) => { contentH.current = h; recomputeOverflow(); }}
                onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; recomputeOverflow(); }}
              >
                {/* Step 1: client */}
                <Text style={s.label}>Client</Text>
                {client ? (
                  <TouchableOpacity style={s.selectedClient} onPress={() => setClient(null)} activeOpacity={0.8}>
                    <Ionicons name="person-circle-outline" size={20} color="#B5905B" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.selName}>{client.full_name || 'Unnamed'}</Text>
                      <Text style={s.selEmail}>{client.email}</Text>
                    </View>
                    <Ionicons name="swap-horizontal-outline" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ) : (
                  <>
                    <View style={s.searchRow}>
                      <Ionicons name="search-outline" size={15} color={Colors.textMuted} />
                      <TextInput
                        style={[s.searchInput, { outlineWidth: 0 } as any]}
                        placeholder="Search client…" placeholderTextColor={Colors.textMuted}
                        value={clientQuery} onChangeText={setClientQuery}
                      />
                    </View>
                    <View>
                      {filteredClients.map(c => (
                        <TouchableOpacity key={c.id} style={s.clientRow} onPress={() => setClient(c)} activeOpacity={0.75}>
                          <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.clientName} numberOfLines={1}>{c.full_name || 'Unnamed'}</Text>
                            <Text style={s.clientEmail} numberOfLines={1}>{c.email}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                      {filteredClients.length === 0 && <Text style={s.noClients}>No clients found.</Text>}
                    </View>
                  </>
                )}

                {/* Step 2: folder (after client) */}
                {client && (
                  <>
                    <Text style={s.label}>Folder</Text>
                    {UPLOAD_FOLDERS.map(group => (
                      <View key={group.title} style={{ marginBottom: 4 }}>
                        <Text style={s.groupLabel}>{group.title}</Text>
                        {group.folders.map(f => {
                          const active = folderKey === f.key;
                          const count  = picked.filter(p => p.folderKey === f.key).length;
                          return (
                            <TouchableOpacity key={f.key} style={[s.folderRow, active && s.folderRowActive]} onPress={() => setFolderKey(f.key)} activeOpacity={0.75}>
                              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={16} color={active ? '#E8B923' : Colors.textMuted} />
                              <Text style={[s.folderText, active && { color: Colors.textPrimary, fontWeight: '700' }]}>{f.label}</Text>
                              {count > 0 && (
                                <View style={s.folderQueuedPill}>
                                  <Text style={s.folderQueuedText}>{count}</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </>
                )}

                {/* Step 3: files (after folder) */}
                {client && (
                  <>
                    <View style={s.fileHead}>
                      <Text style={s.label}>Files</Text>
                      <View style={{ flex: 1 }} />
                      {picked.length > 0 && !busy && (
                        <TouchableOpacity
                          onPress={() => setConfirmRemove({ kind: 'all' })}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={s.clearText}>Clear all</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Drop target — a real <div> on web so drag events land. */}
                    {React.createElement(
                      Platform.OS === 'web' ? ('div' as any) : View,
                      Platform.OS === 'web' ? dropHandlers : {},
                      <TouchableOpacity
                        style={[s.dropZone, dragOver && s.dropZoneOver, !folderKey && s.dropZoneLocked]}
                        onPress={pick}
                        activeOpacity={0.8}
                        disabled={!canAddFiles}
                      >
                        <Ionicons
                          name={!folderKey ? 'lock-closed-outline' : dragOver ? 'download-outline' : 'cloud-upload-outline'}
                          size={26}
                          color={folderKey ? '#E8B923' : Colors.textMuted}
                        />
                        <Text style={[s.dropTitle, !folderKey && { color: Colors.textMuted }]}>
                          {!folderKey
                            ? 'Pick a folder first'
                            : dragOver
                              ? 'Drop the files here'
                              : Platform.OS === 'web' ? 'Drag & drop files here' : 'Choose files…'}
                        </Text>
                        {folderKey ? (
                          <>
                            {Platform.OS === 'web' && !dragOver && (
                              <Text style={s.dropSub}>or click to browse</Text>
                            )}
                            <Text style={s.dropHint} numberOfLines={1}>
                              Files go to “{FOLDER_LABEL[folderKey]}”
                            </Text>
                          </>
                        ) : (
                          <Text style={s.dropHint}>Choose one above, then add its files</Text>
                        )}
                      </TouchableOpacity>,
                    )}

                    {/* Queue, already sorted into a folder per destination. */}
                    {queued.length > 0 && (
                      <View style={{ gap: 10, marginTop: 4 }}>
                        <Text style={s.fileCount}>
                          {picked.length} file{picked.length !== 1 ? 's' : ''} ready
                          {queued.length > 1 ? ` · ${queued.length} folders` : ''}
                        </Text>

                        {queued.map(bucket => (
                          <View key={bucket.key} style={s.folderGroup}>
                            <View style={s.folderGroupHead}>
                              <Ionicons name="folder-open" size={15} color="#B5905B" />
                              <Text style={s.folderGroupTitle} numberOfLines={1}>{bucket.label}</Text>
                              <Text style={s.folderGroupCount}>{bucket.files.length}</Text>
                              {!busy && (
                                <TouchableOpacity
                                  onPress={() => setConfirmRemove({ kind: 'group', id: bucket.key, name: bucket.label })}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="close" size={15} color={Colors.textMuted} />
                                </TouchableOpacity>
                              )}
                            </View>

                            {bucket.files.map(f => (
                              <View key={f.id} style={s.fileRow}>
                                <Ionicons name="document-text-outline" size={15} color="#B5905B" />
                                <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
                                {!!f.size && <Text style={s.fileSize}>{fmtSize(f.size)}</Text>}
                                {!busy && (
                                  <TouchableOpacity
                                    onPress={() => setConfirmRemove({ kind: 'one', id: f.id, name: f.name })}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Ionicons name="close" size={15} color={Colors.textMuted} />
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              {/* Edge fades — shown only while content is actually hidden that way. */}
              {overflow.up && (
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
                  style={s.fadeTop}
                />
              )}
              {overflow.down && (
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.96)']}
                  style={s.fadeBottom}
                >
                  <Ionicons name="chevron-down" size={15} color="#B5905B" />
                </LinearGradient>
              )}
              </View>

              <View style={s.row}>
                <TouchableOpacity style={s.cancelBtn} onPress={close} disabled={busy}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                {/* Every queued file already carries its folder, so a non-empty
                    queue plus a client is exactly a valid upload. */}
                <TouchableOpacity
                  style={[s.sendBtn, (!client || picked.length === 0 || busy) && { opacity: 0.5 }]}
                  onPress={upload}
                  disabled={!client || picked.length === 0 || busy}
                >
                  {busy ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#3A3131" size="small" />
                      <Text style={s.sendText}>
                        {picked.length > 1 ? `Uploading ${Math.min(sent + 1, picked.length)} of ${picked.length}…` : 'Uploading…'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={s.sendText}>
                      {picked.length > 1 ? `Upload ${picked.length} files` : 'Upload'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Remove confirmation — sits over the sheet, blocks what's behind ── */}
          {confirmRemove && (
            <Pressable style={rm.overlay} onPress={() => setConfirmRemove(null)}>
              <Pressable style={rm.box} onPress={() => {}}>
                <View style={rm.icon}>
                  <Ionicons name="trash-outline" size={24} color={Colors.error} />
                </View>

                <Text style={rm.title}>
                  {confirmRemove.kind === 'all'      ? 'Remove all files?'
                    : confirmRemove.kind === 'group' ? 'Remove this folder?'
                    : 'Remove this file?'}
                </Text>

                <Text style={rm.sub}>
                  {confirmRemove.kind === 'all'
                    ? `${picked.length} file${picked.length !== 1 ? 's' : ''} will be removed from this upload. You'll need to add them again.`
                    : confirmRemove.kind === 'group'
                      ? `${picked.filter(f => f.folderKey === confirmRemove.id).length} file(s) queued for "${confirmRemove.name}" will be removed.`
                      : `"${confirmRemove.name}" will be removed from this upload.`}
                </Text>

                <View style={rm.row}>
                  <TouchableOpacity style={rm.noBtn} onPress={() => setConfirmRemove(null)} activeOpacity={0.75}>
                    <Text style={rm.noText}>No, keep</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={rm.yesBtn}
                    onPress={() => {
                      if (confirmRemove.kind === 'all')        clearFiles();
                      else if (confirmRemove.kind === 'group') removeGroup(confirmRemove.id);
                      else                                     removeFile(confirmRemove.id);
                      setConfirmRemove(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={15} color={Colors.white} />
                    <Text style={rm.yesText}>Yes, remove</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 28, gap: 8, maxHeight: '92%' },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 13, marginBottom: 4 },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10 },
  groupLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgMid, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  clientName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  clientEmail: { color: Colors.textMuted, fontSize: 12 },
  noClients: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 14 },
  selectedClient: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(181,144,91,0.1)', borderWidth: 1, borderColor: 'rgba(181,144,91,0.4)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  selName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  selEmail: { color: Colors.textMuted, fontSize: 12 },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.bgMid },
  folderRowActive: { borderColor: 'rgba(232,185,35,0.5)', backgroundColor: 'rgba(232,185,35,0.1)' },
  folderText: { color: Colors.textSecondary, fontSize: 13.5, flex: 1 },
  // Count of files already queued for a folder, so it's visible from the list.
  folderQueuedPill: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, backgroundColor: 'rgba(232,185,35,0.22)', alignItems: 'center' },
  folderQueuedText: { color: '#B5905B', fontSize: 10, fontWeight: '800' },

  fileHead: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  clearText: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 10 },

  dropZone: {
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingVertical: 22, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: 'rgba(232,185,35,0.45)', backgroundColor: 'rgba(232,185,35,0.06)',
  },
  dropZoneOver: { borderColor: '#E8B923', backgroundColor: 'rgba(232,185,35,0.18)', borderStyle: 'solid' },
  dropZoneLocked: { borderColor: Colors.border, backgroundColor: Colors.bgMid },
  dropTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 4 },
  dropSub:   { color: Colors.textSecondary, fontSize: 12 },
  dropHint:  { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  fileCount: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  folderGroup: {
    gap: 6, backgroundColor: 'rgba(232,185,35,0.05)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.28)', padding: 9,
  },
  folderGroupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  folderGroupTitle: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, fontWeight: '800' },
  folderGroupCount: {
    color: '#B5905B', fontSize: 10, fontWeight: '800',
    backgroundColor: 'rgba(232,185,35,0.18)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden',
  },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: Colors.bgMid, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 11, paddingVertical: 9,
  },
  fileName: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, fontWeight: '600' },
  fileSize: { color: Colors.textMuted, fontSize: 11 },

  fadeTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 26 },
  fadeBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 34,
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3,
  },

  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  sendBtn: { flex: 2, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sendText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
  doneCircle: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(22,163,74,0.12)', alignItems: 'center', justifyContent: 'center' },
});

// ── Remove-confirmation styles ───────────────────────────────────────────────

const rm = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(28,23,19,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 24, padding: 20, zIndex: 10,
  },
  box: {
    backgroundColor: Colors.white, borderRadius: 20,
    padding: 22, width: '100%', maxWidth: 320,
    alignItems: 'center', gap: 9,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#3A3131', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 14,
  },
  icon: {
    width: 54, height: 54, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(220,38,38,0.09)', marginBottom: 2,
  },
  title: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sub: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 },
  noBtn: {
    flex: 1, backgroundColor: Colors.bgMid, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  noText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13.5 },
  yesBtn: {
    flex: 1, backgroundColor: Colors.error, borderRadius: 12,
    paddingVertical: 12, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  yesText: { color: Colors.white, fontWeight: '800', fontSize: 13.5 },
});
