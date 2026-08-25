import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useSheetStyles } from '../hooks/useSheetStyles';
import { uploadDocumentToStorage, createDocumentRecord, Document } from '../db/documents';
import { moveDocumentToSubfolder } from '../db/subfolders';
import {
  RequiredItem, RequirementService, BANK_STATEMENTS_KEY,
  itemsForClient, collectorFolderForService, createPendingRequirement,
  serviceLabel, monthOf,
} from '../db/requirements';
import { supabase } from '../lib/supabase';

// ── What a client may upload ─────────────────────────────────────────────────
//
// The list is built from the CLIENT'S OWN setup, not a fixed folder list:
//   BK / CFO → their required items for the month, already expanded to one row
//              per configured bank account (Bank Statements — BANK1 ••••1234).
//              Picking one files the upload into that service's Required Info
//              collector AND opens its requirement slot, so the dashboard radio
//              turns yellow straight away.
//   TAX      → the flat TAX folders (the TAX suite has no required-item list).
//
// Only the groups the client actually has are shown.

// Catch-all folder per service, so a client is never stuck with a document that
// isn't one of their required items.
// The n8n flow that has always been told about uploads made from inside a
// folder. Only that one call site ever notified it; the Documents button never
// did. Kept exactly that way here rather than quietly widening what reaches it.
const WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/fileupload-mobileapp-ghl-ftg';

/** 'TAX' | 'BK' | 'CFO' from a folder key — what the webhook calls `folder`. */
const serviceOf = (folderKey: string) =>
  folderKey.startsWith('tax_') ? 'TAX' : folderKey.startsWith('cfo_') ? 'CFO' : 'BK';

/** Tell n8n, and never let it hold up or fail an upload that already worked. */
async function notifyWebhook(args: {
  file: PickedFile; folderKey: string; folderLabel: string;
  documentUrl: string; email: string; userId: string;
}) {
  try {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(args.file.uri)).blob();
      form.append('file', blob, args.file.name);
    } else {
      form.append('file', { uri: args.file.uri, name: args.file.name, type: args.file.mimeType } as any);
    }
    form.append('folder',        serviceOf(args.folderKey));
    form.append('subfolder',     args.folderLabel);
    form.append('subfolder_key', args.folderKey);
    form.append('document_url',  args.documentUrl);
    form.append('email',         args.email);
    form.append('user_id',       args.userId);
    await fetch(WEBHOOK_URL, { method: 'POST', body: form });
  } catch (e: any) {
    console.warn('Webhook notify failed (non-fatal):', e?.message);
  }
}

const EXTRA_FOLDER: Record<'BK' | 'CFO', { key: string; label: string }[]> = {
  BK: [
    { key: 'bk_bank_accounts', label: 'Bank Accounts' },
    { key: 'bk_final_pnl',     label: 'Additional BK Docs' },
  ],
  CFO: [
    { key: 'cfo_additional_docs', label: 'Additional CFO Docs' },
  ],
};

const TAX_FOLDERS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'tax_contracts',          label: 'Tax Contracts',       icon: 'document-text-outline' },
  { key: 'tax_invoices',           label: 'Tax Invoices',        icon: 'receipt-outline' },
  { key: 'tax_client_uploads',     label: 'Client Uploads',      icon: 'cloud-upload-outline' },
  { key: 'tax_additional_docs',    label: 'Additional Tax Docs', icon: 'folder-outline' },
  { key: 'tax_return_information', label: 'Tax Returns',         icon: 'information-circle-outline' },
];

type UploadOption = {
  id: string;                       // stable selection key
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  folder: string;                   // folder table the file is written to
  requirement: RequiredItem | null; // set → also opens a requirement slot
};

type OptionGroup = { title: string; options: UploadOption[] };

/**
 * One queued file. Each carries the document type it was added under, so a
 * single session can queue files for SEVERAL types at once and the list below
 * shows them already sorted into their folders, before anything is sent.
 */
type PickedFile = {
  id: string;
  optionId: string;   // which UploadOption this file belongs to
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

let fileSeq = 0;
const nextFileId = () => `f${++fileSeq}`;

/** Browser File objects (from a drop) → queue entries under one document type. */
function fromDomFiles(files: File[], optionId: string): PickedFile[] {
  return files.map(f => ({
    id: nextFileId(),
    optionId,
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

export function ClientUploadModal({
  visible, onClose, onUploaded, fixedFolder, fixedSubfolder, notify = false,
}: {
  visible: boolean;
  onClose: () => void;
  onUploaded?: (d: Document) => void;
  /**
   * Opened from inside a folder — only that folder's options are offered. For a
   * Required Info folder that is still a list, because the client picks which
   * required item the file is for; for an ordinary folder it is a single choice
   * and gets selected for them.
   */
  fixedFolder?: string | null;
  /** The subfolder they had open, so files land where they were looking. */
  fixedSubfolder?: string | null;
  /**
   * Notify the n8n flow, as uploading from inside a folder always has. Left off
   * for the Documents button, which never did — widening that is a decision for
   * whoever owns the flow, not a side effect of this modal replacing another.
   */
  notify?: boolean;
}) {
  const { user } = useAuth();
  const sheet = useSheetStyles('md');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [sent, setSent] = useState(0);          // files finished, for the progress line
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  // Yes/no guard on the two ways a queued file is lost to a stray tap.
  // Not Alert.alert — react-native-web does not render it, so this is in-sheet.
  const [confirmRemove, setConfirmRemove] = useState<
    | null
    | { kind: 'all' }
    | { kind: 'group'; id: string; name: string }   // a whole document-type folder
    | { kind: 'one'; id: string; name: string }
  >(null);

  const groups = useMemo<OptionGroup[]>(() => {
    const svcs = (user?.services && user.services.length > 0 ? user.services : ['BK']) as RequirementService[];
    const out: OptionGroup[] = [];

    (['BK', 'CFO'] as const).forEach(svc => {
      if (!svcs.includes(svc)) return;
      const collector = collectorFolderForService(svc);
      if (!collector) return;

      const options: UploadOption[] = itemsForClient(user?.services, user?.hasQboAccess, user?.bankAccounts)
        .filter(i => i.service === svc)
        .map(item => ({
          id:     `req:${item.service}:${item.key}`,
          label:  item.label,
          icon:   item.key.startsWith(BANK_STATEMENTS_KEY) ? 'business-outline' : 'document-text-outline',
          folder: collector,
          requirement: item,
        }));

      EXTRA_FOLDER[svc].forEach(extra => options.push({
        id: `folder:${extra.key}`,
        label: extra.label,
        icon: extra.key === 'bk_bank_accounts' ? 'card-outline' : 'folder-outline',
        folder: extra.key,
        requirement: null,
      }));

      out.push({ title: serviceLabel(svc), options });
    });

    if (svcs.includes('TAX')) {
      out.push({
        title: 'Tax',
        options: TAX_FOLDERS.map(f => ({
          id: `folder:${f.key}`, label: f.label, icon: f.icon,
          folder: f.key, requirement: null,
        })),
      });
    }

    if (!fixedFolder) return out;
    return out
      .map(g => ({ ...g, options: g.options.filter(o => o.folder === fixedFolder) }))
      .filter(g => g.options.length > 0);
  }, [user?.services, user?.hasQboAccess, user?.bankAccounts, fixedFolder]);

  const allOptions = useMemo(() => groups.flatMap(g => g.options), [groups]);

  // Opened inside an ordinary folder there is exactly one option, and asking
  // which of one is pointless. A Required Info folder still has several — the
  // client says which item the file is for — so that stays a choice.
  useEffect(() => {
    if (!visible) return;
    if (allOptions.length === 1) setSelectedId(allOptions[0].id);
  }, [visible, allOptions]);

  const selected = useMemo(
    () => allOptions.find(o => o.id === selectedId) ?? null,
    [allOptions, selectedId],
  );

  /**
   * The queue, split into one bucket per document type — in the order the types
   * appear in the picker, so the list reads the same way every time.
   */
  const queued = useMemo(() => {
    const byOption = new Map<string, PickedFile[]>();
    picked.forEach(f => {
      const bucket = byOption.get(f.optionId);
      if (bucket) bucket.push(f); else byOption.set(f.optionId, [f]);
    });
    return allOptions
      .filter(o => byOption.has(o.id))
      .map(o => ({ option: o, files: byOption.get(o.id)! }));
  }, [picked, allOptions]);

  // ── "there is more" affordance ─────────────────────────────────────────────
  // The body grows as files are queued. Fade the edge that still has content
  // behind it so it's obvious the panel scrolls — and only then.
  const [overflow, setOverflow] = useState({ up: false, down: false });
  const viewH    = useRef(0);
  const contentH = useRef(0);
  const scrollY  = useRef(0);

  const recomputeOverflow = useCallback(() => {
    const up   = scrollY.current > 6;
    const down = scrollY.current + viewH.current < contentH.current - 6;
    setOverflow(prev => (prev.up === up && prev.down === down ? prev : { up, down }));
  }, []);

  const reset = () => {
    picked.forEach(revoke);
    setSelectedId(null); setNote(''); setPicked([]);
    setDragOver(false); setSent(0); setBusy(false); setDone(false);
    setUploadedCount(0); setConfirmRemove(null);
    setOverflow({ up: false, down: false });
    scrollY.current = 0;
  };
  const close = () => { reset(); onClose(); };

  /** Add to the queue rather than replace — pick twice, or drop then pick. */
  const addFiles = (files: PickedFile[]) => setPicked(prev => [...prev, ...files]);

  /** Remove a whole document-type bucket at once. */
  const removeGroup = (optionId: string) => setPicked(prev => {
    prev.filter(f => f.optionId === optionId).forEach(revoke);
    return prev.filter(f => f.optionId !== optionId);
  });

  const removeFile = (id: string) => setPicked(prev => {
    const hit = prev.find(f => f.id === id);
    if (hit) revoke(hit);
    return prev.filter(f => f.id !== id);
  });

  const clearFiles = () => { picked.forEach(revoke); setPicked([]); };

  const pick = async () => {
    // Files are always filed under a type — no type picked, nothing to file into.
    if (!selectedId) return;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (r.canceled) return;
      addFiles(r.assets.map(a => ({
        id: nextFileId(),
        optionId: selectedId,
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType ?? 'application/octet-stream',
        size: a.size ?? undefined,
      })));
    } catch { Alert.alert('Error', 'Could not pick a file.'); }
  };

  // ── Web drag & drop ────────────────────────────────────────────────────────
  // react-native-web's View does not forward drag events, so the drop target is
  // a real <div>. On native this collapses to the plain browse button.
  const canAddFiles = !!selectedId && !busy;

  const dropHandlers = Platform.OS === 'web' ? {
    onDragOver:  (e: any) => { e.preventDefault(); if (canAddFiles) setDragOver(true); },
    onDragEnter: (e: any) => { e.preventDefault(); if (canAddFiles) setDragOver(true); },
    onDragLeave: (e: any) => { e.preventDefault(); setDragOver(false); },
    onDrop: (e: any) => {
      e.preventDefault();
      setDragOver(false);
      if (!canAddFiles || !selectedId) return;
      const files: File[] = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) addFiles(fromDomFiles(files, selectedId));
    },
  } : {};

  const upload = async () => {
    if (picked.length === 0 || !user) return;
    setBusy(true);
    setSent(0);

    // Track the folder each upload landed in — the note insert needs it, and it
    // differs per bucket now.
    const uploaded: { doc: Document; folder: string }[] = [];
    const failed: string[] = [];

    try {
      // Bucket by bucket, so every file lands in the folder of the type it was
      // queued under. One at a time so the count is honest and a single bad file
      // can't take the whole batch down with it.
      for (const { option, files } of queued) {
        const inThisGroup: Document[] = [];

        for (const file of files) {
          const url = await uploadDocumentToStorage(user.id, option.folder, file.uri, file.name, file.mimeType);
          if (!url) { failed.push(file.name); setSent(n => n + 1); continue; }

          // Required items carry their label in the filename so staff can identify
          // which account/item the file is for — same convention as the Documents screen.
          const docName = option.requirement ? `${option.label} — ${file.name}` : file.name;

          const doc = await createDocumentRecord({
            userId: user.id,
            email: user.email,
            name: docName,
            documentUrl: url,
            documentType: option.folder,
            uploadedByRole: 'client',
            uploadedBy: user.email,
          });
          if (doc) {
            if (notify) {
              await notifyWebhook({
                file, folderKey: option.folder, folderLabel: option.label,
                documentUrl: url, email: user.email, userId: user.id,
              });
            }
            // Opened from inside a subfolder, so that is where it belongs.
            // createDocumentRecord takes no subfolder, hence the follow-up; a
            // failure here leaves the file in the folder root rather than lost.
            if (fixedSubfolder) await moveDocumentToSubfolder(option.folder, doc.id, fixedSubfolder);
            inThisGroup.push(doc);
            uploaded.push({ doc, folder: option.folder });
          }
          else failed.push(file.name);
          setSent(n => n + 1);
        }

        // Open this type's requirement slot → its dashboard radio turns yellow.
        // ONE slot covers the item no matter how many files were sent for it, so
        // it points at the first upload in this bucket.
        if (option.requirement && user.email && inThisGroup.length > 0) {
          await createPendingRequirement({
            clientEmail:    user.email,
            documentId:     inThisGroup[0].id,
            documentTable:  option.folder,
            service:        option.requirement.service,
            requirementKey: option.requirement.key,
            month:          monthOf(),
          });
        }
      }

      if (uploaded.length === 0) {
        setBusy(false);
        Alert.alert('Upload failed', 'No files could be saved. Check your connection and try again.');
        return;
      }

      // Optional note → first message on EVERY file in the batch, so staff see
      // the context whichever one they open.
      const trimmed = note.trim();
      if (trimmed) {
        await supabase.from('file_conversations').insert(
          uploaded.map(({ doc, folder }) => ({
            file_id:       doc.id,
            folder_table:  folder,
            file_owner_id: user.id,
            sender_id:     user.id,
            sender_name:   user.name ?? user.email ?? 'Client',
            sender_role:   'client',
            message:       trimmed,
            is_read:       false,
          })),
        );
      }

      setBusy(false);
      setUploadedCount(uploaded.length);
      setDone(true);
      uploaded.forEach(({ doc }) => onUploaded?.(doc));

      if (failed.length > 0) {
        Alert.alert(
          'Some files failed',
          `${uploaded.length} uploaded. Could not send: ${failed.join(', ')}`,
        );
      }
      setTimeout(close, 1300);
    } catch (e: any) {
      setBusy(false);
      Alert.alert('Upload failed', e?.message ?? 'Something went wrong.');
    }
  };

  return (
    /* While a batch is in flight, a tap outside (or Back) must not tear the
       modal down mid-upload — the remaining files would never be sent. */
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
                  ? `${uploadedCount} files have been sent for review.`
                  : 'Your document has been sent for review.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.title}>Upload a Document</Text>
              <Text style={s.sub}>Choose what you're uploading, then pick your file.</Text>

              {/* The whole body scrolls; only the title and buttons stay pinned.
                  Capping just the type list clipped the last row mid-height.
                  The scrollbar is left visible — with several files queued the
                  body runs long and there is otherwise no sign it scrolls. It is
                  overflow:auto, so it appears ONLY when the content overflows.
                  `dataSet` tags it so App.tsx can style just this scrollbar. */}
              <View style={{ flexShrink: 1 }}>
              <ScrollView
                showsVerticalScrollIndicator
                // react-native-web-only prop → renders data-ftgscroll="y", which
                // App.tsx styles. Absent from the React Native types, hence the cast.
                {...({ dataSet: { ftgscroll: 'y' } } as any)}
                contentContainerStyle={{ gap: 10 }}
                scrollEventThrottle={16}
                onLayout={e => { viewH.current = e.nativeEvent.layout.height; recomputeOverflow(); }}
                onContentSizeChange={(_w, h) => { contentH.current = h; recomputeOverflow(); }}
                onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; recomputeOverflow(); }}
              >
                <Text style={s.label}>Document type</Text>
                {groups.map((group, gi) => (
                  <View key={group.title} style={gi > 0 ? { marginTop: 12 } : undefined}>
                    {/* Only worth a header when there is more than one group. */}
                    {groups.length > 1 && <Text style={s.groupLabel}>{group.title}</Text>}
                    {group.options.map(opt => {
                      const active = selectedId === opt.id;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[s.folderRow, active && s.folderRowActive]}
                          onPress={() => setSelectedId(opt.id)}
                          activeOpacity={0.75}
                        >
                          <Ionicons
                            name={active ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={active ? '#E8B923' : Colors.textMuted}
                          />
                          <Ionicons name={opt.icon} size={16} color={active ? '#B5905B' : Colors.textMuted} />
                          <Text
                            style={[s.folderText, active && { color: Colors.textPrimary, fontWeight: '700' }]}
                            numberOfLines={1}
                          >
                            {opt.label}
                          </Text>
                          {opt.requirement && <View style={s.reqDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

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
                    style={[
                      s.dropZone,
                      dragOver && s.dropZoneOver,
                      !selected && s.dropZoneLocked,
                    ]}
                    onPress={pick}
                    activeOpacity={0.8}
                    disabled={!canAddFiles}
                  >
                    <Ionicons
                      name={!selected ? 'lock-closed-outline' : dragOver ? 'download-outline' : 'cloud-upload-outline'}
                      size={26}
                      color={selected ? '#E8B923' : Colors.textMuted}
                    />
                    <Text style={[s.dropTitle, !selected && { color: Colors.textMuted }]}>
                      {!selected
                        ? 'Pick a document type first'
                        : dragOver
                          ? 'Drop the files here'
                          : Platform.OS === 'web' ? 'Drag & drop files here' : 'Choose files…'}
                    </Text>
                    {selected ? (
                      <>
                        {Platform.OS === 'web' && !dragOver && (
                          <Text style={s.dropSub}>or click to browse</Text>
                        )}
                        <Text style={s.dropHint} numberOfLines={1}>
                          Files go to “{selected.label}”
                        </Text>
                      </>
                    ) : (
                      <Text style={s.dropHint}>Choose one above, then add its files</Text>
                    )}
                  </TouchableOpacity>,
                )}

                {/* Queue, already sorted into a folder per document type. */}
                {queued.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={s.fileCount}>
                      {picked.length} file{picked.length !== 1 ? 's' : ''} ready
                      {queued.length > 1 ? ` · ${queued.length} folders` : ''}
                    </Text>

                    {queued.map(({ option, files }) => (
                      <View key={option.id} style={s.folderGroup}>
                        <View style={s.folderHead}>
                          <Ionicons name="folder-open" size={15} color="#B5905B" />
                          <Text style={s.folderTitle} numberOfLines={1}>{option.label}</Text>
                          <Text style={s.folderCount}>{files.length}</Text>
                          {!busy && (
                            <TouchableOpacity
                              onPress={() => setConfirmRemove({ kind: 'group', id: option.id, name: option.label })}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close" size={15} color={Colors.textMuted} />
                            </TouchableOpacity>
                          )}
                        </View>

                        {files.map(f => (
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

                <Text style={s.label}>Note <Text style={s.optional}>(optional)</Text></Text>
                <TextInput
                  style={s.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="What is this document for?"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
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
                <TouchableOpacity style={s.cancelBtn} onPress={close}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                {/* Every queued file already carries its type, so the queue being
                    non-empty is exactly the condition for a valid upload. */}
                <TouchableOpacity
                  style={[s.sendBtn, (picked.length === 0 || busy) && { opacity: 0.5 }]}
                  onPress={upload}
                  disabled={picked.length === 0 || busy}
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
                  {confirmRemove.kind === 'all'   ? 'Remove all files?'
                    : confirmRemove.kind === 'group' ? 'Remove this folder?'
                    : 'Remove this file?'}
                </Text>

                <Text style={rm.sub}>
                  {confirmRemove.kind === 'all'
                    ? `${picked.length} file${picked.length !== 1 ? 's' : ''} will be removed from this upload. You'll need to add them again.`
                    : confirmRemove.kind === 'group'
                      ? `${picked.filter(f => f.optionId === confirmRemove.id).length} file(s) queued under "${confirmRemove.name}" will be removed.`
                      : `"${confirmRemove.name}" will be removed from this upload.`}
                </Text>

                <View style={rm.row}>
                  <TouchableOpacity
                    style={rm.noBtn}
                    onPress={() => setConfirmRemove(null)}
                    activeOpacity={0.75}
                  >
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
    backgroundColor: 'rgba(220,38,38,0.09)',
    marginBottom: 2,
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

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 28, gap: 10, maxHeight: '92%' },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 13, marginBottom: 4 },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  groupLabel: { color: '#B5905B', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 },
  optional: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'none' },
  noteInput: { color: Colors.textPrimary, fontSize: 14, backgroundColor: Colors.bgMid, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, minHeight: 72 },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.bgMid },
  folderRowActive: { borderColor: 'rgba(232,185,35,0.5)', backgroundColor: 'rgba(232,185,35,0.1)' },
  folderText: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  // Marks a row that counts toward the monthly Required Documents progress.
  reqDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E8B923' },
  /* "more content this way" fades over the scroll area */
  fadeTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 26,
  },
  fadeBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 34,
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3,
  },

  fileHead: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  clearText: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },

  /* Drop zone */
  dropZone: {
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingVertical: 22, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: 'rgba(232,185,35,0.45)', backgroundColor: 'rgba(232,185,35,0.06)',
  },
  dropZoneOver: {
    borderColor: '#E8B923', backgroundColor: 'rgba(232,185,35,0.18)', borderStyle: 'solid',
  },
  dropZoneLocked: {
    borderColor: Colors.border, backgroundColor: Colors.bgMid,
  },
  dropTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 4 },
  dropSub:   { color: Colors.textSecondary, fontSize: 12 },
  dropHint:  { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  /* Queued files, grouped into a folder per document type */
  fileCount: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  folderGroup: {
    gap: 6,
    backgroundColor: 'rgba(232,185,35,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.28)',
    padding: 9,
  },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  folderTitle: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, fontWeight: '800' },
  folderCount: {
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
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  sendBtn: { flex: 2, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sendText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
  doneCircle: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(22,163,74,0.12)', alignItems: 'center', justifyContent: 'center' },
});
