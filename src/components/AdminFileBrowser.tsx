import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { supabase } from '../lib/supabase';
import {
  approveDocument, rejectDocument, deleteDocumentWithReason, moveDocumentToFolder,
} from '../db/documents';
import { getClientServicesByEmail } from '../db/profiles';
import { moveDestinations, folderLabel } from '../lib/folderCatalog';
import type { Document } from '../db/documents';
import { useAuth } from '../context/AuthContext';
import { FileConversationPanel } from './FileConversationPanel';
import {
  useDownloadSelection, DownloadSelectionBar, DownloadNotice, SelectCheckbox,
} from './DownloadSelectionBar';
import {
  listSubfolders, createSubfolder, renameSubfolder, deleteSubfolder, moveDocumentToSubfolder,
  moveSubfolderToFolder, Subfolder,
  subfolderPath, descendantIds,
} from '../db/subfolders';

// ── Config ────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    key: 'tax' as const,
    abbr: 'TAX',
    title: 'Tax Documents & Returns',
    color: '#E8B923',
    folders: [
      { table: 'tax_contracts',          label: 'Tax Contracts',     icon: 'document-text-outline'      as const },
      { table: 'tax_invoices',           label: 'Tax Invoices',      icon: 'receipt-outline'            as const },
      { table: 'tax_client_uploads',     label: 'Client Uploads',    icon: 'cloud-upload-outline'       as const },
      { table: 'tax_additional_docs',   label: 'Additional Tax Docs', icon: 'folder-outline'          as const },
      { table: 'tax_return_information', label: 'Tax Returns',       icon: 'information-circle-outline' as const },
    ],
  },
  {
    key: 'bk' as const,
    abbr: 'BK',
    title: 'Bookkeeping & Financials',
    color: '#B5905B',
    folders: [
      { table: 'bk_contracts',         label: 'BK Contracts',        icon: 'document-text-outline' as const },
      { table: 'bk_invoices',          label: 'BK Invoices',         icon: 'receipt-outline'       as const },
      { table: 'bk_bank_accounts',     label: 'Bank Accounts',       icon: 'card-outline'          as const },
      { table: 'bk_final_pnl',         label: 'Additional BK Docs',  icon: 'folder-outline'        as const },
      { table: 'bk_mr_required_info',  label: 'Monthly Reporting (Required Info)',     icon: 'cloud-upload-outline' as const },
      { table: 'bk_mr_client_review',  label: 'Monthly Reporting (For Client Review)', icon: 'eye-outline'          as const },
      { table: 'bk_mr_final_statements', label: 'Monthly Reporting (Final Statements)', icon: 'ribbon-outline'      as const },
    ],
  },
  {
    key: 'cfo' as const,
    abbr: 'CFO',
    title: 'CFO Advisory',
    color: '#8B6914',
    folders: [
      { table: 'cfo_contracts',        label: 'CFO Contracts',        icon: 'document-text-outline' as const },
      { table: 'cfo_invoices',         label: 'CFO Invoices',         icon: 'receipt-outline'       as const },
      { table: 'cfo_additional_docs',  label: 'Additional CFO Docs',  icon: 'folder-outline'        as const },
      { table: 'cfo_mr_required_info', label: 'Monthly Reporting (Required Info)',     icon: 'cloud-upload-outline' as const },
      { table: 'cfo_mr_client_review', label: 'Monthly Reporting (For Client Review)', icon: 'eye-outline'          as const },
      { table: 'cfo_mr_final_statements', label: 'Monthly Reporting (Final Statements & Insights)', icon: 'ribbon-outline' as const },
    ],
  },
];

type FileFilter = 'all' | 'new' | 'viewed' | 'rejected' | 'approved';

const FILE_FILTERS: { key: FileFilter; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'new',      label: 'New' },
  { key: 'viewed',   label: 'Viewed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'approved', label: 'Approved' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type Category   = typeof CATEGORIES[number];
type FolderMeta = Category['folders'][number];

interface FolderStats  { table: string; total: number; newCount: number }
interface ClientGroup  { user_id: string | null; email: string; name: string; docCount: number; newCount: number }
interface ConvPreview  { sender_name: string; sender_role: string; message: string; created_at: string; is_read: boolean }

interface FileRow {
  id: string; name: string; status: string;
  approval_status: string; approval_note: string | null;
  document_url: string; created_at: string; email: string;
  subfolder_id?: string | null;
  convCount?: number; latestReply?: ConvPreview | null; unreadCount?: number;
}

type NavLevel =
  | { kind: 'categories' }
  | { kind: 'folders';  category: Category }
  | { kind: 'clients';  category: Category; folder: FolderMeta }
  | { kind: 'files';    category: Category; folder: FolderMeta; client: ClientGroup }
  | { kind: 'detail';   category: Category; folder: FolderMeta; client: ClientGroup; file: FileRow };

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const fmtRelTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const EXT_COLOR: Record<string, string> = {
  pdf: '#E8B923', doc: '#B5905B', docx: '#B5905B',
  xls: '#10B981', xlsx: '#10B981', jpg: '#6366F1', jpeg: '#6366F1', png: '#6366F1',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { visible: boolean; onClose: () => void }

export function AdminFileBrowser({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [nav, setNav]     = useState<NavLevel>({ kind: 'categories' });
  const [loading, setLoading] = useState(false);

  // Data per level
  const [catStats, setCatStats]     = useState<Record<string, { total: number; newCount: number }>>({});
  const [folderStats, setFolderStats] = useState<FolderStats[]>([]);
  const [clients, setClients]       = useState<ClientGroup[]>([]);
  const [files, setFiles]           = useState<FileRow[]>([]);

  // File list UI state
  const [fileQuery, setFileQuery]   = useState('');
  const [fileFilter, setFileFilter] = useState<FileFilter>('all');

  // Actions
  const [actionBusy, setActionBusy]       = useState<string | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<FileRow | null>(null);
  const [rejectNote, setRejectNote]       = useState('');
  const [rejectFolder, setRejectFolder]   = useState('');
  const [viewFile, setViewFile]           = useState<{ url: string; name: string } | null>(null);
  const [convOpen, setConvOpen]           = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState<{ file: FileRow; folderTable: string } | null>(null);
  const [deleteBusy, setDeleteBusy]       = useState(false);
  const [deleteError, setDeleteError]     = useState<string | null>(null);

  // Subfolders (staff/admin created, global per folder table)
  const [subfolders, setSubfolders]       = useState<Subfolder[]>([]);
  const [activeSubfolder, setActiveSubfolder] = useState<string>('all'); // 'all' | 'none' | <id>
  // Which folder's contents the bar is showing. null = the folder table itself.
  // Separate from activeSubfolder, which is the FILTER: you can be standing in
  // Chase, looking at everything under it, and step into 2024 from there.
  const [subCwd, setSubCwd] = useState<string | null>(null);
  const [newSubOpen, setNewSubOpen]       = useState(false);
  const [newSubName, setNewSubName]       = useState('');
  const [newSubError, setNewSubError]     = useState<string | null>(null);
  const [subBusy, setSubBusy]             = useState(false);
  const [delSubTarget, setDelSubTarget]   = useState<Subfolder | null>(null);
  // Moving a whole subfolder to another folder, contents and all.
  const [subMove, setSubMove]             = useState<Subfolder | null>(null);
  const [subMoveBusy, setSubMoveBusy]     = useState(false);
  const [subMoveError, setSubMoveError]   = useState<string | null>(null);
  // Renaming, not deleting-and-recreating: the files keep pointing at the same
  // subfolder, so nothing has to be re-filed afterwards.
  const [renSubTarget, setRenSubTarget]   = useState<Subfolder | null>(null);
  const [renSubName, setRenSubName]       = useState('');
  const [renSubError, setRenSubError]     = useState<string | null>(null);
  const [moveTarget, setMoveTarget]       = useState<{ file: FileRow; folderTable: string } | null>(null);
  // Moving to another FOLDER, as against another subfolder of this one.
  const [folderMove, setFolderMove]       = useState<{ file: FileRow; from: string; email: string } | null>(null);
  const [folderMoveServices, setFolderMoveServices] = useState<string[] | null>(null);
  const [folderMoveBusy, setFolderMoveBusy]         = useState(false);
  const [folderMoveError, setFolderMoveError]       = useState<string | null>(null);

  // ── Load categories ─────────────────────────────────────────────────────────

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      CATEGORIES.map(async (cat) => {
        const tableResults = await Promise.all(cat.folders.map(f => supabase.from(f.table).select('id, status')));
        const allDocs = tableResults.flatMap(r => r.data ?? []);
        return { key: cat.key, total: allDocs.length, newCount: allDocs.filter(d => d.status === 'new').length };
      })
    );
    if (!mountedRef.current) return;
    const map: Record<string, { total: number; newCount: number }> = {};
    for (const r of results) map[r.key] = { total: r.total, newCount: r.newCount };
    setCatStats(map);
    setLoading(false);
  }, []);

  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setNav({ kind: 'categories' });
      loadCategories();
    }
    wasVisibleRef.current = visible;
  }, [visible, loadCategories]);

  // ── Open category → folders ─────────────────────────────────────────────────

  const openCategory = async (cat: Category) => {
    setNav({ kind: 'folders', category: cat });
    setLoading(true);
    const results = await Promise.all(
      cat.folders.map(async (f) => {
        const { data } = await supabase.from(f.table).select('id, status');
        const docs = data ?? [];
        return { table: f.table, total: docs.length, newCount: docs.filter(d => d.status === 'new').length };
      })
    );
    if (mountedRef.current) { setFolderStats(results); setLoading(false); }
  };

  // ── Open folder → clients ───────────────────────────────────────────────────

  const openFolder = async (cat: Category, folder: FolderMeta) => {
    setNav({ kind: 'clients', category: cat, folder });
    setActiveSubfolder('all');
    setSubCwd(null);
    listSubfolders(folder.table).then(subs => { if (mountedRef.current) setSubfolders(subs); });
    setLoading(true);
    const { data: docs } = await supabase.from(folder.table).select('id, user_id, email, status').order('email', { ascending: true });
    const allDocs = docs ?? [];
    const clientMap = new Map<string, ClientGroup>();
    for (const doc of allDocs) {
      const key = (doc.user_id || doc.email || 'unknown') as string;
      const existing = clientMap.get(key);
      if (existing) { existing.docCount++; if (doc.status === 'new') existing.newCount++; }
      else clientMap.set(key, { user_id: doc.user_id ?? null, email: doc.email ?? '', name: doc.email ?? 'Unknown', docCount: 1, newCount: doc.status === 'new' ? 1 : 0 });
    }
    const userIds = [...clientMap.values()].map(c => c.user_id).filter(Boolean) as string[];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      for (const p of profiles ?? []) { const g = clientMap.get(p.id); if (g) g.name = (p as any).full_name || p.email || g.email; }
    }
    const sorted = [...clientMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (mountedRef.current) { setClients(sorted); setLoading(false); }
  };

  // ── Open client → files ─────────────────────────────────────────────────────

  const openClient = async (cat: Category, folder: FolderMeta, client: ClientGroup) => {
    setNav({ kind: 'files', category: cat, folder, client });
    setFileQuery('');
    setFileFilter('all');
    setActiveSubfolder('all');
    setSubCwd(null);
    setLoading(true);
    // Subfolders belong to a client, so this list is theirs plus the legacy
    // shared ones — see database/subfolders_per_client.sql.
    listSubfolders(folder.table, client.email).then(subs => { if (mountedRef.current) setSubfolders(subs); });
    const base = supabase.from(folder.table).select('id, name, status, approval_status, approval_note, document_url, created_at, email, subfolder_id').order('created_at', { ascending: false });
    const { data } = client.user_id ? await base.eq('user_id', client.user_id) : await base.eq('email', client.email);
    const rawFiles = (data ?? []) as FileRow[];
    const fileIds = rawFiles.map(f => f.id);
    let enriched = rawFiles;
    if (fileIds.length > 0) {
      const { data: convs } = await supabase.from('file_conversations').select('file_id, sender_name, sender_role, message, created_at, is_read').eq('folder_table', folder.table).in('file_id', fileIds).order('created_at', { ascending: false });
      const convMap = new Map<string, { count: number; unread: number; latest: ConvPreview }>();
      for (const c of convs ?? []) {
        const ex = convMap.get(c.file_id);
        if (ex) { ex.count++; if (!c.is_read && c.sender_role === 'client') ex.unread++; }
        else convMap.set(c.file_id, { count: 1, unread: (!c.is_read && c.sender_role === 'client') ? 1 : 0, latest: { sender_name: c.sender_name, sender_role: c.sender_role, message: c.message, created_at: c.created_at, is_read: c.is_read } });
      }
      enriched = rawFiles.map(f => ({ ...f, convCount: convMap.get(f.id)?.count ?? 0, unreadCount: convMap.get(f.id)?.unread ?? 0, latestReply: convMap.get(f.id)?.latest ?? null }));
    }
    if (mountedRef.current) { setFiles(enriched); setLoading(false); }
  };

  // ── Back navigation ─────────────────────────────────────────────────────────

  const navRef = useRef(nav);
  useEffect(() => { navRef.current = nav; }, [nav]);

  const goBack = useCallback(() => {
    const current = navRef.current;
    if (current.kind === 'categories') { onClose(); return; }
    if (current.kind === 'folders')    { setNav({ kind: 'categories' }); return; }
    if (current.kind === 'clients')    { setNav({ kind: 'folders', category: current.category }); return; }
    if (current.kind === 'files')      { setNav({ kind: 'clients', category: current.category, folder: current.folder }); return; }
    if (current.kind === 'detail')     { setNav({ kind: 'files', category: current.category, folder: current.folder, client: current.client }); return; }
  }, [onClose]);

  // ── Approve / Reject ────────────────────────────────────────────────────────

  const handleApprove = async (file: FileRow, folderTable: string) => {
    if (actionBusy) return;
    setActionBusy(file.id);
    const ok = await approveDocument(file.id, folderTable, user?.email ?? 'admin');
    if (ok) {
      const update = (f: FileRow) => f.id === file.id ? { ...f, approval_status: 'approved' } : f;
      setFiles(prev => prev.map(update));
      setNav(prev => prev.kind === 'detail' && prev.file.id === file.id
        ? { ...prev, file: { ...prev.file, approval_status: 'approved' } }
        : prev);
    }
    setActionBusy(null);
  };

  const openReject = (file: FileRow, folderTable: string) => {
    setRejectTarget(file); setRejectFolder(folderTable); setRejectNote('');
  };

  const handleReject = async (note: string) => {
    if (!rejectTarget || actionBusy) return;
    setActionBusy(rejectTarget.id);
    const ok = await rejectDocument(rejectTarget.id, rejectFolder, user?.email ?? 'admin', note);
    if (ok) {
      const update = (f: FileRow) => f.id === rejectTarget.id ? { ...f, approval_status: 'rejected', approval_note: note || null } : f;
      setFiles(prev => prev.map(update));
      setNav(prev => prev.kind === 'detail' && prev.file.id === rejectTarget.id
        ? { ...prev, file: { ...prev.file, approval_status: 'rejected', approval_note: note || null } }
        : prev);
    }
    setRejectTarget(null);
    setActionBusy(null);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await deleteDocumentWithReason(deleteTarget.file.id, deleteTarget.folderTable);
    setDeleteBusy(false);

    // A refusal now says why, and the dialog stays open holding it. It used to
    // close on failure as though nothing had happened.
    if (!res.ok) { setDeleteError(res.error); return; }

    const id = deleteTarget.file.id;
    setFiles(prev => prev.filter(f => f.id !== id));
    // If we were viewing the deleted file, step back to its file list.
    setNav(prev => prev.kind === 'detail' && prev.file.id === id
      ? { kind: 'files', category: prev.category, folder: prev.folder, client: prev.client }
      : prev);
    setDeleteTarget(null);
  };

  // ── Subfolders ──────────────────────────────────────────────────────────────

  const currentFolderTable =
    nav.kind === 'clients' || nav.kind === 'files' || nav.kind === 'detail' ? nav.folder.table : null;

  // Whose files are open, if any — a subfolder made here belongs to them.
  const currentClientEmail =
    nav.kind === 'files' || nav.kind === 'detail' ? nav.client.email : null;

  const handleCreateSubfolder = async () => {
    const name = newSubName.trim();
    if (!name || !currentFolderTable || subBusy) return;
    const siblings = subfolders.filter(sf => (sf.parent_subfolder_id ?? null) === subCwd);
    if (siblings.some(sf => sf.name.toLowerCase() === name.toLowerCase())) {
      setNewSubError('There is already a folder by that name here.');
      return;
    }
    setSubBusy(true);
    const created = await createSubfolder(currentFolderTable, name, user?.email ?? null, currentClientEmail, subCwd);
    setSubBusy(false);
    if (created) {
      setSubfolders(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setActiveSubfolder(created.id);
    }
    setNewSubName('');
    setNewSubError(null);
    setNewSubOpen(false);
  };

  const handleRenameSubfolder = async () => {
    const name = renSubName.trim();
    if (!renSubTarget || !name || subBusy) return;
    if (name === renSubTarget.name) { setRenSubTarget(null); return; }
    // Checked here so the message names the real reason; the unique index
    // refuses it either way.
    // Only its siblings matter now: "2024" under Chase and "2024" under Amex
    // are two different folders, and the index allows both.
    const siblings = subfolders.filter(sf =>
      (sf.parent_subfolder_id ?? null) === (renSubTarget.parent_subfolder_id ?? null));
    if (siblings.some(sf => sf.id !== renSubTarget.id && sf.name.toLowerCase() === name.toLowerCase())) {
      setRenSubError('There is already a folder by that name here.');
      return;
    }
    setSubBusy(true);
    const row = await renameSubfolder(renSubTarget.id, name);
    setSubBusy(false);
    if (!row) { setRenSubError('Could not rename that folder.'); return; }
    setSubfolders(prev => prev
      .map(s => (s.id === row.id ? row : s))
      .sort((a, b) => a.name.localeCompare(b.name)));
    setRenSubTarget(null);
  };

  const handleDeleteSubfolder = async () => {
    if (!delSubTarget || subBusy) return;
    setSubBusy(true);
    const ok = await deleteSubfolder(delSubTarget.id);
    setSubBusy(false);
    if (ok) {
      const id = delSubTarget.id;
      // The database cascades to everything inside it; mirror that here rather
      // than leaving children pointing at a folder that has gone.
      const gone = new Set([id, ...descendantIds(subfolders, id)]);
      setSubfolders(prev => prev.filter(s => !gone.has(s.id)));
      // Files that were in any of them become unfiled (FK reset to null).
      setFiles(prev => prev.map(f => (f.subfolder_id && gone.has(f.subfolder_id))
        ? { ...f, subfolder_id: null } : f));
      if (gone.has(activeSubfolder)) setActiveSubfolder('all');
      // Standing inside what was deleted? Step out to the nearest survivor.
      if (subCwd && gone.has(subCwd)) {
        const above = subfolderPath(subfolders, subCwd).map(p => p.id).filter(pid => !gone.has(pid));
        setSubCwd(above.length ? above[above.length - 1] : null);
      }
    }
    setDelSubTarget(null);
  };

  // What the client actually takes, so the sheet cannot offer a folder they
  // never open. Fetched when the sheet opens rather than held for every row.
  useEffect(() => {
    // Either kind of move needs it: one file, or a subfolder and its contents.
    const email = folderMove?.email ?? subMove?.owner_email ?? null;
    if (!email) { setFolderMoveServices(null); return; }
    let live = true;
    getClientServicesByEmail(email).then(s => { if (live) setFolderMoveServices(s); });
    return () => { live = false; };
  }, [folderMove, subMove]);

  const handleMoveSubfolder = async (toTable: string) => {
    if (!subMove || subMoveBusy) return;
    setSubMoveBusy(true);
    setSubMoveError(null);
    const res = await moveSubfolderToFolder(subMove.id, toTable);
    setSubMoveBusy(false);

    if (!res.ok) { setSubMoveError(res.error); return; }

    // The subfolder and its files belong to another folder now, so both leave
    // this view rather than lingering until the next load.
    const gone = new Set([subMove.id, ...descendantIds(subfolders, subMove.id)]);
    setSubfolders(prev => prev.filter(sf => !gone.has(sf.id)));
    setFiles(prev => prev.filter(f => !(f.subfolder_id && gone.has(f.subfolder_id))));
    if (gone.has(activeSubfolder)) setActiveSubfolder('all');
    if (subCwd && gone.has(subCwd)) setSubCwd(null);
    setSubMove(null);
  };

  const handleMoveToFolder = async (toTable: string) => {
    if (!folderMove || folderMoveBusy) return;
    setFolderMoveBusy(true);
    setFolderMoveError(null);
    const res = await moveDocumentToFolder(folderMove.file.id, folderMove.from, toTable);
    setFolderMoveBusy(false);

    if (!res.ok) { setFolderMoveError(res.error); return; }

    // It has left this folder, so it should leave this list — staying would
    // show a file that is no longer here until the next refresh.
    const id = folderMove.file.id;
    setFiles(prev => prev.filter(f => f.id !== id));
    setFolderMove(null);
    setNav(prev => (prev.kind === 'detail' && prev.file.id === id
      ? { kind: 'files', category: prev.category, folder: prev.folder, client: prev.client }
      : prev));
  };

  const handleMoveToSubfolder = async (subfolderId: string | null) => {
    if (!moveTarget || subBusy) return;
    setSubBusy(true);
    const ok = await moveDocumentToSubfolder(moveTarget.folderTable, moveTarget.file.id, subfolderId);
    setSubBusy(false);
    if (ok) {
      const id = moveTarget.file.id;
      setFiles(prev => prev.map(f => f.id === id ? { ...f, subfolder_id: subfolderId } : f));
      setNav(prev => prev.kind === 'detail' && prev.file.id === id
        ? { ...prev, file: { ...prev.file, subfolder_id: subfolderId } }
        : prev);
    }
    setMoveTarget(null);
  };

  // ── File filter helper ──────────────────────────────────────────────────────

  const dl = useDownloadSelection<FileRow>(
    useCallback((f: FileRow) => ({ url: f.document_url, name: f.name }), []),
  );

  const filteredFiles = files.filter(f => {
    if (fileFilter === 'new'      && f.status !== 'new')                   return false;
    if (fileFilter === 'viewed'   && f.status !== 'viewed')                return false;
    if (fileFilter === 'rejected' && f.approval_status !== 'rejected')     return false;
    if (fileFilter === 'approved' && f.approval_status !== 'approved')     return false;
    if (activeSubfolder === 'none' && f.subfolder_id)                      return false;
    // A folder shows its own files AND everything filed further in, so a
    // parent is not misleadingly empty while its children hold everything.
    if (activeSubfolder !== 'all' && activeSubfolder !== 'none') {
      const within = new Set([activeSubfolder, ...descendantIds(subfolders, activeSubfolder)]);
      if (!f.subfolder_id || !within.has(f.subfolder_id)) return false;
    }
    if (fileQuery.trim() && !f.name.toLowerCase().includes(fileQuery.toLowerCase())) return false;
    return true;
  });

  // ── Header ──────────────────────────────────────────────────────────────────

  const headerTitle = (() => {
    if (nav.kind === 'categories') return 'Select a Category';
    if (nav.kind === 'folders')    return nav.category.title;
    if (nav.kind === 'clients')    return nav.folder.label;
    if (nav.kind === 'files')      return nav.client.name;
    if (nav.kind === 'detail')     return nav.file.name;
    return '';
  })();

  const headerTag = nav.kind !== 'categories' ? (nav as any).category?.abbr as string : null;

  // ── Renderers ───────────────────────────────────────────────────────────────

  // Subfolder chip bar — used at both the clients level and the file-list level,
  // so staff can create/manage subfolders even when the folder is empty.
  // `withFileFilters` shows the All Files / Unfiled chips (file-list only).
  const renderSubfolderBar = (withFileFilters: boolean) => {
    // The open subfolder, if one is. Its actions are spelled out below the chips
    // rather than left as four small icons on the chip itself — Belly Jane
    // reported the move as missing when it was one of them.
    const openSub = withFileFilters && activeSubfolder !== 'all' && activeSubfolder !== 'none'
      ? subfolders.find(sf => sf.id === activeSubfolder) ?? null
      : null;
    return (
    <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fb.subBar} contentContainerStyle={fb.subBarContent}>
      {withFileFilters && ([
        { id: 'all',  label: 'All Files', icon: 'albums-outline' as const },
        { id: 'none', label: 'Unfiled',   icon: 'file-tray-outline' as const },
      ]).map(chip => {
        const active = activeSubfolder === chip.id;
        const cnt = chip.id === 'all' ? files.length : files.filter(f => !f.subfolder_id).length;
        return (
          <TouchableOpacity key={chip.id} style={[fb.subChip, active && fb.subChipActive]} onPress={() => setActiveSubfolder(chip.id)} activeOpacity={0.8}>
            <Ionicons name={chip.icon} size={13} color={active ? '#1C1713' : '#B5905B'} />
            <Text style={[fb.subChipText, active && fb.subChipTextActive]}>{chip.label}</Text>
            {cnt > 0 && <Text style={[fb.subChipCount, active && { color: '#1C1713' }]}>{cnt}</Text>}
          </TouchableOpacity>
        );
      })}
      {/* Where we are, when we have stepped inside something. */}
      {subCwd && subfolderPath(subfolders, subCwd).map((crumb, i, all) => (
        <React.Fragment key={crumb.id}>
          {i === 0 && (
            <TouchableOpacity
              style={fb.subChip}
              onPress={() => { setSubCwd(null); setActiveSubfolder('all'); }}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-up" size={13} color="#B5905B" />
              <Text style={fb.subChipText}>Top</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[fb.subChip, i === all.length - 1 && fb.subChipActive]}
            onPress={() => { setSubCwd(crumb.id); setActiveSubfolder(crumb.id); }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="folder-open"
              size={13}
              color={i === all.length - 1 ? '#1C1713' : '#B5905B'}
            />
            <Text style={[fb.subChipText, i === all.length - 1 && fb.subChipTextActive]}>{crumb.name}</Text>
          </TouchableOpacity>
        </React.Fragment>
      ))}

      {/* The folders sitting at this level. */}
      {subfolders.filter(sf => (sf.parent_subfolder_id ?? null) === subCwd).map(sf => {
        const active = withFileFilters && activeSubfolder === sf.id;
        const within = new Set([sf.id, ...descendantIds(subfolders, sf.id)]);
        const cnt = files.filter(f => f.subfolder_id && within.has(f.subfolder_id)).length;
        const hasChildren = subfolders.some(x => x.parent_subfolder_id === sf.id);
        return (
          <TouchableOpacity
            key={sf.id}
            style={[fb.subChip, active && fb.subChipActive]}
            onPress={() => {
              if (!withFileFilters) { setDelSubTarget(sf); return; }
              // First tap filters to it; tapping the one already open steps in.
              if (activeSubfolder === sf.id) setSubCwd(sf.id);
              else setActiveSubfolder(sf.id);
            }}
            onLongPress={() => { setRenSubName(sf.name); setRenSubError(null); setRenSubTarget(sf); }}
            delayLongPress={350}
            activeOpacity={0.8}
          >
            <Ionicons name={hasChildren ? 'folder-open' : 'folder'} size={13} color={active ? '#1C1713' : '#B5905B'} />
            <Text style={[fb.subChipText, active && fb.subChipTextActive]}>{sf.name}</Text>
            {withFileFilters && cnt > 0 && <Text style={[fb.subChipCount, active && { color: '#1C1713' }]}>{cnt}</Text>}
            {active && (
              <>
                <TouchableOpacity onPress={() => setSubCwd(sf.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="enter-outline" size={13} color="#1C1713" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setRenSubName(sf.name); setRenSubError(null); setRenSubTarget(sf); }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="pencil" size={12} color="#1C1713" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setSubMoveError(null); setSubMove(sf); }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="swap-horizontal" size={13} color="#1C1713" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDelSubTarget(sf)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close" size={13} color="#1C1713" />
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={fb.subNewChip} onPress={() => { setNewSubName(''); setNewSubError(null); setNewSubOpen(true); }} activeOpacity={0.8}>
        <Ionicons name="add" size={15} color="#E8B923" />
        <Text style={fb.subNewText} numberOfLines={1}>
          {subCwd ? `New folder in ${subfolderPath(subfolders, subCwd).slice(-1)[0]?.name ?? ''}` : 'New Subfolder'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
    {openSub && (
      <View style={fb.subActions}>
        <Ionicons name="folder-open" size={13} color="#B5905B" />
        <Text style={fb.subActionsName} numberOfLines={1}>{openSub.name}</Text>
        <TouchableOpacity
          style={fb.subActionBtn}
          onPress={() => { setRenSubName(openSub.name); setRenSubError(null); setRenSubTarget(openSub); }}
        >
          <Ionicons name="pencil" size={12} color="#475569" />
          <Text style={fb.subActionText}>Rename</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[fb.subActionBtn, fb.subActionMove]}
          onPress={() => { setSubMoveError(null); setSubMove(openSub); }}
        >
          <Ionicons name="swap-horizontal" size={12} color="#1C1713" />
          <Text style={[fb.subActionText, { color: '#1C1713' }]}>Move to another folder</Text>
        </TouchableOpacity>
        <TouchableOpacity style={fb.subActionBtn} onPress={() => setDelSubTarget(openSub)}>
          <Ionicons name="trash-outline" size={12} color="#EF4444" />
          <Text style={[fb.subActionText, { color: '#EF4444' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    )}
    </>
    );
  };

  const renderCategories = () => (
    <ScrollView contentContainerStyle={fb.scrollContent} showsVerticalScrollIndicator={false}>
      {CATEGORIES.map(cat => {
        const stats = catStats[cat.key] ?? { total: 0, newCount: 0 };
        return (
          <TouchableOpacity key={cat.key} style={fb.catCard} onPress={() => openCategory(cat)} activeOpacity={0.88}>
            <LinearGradient colors={['#3A3131', '#2C2320']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fb.catCardInner}>
              <View style={fb.catTopRow}>
                <View style={[fb.catAbbr, { borderColor: cat.color + '60' }]}>
                  <Text style={[fb.catAbbrText, { color: cat.color }]}>{cat.abbr}</Text>
                </View>
                <View style={{ flex: 1 }} />
                {stats.newCount > 0 && <View style={[fb.catNewBadge, { backgroundColor: cat.color }]}><Text style={fb.catNewText}>{stats.newCount} new</Text></View>}
                <TouchableOpacity style={[fb.catArrow, { backgroundColor: cat.color }]} onPress={() => openCategory(cat)} activeOpacity={0.8}>
                  <Ionicons name="arrow-forward" size={16} color="#1C1713" />
                </TouchableOpacity>
              </View>
              <Text style={fb.catTitle}>{cat.title}</Text>
              <View style={fb.catDivider} />
              <View style={fb.catChips}>
                {cat.folders.map(f => (
                  <View key={f.table} style={fb.catChip}>
                    <Ionicons name={f.icon} size={10} color="rgba(255,255,255,0.4)" />
                    <Text style={fb.catChipText}>{f.label}</Text>
                  </View>
                ))}
              </View>
              <View style={fb.catFooter}>
                <Ionicons name="folder-outline" size={12} color="rgba(255,255,255,0.3)" />
                <Text style={fb.catFooterText}>{cat.folders.length} folders</Text>
                <Text style={fb.catFooterDot}>•</Text>
                <Ionicons name="document-outline" size={12} color="rgba(255,255,255,0.3)" />
                <Text style={fb.catFooterText}>{stats.total} documents</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderFolders = () => {
    if (nav.kind !== 'folders') return null;
    const cat = nav.category;
    return (
      <ScrollView contentContainerStyle={fb.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={fb.sectionLabel}>FOLDERS</Text>
        {cat.folders.map((f, idx) => {
          const stats = folderStats.find(s => s.table === f.table) ?? { total: 0, newCount: 0 };
          const isEmpty = stats.total === 0;
          return (
            <TouchableOpacity key={f.table} style={[fb.folderRow, idx === cat.folders.length - 1 && { borderBottomWidth: 0 }]} onPress={() => openFolder(cat, f)} activeOpacity={0.82}>
              <View style={[fb.folderIcon, { backgroundColor: cat.color + '18' }]}>
                <Ionicons name={f.icon} size={20} color={cat.color} />
              </View>
              <View style={fb.folderInfo}>
                <Text style={[fb.folderLabel, isEmpty && { color: '#94A3B8' }]}>{f.label}</Text>
                <Text style={fb.folderSub}>
                  {isEmpty ? 'Empty' : `${stats.total} document${stats.total !== 1 ? 's' : ''}`}
                  {!isEmpty && stats.newCount > 0 ? ` · ${stats.newCount} unread` : ''}
                </Text>
                {!isEmpty && (
                  <View style={fb.folderBar}>
                    <View style={[fb.folderBarFill, { backgroundColor: cat.color, width: `${Math.min((stats.total / 10) * 100, 100)}%` as any }]} />
                  </View>
                )}
              </View>
              {!isEmpty && stats.newCount > 0 && <View style={[fb.unreadBadge, { backgroundColor: cat.color }]}><Text style={fb.unreadBadgeText}>{stats.newCount}</Text></View>}
              <Ionicons name="chevron-forward" size={16} color={isEmpty ? '#D1D5DB' : '#94A3B8'} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  const renderClients = () => {
    if (nav.kind !== 'clients') return null;
    const { category: cat, folder } = nav;
    return (
      <View style={{ flex: 1 }}>
        {/* Subfolder management — available even when the folder has no files yet */}
        {renderSubfolderBar(false)}
        {clients.length === 0 ? (
          <View style={fb.emptyWrap}><Ionicons name="people-outline" size={52} color="rgba(232,185,35,0.25)" /><Text style={fb.emptyTitle}>No files yet</Text><Text style={fb.emptySub}>Create subfolders above. Files appear here once uploaded.</Text></View>
        ) : (
      <FlatList
        data={clients}
        keyExtractor={c => c.user_id ?? c.email}
        contentContainerStyle={fb.scrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<Text style={fb.sectionLabel}>CLIENTS ({clients.length})</Text>}
        renderItem={({ item, index }) => (
          <TouchableOpacity style={[fb.clientRow, index === clients.length - 1 && { borderBottomWidth: 0 }]} onPress={() => openClient(cat, folder, item)} activeOpacity={0.82}>
            <LinearGradient colors={['#E8B923', '#B5905B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fb.clientAvatar}>
              <Text style={fb.clientAvatarText}>
                {item.name.trim().split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || 'U'}
              </Text>
            </LinearGradient>
            <View style={fb.clientInfo}>
              <Text style={fb.clientName} numberOfLines={1}>{item.name}</Text>
              <Text style={fb.clientEmail} numberOfLines={1}>{item.email}</Text>
              <Text style={fb.clientDocCount}>{item.docCount} file{item.docCount !== 1 ? 's' : ''}{item.newCount > 0 ? ` · ${item.newCount} new` : ''}</Text>
            </View>
            {item.newCount > 0 && <View style={[fb.unreadBadge, { backgroundColor: cat.color }]}><Text style={fb.unreadBadgeText}>{item.newCount}</Text></View>}
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
      />
        )}
      </View>
    );
  };

  // ── File List (redesigned to match screenshot) ──────────────────────────────

  const renderFiles = () => {
    if (nav.kind !== 'files') return null;
    const { category: cat, folder, client } = nav;
    const totalNew      = files.filter(f => f.status === 'new').length;
    const totalUnread   = files.reduce((s, f) => s + (f.unreadCount ?? 0), 0);

    return (
      <View style={{ flex: 1 }}>
        {/* Sub-header: file count + unread */}
        <LinearGradient colors={['#3A3131', '#2C2320']} style={fb.fileSubHeader}>
          <View style={[fb.fileSubIcon, { backgroundColor: cat.color + '20' }]}>
            <Ionicons name={folder.icon} size={18} color={cat.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={fb.fileSubTitle}>{folder.label}</Text>
            <Text style={fb.fileSubSub}>
              {files.length} file{files.length !== 1 ? 's' : ''}
              {totalUnread > 0 ? ` · ${totalUnread} unread` : ''}
            </Text>
          </View>
        </LinearGradient>

        {/* Search */}
        <View style={fb.searchWrap}>
          <Ionicons name="search-outline" size={15} color="#94A3B8" />
          <TextInput
            style={[fb.searchInput, { outlineWidth: 0 } as any]}
            placeholder="Search files..."
            placeholderTextColor="#94A3B8"
            value={fileQuery}
            onChangeText={setFileQuery}
          />
          {!!fileQuery && (
            <TouchableOpacity onPress={() => setFileQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={15} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Subfolder bar */}
        {renderSubfolderBar(true)}

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fb.filterBar} contentContainerStyle={fb.filterBarContent}>
          {([
            { key: 'all',      label: 'All',      color: '#E8B923' },
            { key: 'rejected', label: 'Rejected', color: '#EF4444' },
            { key: 'approved', label: 'Approved', color: '#10B981' },
          ] as const).map(tab => {
            const cnt = tab.key === 'all'
              ? files.length
              : files.filter(f => f.approval_status === tab.key).length;
            const active = fileFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[fb.filterChip, active && { backgroundColor: tab.color, borderColor: tab.color }]}
                onPress={() => setFileFilter(tab.key)}
                activeOpacity={0.75}
              >
                <Text style={[fb.filterChipText, active && { color: '#FFFFFF' }]}>{tab.label}</Text>
                {cnt > 0 && (
                  <View style={[fb.filterChipCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={[fb.filterChipCountText, active && { color: '#FFFFFF' }]}>{cnt}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* File list */}
        {filteredFiles.length === 0 ? (
          <View style={fb.emptyWrap}>
            <Ionicons name="documents-outline" size={48} color="rgba(232,185,35,0.25)" />
            <Text style={fb.emptyTitle}>{fileQuery ? `No results for "${fileQuery}"` : 'No files'}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredFiles}
            keyExtractor={f => f.id}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <DownloadSelectionBar
                selection={dl}
                items={filteredFiles}
                zipName={`${client?.name ?? 'Client'} — ${folder.label}`}
                label="files"
              />
            }
            renderItem={({ item }) => {
              const ext      = item.name.split('.').pop()?.toLowerCase() ?? 'file';
              const extUpper = ext.toUpperCase().slice(0, 4);
              const extColor = EXT_COLOR[ext] ?? '#94A3B8';
              const approval = item.approval_status ?? 'pending';
              const isRejected = approval === 'rejected';
              const isApproved = approval === 'approved';
              return (
                <TouchableOpacity
                  style={[
                    fb.fileListCard,
                    isRejected && fb.fileListCardRejected,
                    dl.selecting && dl.selected.has(item.id) && fb.fileListCardMarked,
                  ]}
                  onPress={() => dl.selecting
                    ? dl.toggle(item.id)
                    : setNav({ kind: 'detail', category: cat, folder, client, file: item })}
                  activeOpacity={0.88}
                >
                  {/* Icon — the checkbox takes its place while marking. */}
                  {dl.selecting ? (
                    <View style={fb.fileListIconSlot}>
                      <SelectCheckbox checked={dl.selected.has(item.id)} />
                    </View>
                  ) : (
                  <View style={[fb.fileListIcon, {
                    backgroundColor: isRejected ? '#FEE2E2' : isApproved ? '#D1FAE5' : '#FEF3C7',
                  }]}>
                    <Ionicons
                      name={isRejected ? 'close-circle' : isApproved ? 'checkmark-circle' : 'document-text'}
                      size={24}
                      color={isRejected ? '#EF4444' : isApproved ? '#10B981' : extColor}
                    />
                    <View style={[fb.fileListExtBadge, { backgroundColor: isRejected ? '#EF4444' : isApproved ? '#10B981' : extColor }]}>
                      <Text style={fb.fileListExtText}>{extUpper}</Text>
                    </View>
                  </View>
                  )}

                  {/* Info */}
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text style={fb.fileListName} numberOfLines={1}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="calendar-outline" size={10} color="#94A3B8" />
                      <Text style={fb.fileListDate}>{fmtDate(item.created_at)}</Text>
                    </View>
                    {isRejected && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="close-circle" size={11} color="#EF4444" />
                        <Text style={fb.fileListRejected}>Rejected</Text>
                      </View>
                    )}
                    {isRejected && !!item.approval_note && (
                      <Text style={fb.fileListNote} numberOfLines={1}>{item.approval_note}</Text>
                    )}
                    {isApproved && item.status === 'viewed' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={fb.viewedDot} />
                        <Text style={fb.viewedLabel}>Viewed</Text>
                      </View>
                    )}
                  </View>

                  {/* Right: viewed badge + arrow */}
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {isApproved && item.status === 'viewed' && (
                      <View style={fb.viewedBadge}>
                        <View style={fb.viewedDot} />
                        <Text style={fb.viewedLabel}>Viewed</Text>
                      </View>
                    )}
                    {(item.unreadCount ?? 0) > 0 && (
                      <View style={fb.replyDot}><Text style={fb.replyDotText}>{item.unreadCount}</Text></View>
                    )}
                    {/* Opening a file should not mean opening its detail page
                        first — view and download sit on the row itself. */}
                    {!dl.selecting && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={fb.rowActBtn}
                          onPress={() => setViewFile({ url: item.document_url, name: item.name })}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="eye-outline" size={15} color="#1C1713" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={fb.rowActBtn}
                          onPress={() => dl.downloadSingle(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="download-outline" size={15} color="#B5905B" />
                        </TouchableOpacity>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  };

  // ── File Detail view ────────────────────────────────────────────────────────

  const renderFileDetail = () => {
    if (nav.kind !== 'detail') return null;
    const { category: cat, folder, client, file } = nav;
    const approval  = file.approval_status ?? 'pending';
    const isRejected = approval === 'rejected';
    const isPending  = approval === 'pending';
    const isApproved = approval === 'approved';
    const isBusy     = actionBusy === file.id;
    const ext        = file.name.split('.').pop()?.toLowerCase() ?? 'file';
    const extColor   = EXT_COLOR[ext] ?? '#94A3B8';
    const hasNote    = !!file.approval_note;

    return (
      <ScrollView contentContainerStyle={fb.detailScroll} showsVerticalScrollIndicator={false}>

        {/* Hero area */}
        <LinearGradient colors={['#3A3131', '#2C2320', '#1C1713']} style={fb.detailHero} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
          <View style={fb.detailIconWrap}>
            <LinearGradient colors={['#4A3E3E', '#3A3131']} style={fb.detailIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="document-text" size={52} color={extColor} />
              <View style={[fb.detailExtBadge, { backgroundColor: extColor }]}>
                <Text style={fb.detailExtText}>{ext.toUpperCase().slice(0, 4)}</Text>
              </View>
            </LinearGradient>
          </View>
          <Text style={fb.detailFileName} numberOfLines={2}>{file.name}</Text>
          <View style={[fb.detailStatusBadge,
            isApproved && { backgroundColor: '#D1FAE5' },
            isPending  && { backgroundColor: '#FEF3C7' },
            isRejected && { backgroundColor: '#FEE2E2' },
          ]}>
            <View style={[fb.viewedDot, {
              backgroundColor: isApproved ? '#10B981' : isPending ? '#F59E0B' : '#EF4444',
            }]} />
            <Text style={[fb.detailStatusText,
              isApproved && { color: '#065F46' },
              isPending  && { color: '#92400E' },
              isRejected && { color: '#991B1B' },
            ]}>
              {isApproved ? 'Approved' : isPending ? 'Pending' : 'Rejected'}
            </Text>
          </View>
        </LinearGradient>

        {/* File details card */}
        <View style={fb.detailSection}>
          <Text style={fb.detailSectionLabel}>FILE DETAILS</Text>
          <View style={fb.detailCard}>
            {[
              { icon: 'calendar-outline', label: 'Date Uploaded', value: fmtDate(file.created_at) },
              { icon: 'folder-outline',   label: 'Folder',        value: folder.label },
              { icon: 'layers-outline',   label: 'Category',      value: cat.title },
              { icon: 'mail-outline',     label: 'Email',         value: file.email },
              { icon: 'eye-outline',      label: 'Status',        value: file.status === 'new' ? 'New' : 'Viewed' },
            ].map((row, i, arr) => (
              <View key={row.label} style={[fb.detailRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={fb.detailRowIcon}>
                  <Ionicons name={row.icon as any} size={14} color="#E8B923" />
                </View>
                <Text style={fb.detailRowLabel}>{row.label}</Text>
                <Text style={fb.detailRowValue} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Subfolder */}
        <View style={fb.detailSection}>
          <Text style={fb.detailSectionLabel}>SUBFOLDER</Text>
          <View style={fb.detailCard}>
            <View style={[fb.detailRow, { borderBottomWidth: 0 }]}>
              <View style={fb.detailRowIcon}>
                <Ionicons name="folder-open-outline" size={14} color="#E8B923" />
              </View>
              <Text style={fb.detailRowLabel}>Filed in</Text>
              <Text style={fb.detailRowValue} numberOfLines={1}>
                {subfolders.find(s => s.id === file.subfolder_id)?.name ?? 'Not filed'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[fb.replyBtn, { marginTop: 8, backgroundColor: '#E8B923' }]}
            onPress={() => setMoveTarget({ file, folderTable: folder.table })}
            activeOpacity={0.82}
          >
            <Ionicons name="swap-horizontal-outline" size={15} color="#1C1713" />
            <Text style={fb.replyBtnText}>Move to Subfolder</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[fb.replyBtn, { marginTop: 8 }]}
            onPress={() => { setFolderMoveError(null); setFolderMove({ file, from: folder.table, email: client.email }); }}
            activeOpacity={0.82}
          >
            <Ionicons name="folder-outline" size={15} color="#1C1713" />
            <Text style={fb.replyBtnText}>Move to Another Folder</Text>
          </TouchableOpacity>
        </View>

        {/* Conversation reply preview */}
        {(file.convCount ?? 0) > 0 && file.latestReply && (
          <View style={fb.detailSection}>
            <Text style={fb.detailSectionLabel}>REPLIES ({file.convCount})</Text>
            <View style={[fb.replyBubble, file.latestReply.sender_role === 'client' && fb.replyBubbleClient]}>
              <Text style={[fb.replyName, file.latestReply.sender_role === 'client' && { color: '#B5905B' }]}>
                {file.latestReply.sender_role === 'client' ? file.latestReply.sender_name : 'Admin / Staff'}
              </Text>
              <Text style={fb.replyMsg} numberOfLines={3}>{file.latestReply.message}</Text>
              <Text style={fb.replyTime}>{fmtRelTime(file.latestReply.created_at)}</Text>
            </View>
            <TouchableOpacity style={[fb.replyBtn, { marginTop: 6 }]} onPress={() => setConvOpen(true)} activeOpacity={0.82}>
              <Ionicons name="chatbubbles-outline" size={15} color="#1C1713" />
              <Text style={fb.replyBtnText}>View All Replies</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* View / Download */}
        <View style={[fb.detailSection, { paddingBottom: 32, flexDirection: 'row', gap: 10 }]}>
          <TouchableOpacity style={[fb.viewDocBtn, { flex: 2 }]} onPress={() => setViewFile({ url: file.document_url, name: file.name })} activeOpacity={0.82}>
            <Ionicons name="eye-outline" size={18} color="#1C1713" />
            <Text style={fb.viewDocBtnText}>View Document</Text>
          </TouchableOpacity>
          <TouchableOpacity style={fb.dlDocBtn} onPress={() => dl.downloadSingle(file)} activeOpacity={0.82}>
            <Ionicons name="download-outline" size={18} color="#B5905B" />
            <Text style={fb.dlDocBtnText}>Download</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ── Detail header (right side buttons for detail level) ─────────────────────

  const renderDetailHeaderRight = () => {
    if (nav.kind !== 'detail') return null;
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity style={fb.headerIconBtn} onPress={() => setViewFile({ url: nav.file.document_url, name: nav.file.name })} activeOpacity={0.75}>
          <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        {/*
          Beside delete, because that is where someone looks for what to do with
          a file. The same action further down the page went unfound — Belly Jane
          reported the move as missing while it was sitting below the fold.
        */}
        <TouchableOpacity
          style={[fb.headerIconBtn, { backgroundColor: 'rgba(232,185,35,0.18)' }]}
          activeOpacity={0.75}
          onPress={() => {
            setFolderMoveError(null);
            setFolderMove({ file: nav.file, from: nav.folder.table, email: nav.client.email });
          }}
        >
          <Ionicons name="folder-outline" size={16} color="#E8B923" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[fb.headerIconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]}
          activeOpacity={0.75}
          onPress={() => { setDeleteError(null); setDeleteTarget({ file: nav.file, folderTable: nav.folder.table }); }}
        >
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={goBack}>
      <View style={[fb.root, { paddingTop: Platform.OS === 'web' ? 0 : insets.top }]}>

        {/* ── Header ── */}
        <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fb.header}>
          <TouchableOpacity style={fb.backBtn} onPress={goBack} activeOpacity={0.75}>
            <Ionicons name={nav.kind === 'categories' ? 'close' : 'arrow-back'} size={18} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            {headerTag && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={fb.headerTag}><Text style={fb.headerTagText}>{headerTag}</Text></View>
                {nav.kind === 'detail' && <Text style={fb.headerFolderLabel}>{nav.folder.label}</Text>}
              </View>
            )}
            <Text style={fb.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          </View>
          {renderDetailHeaderRight()}
        </LinearGradient>

        {/* ── Breadcrumb ── */}
        {nav.kind !== 'categories' && (
          <View style={fb.breadcrumb}>
            <TouchableOpacity onPress={() => setNav({ kind: 'categories' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={fb.breadcrumbLink}>Categories</Text>
            </TouchableOpacity>
            {(nav.kind === 'clients' || nav.kind === 'files' || nav.kind === 'detail') && (
              <><Ionicons name="chevron-forward" size={10} color="#94A3B8" />
              <TouchableOpacity onPress={() => setNav({ kind: 'folders', category: (nav as any).category })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={fb.breadcrumbLink}>{(nav as any).category.abbr}</Text>
              </TouchableOpacity></>
            )}
            {(nav.kind === 'files' || nav.kind === 'detail') && (
              <><Ionicons name="chevron-forward" size={10} color="#94A3B8" />
              <TouchableOpacity onPress={() => setNav({ kind: 'clients', category: (nav as any).category, folder: (nav as any).folder })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={fb.breadcrumbLink}>{(nav as any).folder.label}</Text>
              </TouchableOpacity></>
            )}
            {nav.kind === 'detail' && (
              <><Ionicons name="chevron-forward" size={10} color="#94A3B8" />
              <TouchableOpacity onPress={() => setNav({ kind: 'files', category: nav.category, folder: nav.folder, client: nav.client })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={fb.breadcrumbLink}>{nav.client.name}</Text>
              </TouchableOpacity></>
            )}
            <Ionicons name="chevron-forward" size={10} color="#94A3B8" />
            <Text style={fb.breadcrumbCurrent} numberOfLines={1}>
              {nav.kind === 'folders' ? (nav as any).category.title
               : nav.kind === 'clients' ? (nav as any).folder.label
               : nav.kind === 'files'   ? (nav as any).client.name
               : (nav as any).file.name}
            </Text>
          </View>
        )}

        {/* ── Body ── */}
        {loading ? (
          <View style={fb.loader}><ActivityIndicator color="#E8B923" size="large" /></View>
        ) : (
          <>
            {nav.kind === 'categories' && renderCategories()}
            {nav.kind === 'folders'    && renderFolders()}
            {nav.kind === 'clients'    && renderClients()}
            {nav.kind === 'files'      && renderFiles()}
            {nav.kind === 'detail'     && renderFileDetail()}
          </>
        )}

        <DownloadNotice message={dl.notice} />
      </View>

      {/* ── Reject modal ── */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <Pressable style={fb.modalOverlay} onPress={() => setRejectTarget(null)}>
          <Pressable style={fb.rejectModal} onPress={() => {}}>
            <View style={fb.rejectIconWrap}><Ionicons name="close-circle-outline" size={30} color="#EF4444" /></View>
            <Text style={fb.rejectModalTitle}>Decline Document?</Text>
            <Text style={fb.rejectModalSub} numberOfLines={2}>{rejectTarget?.name}</Text>
            <TextInput style={fb.rejectInput} placeholder="Reason for declining (optional)" placeholderTextColor="#94A3B8" value={rejectNote} onChangeText={setRejectNote} multiline numberOfLines={3} textAlignVertical="top" />
            <View style={fb.rejectModalBtns}>
              <TouchableOpacity style={fb.rejectCancelBtn} onPress={() => setRejectTarget(null)}><Text style={fb.rejectCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[fb.rejectConfirmBtn, actionBusy && { opacity: 0.5 }]} onPress={() => handleReject(rejectNote.trim())} disabled={!!actionBusy}>
                {actionBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={fb.rejectConfirmText}>Decline</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Delete confirm modal ── */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={fb.modalOverlay} onPress={() => setDeleteTarget(null)}>
          <Pressable style={fb.rejectModal} onPress={() => {}}>
            <View style={fb.rejectIconWrap}><Ionicons name="trash-outline" size={28} color="#EF4444" /></View>
            <Text style={fb.rejectModalTitle}>Delete File?</Text>
            <Text style={fb.rejectModalSub} numberOfLines={2}>{deleteTarget?.file.name}</Text>
            <Text style={[fb.rejectModalSub, { marginTop: 2, fontSize: 12 }]}>This permanently removes the file. This cannot be undone.</Text>
            {deleteError && (
              <View style={fb.moveError}>
                <Ionicons name="alert-circle-outline" size={15} color="#B3261E" />
                <Text style={fb.moveErrorText}>{deleteError}</Text>
              </View>
            )}
            <View style={fb.rejectModalBtns}>
              <TouchableOpacity style={fb.rejectCancelBtn} onPress={() => setDeleteTarget(null)}><Text style={fb.rejectCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[fb.rejectConfirmBtn, deleteBusy && { opacity: 0.5 }]} onPress={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={fb.rejectConfirmText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Rename subfolder ── */}
      <Modal visible={!!renSubTarget} transparent animationType="fade" onRequestClose={() => setRenSubTarget(null)}>
        <Pressable style={fb.modalOverlay} onPress={() => setRenSubTarget(null)}>
          <Pressable style={fb.rejectModal} onPress={() => {}}>
            <View style={[fb.rejectIconWrap, { backgroundColor: 'rgba(232,185,35,0.15)' }]}>
              <Ionicons name="pencil-outline" size={26} color="#E8B923" />
            </View>
            <Text style={fb.rejectModalTitle}>Rename Folder</Text>
            <Text style={fb.rejectModalSub} numberOfLines={2}>
              The files inside stay where they are.
            </Text>
            <TextInput
              style={fb.rejectInput}
              placeholder="Folder name"
              placeholderTextColor="#94A3B8"
              value={renSubName}
              onChangeText={t => { setRenSubName(t); setRenSubError(null); }}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleRenameSubfolder}
            />
            {renSubError ? (
              <Text style={[fb.rejectModalSub, { color: '#EF4444', marginTop: 2, fontSize: 12 }]}>{renSubError}</Text>
            ) : null}
            <View style={fb.rejectModalBtns}>
              <TouchableOpacity style={fb.rejectCancelBtn} onPress={() => setRenSubTarget(null)}>
                <Text style={fb.rejectCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[fb.rejectConfirmBtn, { backgroundColor: '#E8B923' },
                  (subBusy || !renSubName.trim()) && { opacity: 0.5 }]}
                onPress={handleRenameSubfolder}
                disabled={subBusy || !renSubName.trim()}
              >
                {subBusy
                  ? <ActivityIndicator size="small" color="#1C1713" />
                  : <Text style={[fb.rejectConfirmText, { color: '#1C1713' }]}>Rename</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── New subfolder modal ── */}
      <Modal visible={newSubOpen} transparent animationType="fade" onRequestClose={() => setNewSubOpen(false)}>
        <Pressable style={fb.modalOverlay} onPress={() => setNewSubOpen(false)}>
          <Pressable style={fb.rejectModal} onPress={() => {}}>
            <View style={[fb.rejectIconWrap, { backgroundColor: 'rgba(232,185,35,0.15)' }]}><Ionicons name="folder-outline" size={26} color="#E8B923" /></View>
            <Text style={fb.rejectModalTitle}>New Subfolder</Text>
            <Text style={fb.rejectModalSub} numberOfLines={2}>Inside {(nav as any).folder?.label ?? 'this folder'}</Text>
            <TextInput style={fb.rejectInput} placeholder="Subfolder name" placeholderTextColor="#94A3B8" value={newSubName} onChangeText={t => { setNewSubName(t); setNewSubError(null); }} autoFocus onSubmitEditing={handleCreateSubfolder} />
            {newSubError ? (
              <Text style={[fb.rejectModalSub, { color: '#EF4444', marginTop: 2, fontSize: 12 }]}>{newSubError}</Text>
            ) : null}
            <View style={fb.rejectModalBtns}>
              <TouchableOpacity style={fb.rejectCancelBtn} onPress={() => setNewSubOpen(false)}><Text style={fb.rejectCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[fb.rejectConfirmBtn, { backgroundColor: '#E8B923' }, (subBusy || !newSubName.trim()) && { opacity: 0.5 }]} onPress={handleCreateSubfolder} disabled={subBusy || !newSubName.trim()}>
                {subBusy ? <ActivityIndicator size="small" color="#1C1713" /> : <Text style={[fb.rejectConfirmText, { color: '#1C1713' }]}>Create</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Delete subfolder confirm ── */}
      <Modal visible={!!delSubTarget} transparent animationType="fade" onRequestClose={() => setDelSubTarget(null)}>
        <Pressable style={fb.modalOverlay} onPress={() => setDelSubTarget(null)}>
          <Pressable style={fb.rejectModal} onPress={() => {}}>
            <View style={fb.rejectIconWrap}><Ionicons name="trash-outline" size={26} color="#EF4444" /></View>
            <Text style={fb.rejectModalTitle}>Delete Subfolder?</Text>
            <Text style={fb.rejectModalSub} numberOfLines={2}>{delSubTarget?.name}</Text>
            <Text style={[fb.rejectModalSub, { marginTop: 2, fontSize: 12 }]}>Files inside stay — they just become unfiled.</Text>
            <View style={fb.rejectModalBtns}>
              <TouchableOpacity style={fb.rejectCancelBtn} onPress={() => setDelSubTarget(null)}><Text style={fb.rejectCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[fb.rejectConfirmBtn, subBusy && { opacity: 0.5 }]} onPress={handleDeleteSubfolder} disabled={subBusy}>
                {subBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={fb.rejectConfirmText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Move a whole subfolder to another folder ── */}
      <Modal visible={!!subMove} transparent animationType="fade" onRequestClose={() => setSubMove(null)}>
        <Pressable style={fb.modalOverlay} onPress={() => !subMoveBusy && setSubMove(null)}>
          <Pressable style={fb.rejectModal} onPress={() => {}}>
            <View style={[fb.rejectIconWrap, { backgroundColor: 'rgba(232,185,35,0.15)' }]}>
              <Ionicons name="swap-horizontal" size={26} color="#E8B923" />
            </View>
            <Text style={fb.rejectModalTitle}>Move Subfolder</Text>
            <Text style={fb.rejectModalSub} numberOfLines={2}>{subMove?.name}</Text>
            <Text style={[fb.rejectModalSub, { marginTop: 2, fontSize: 12 }]}>
              Everything inside comes with it — the files, and any subfolders
              nested in it. It arrives at the top of the folder you pick.
            </Text>

            {subMoveError && (
              <View style={fb.moveError}>
                <Ionicons name="alert-circle-outline" size={15} color="#B3261E" />
                <Text style={fb.moveErrorText}>{subMoveError}</Text>
              </View>
            )}

            <ScrollView style={{ maxHeight: 280, alignSelf: 'stretch', marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {moveDestinations(subMove?.parent_table ?? '', folderMoveServices).map(group => (
                <View key={group.title}>
                  <Text style={fb.moveGroupTitle}>{group.title.toUpperCase()}</Text>
                  {group.folders.map(f => (
                    <TouchableOpacity
                      key={f.key}
                      style={fb.moveRow}
                      onPress={() => handleMoveSubfolder(f.key)}
                      disabled={subMoveBusy}
                    >
                      <Ionicons name="folder-outline" size={15} color="#B5905B" />
                      <Text style={fb.moveRowText} numberOfLines={1}>{f.label}</Text>
                      {subMoveBusy
                        ? <ActivityIndicator size="small" color="#B5905B" />
                        : <Ionicons name="arrow-forward" size={15} color="#94A3B8" />}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[fb.replyBtn, { marginTop: 10, backgroundColor: '#F1F5F9' }]}
              onPress={() => setSubMove(null)}
              disabled={subMoveBusy}
            >
              <Text style={[fb.replyBtnText, { color: '#475569' }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Move to another folder ── */}
      <Modal visible={!!folderMove} transparent animationType="fade" onRequestClose={() => setFolderMove(null)}>
        <Pressable style={fb.modalOverlay} onPress={() => !folderMoveBusy && setFolderMove(null)}>
          <Pressable style={fb.rejectModal} onPress={() => {}}>
            <View style={[fb.rejectIconWrap, { backgroundColor: 'rgba(232,185,35,0.15)' }]}>
              <Ionicons name="folder-outline" size={26} color="#E8B923" />
            </View>
            <Text style={fb.rejectModalTitle}>Move to Another Folder</Text>
            <Text style={fb.rejectModalSub} numberOfLines={2}>{folderMove?.file.name}</Text>
            <Text style={[fb.rejectModalSub, { marginTop: 2, fontSize: 12 }]}>
              Currently in {folderLabel(folderMove?.from ?? '')}. The file keeps its
              replies and its approval; it lands at the top of the folder you pick.
            </Text>

            {folderMoveError && (
              <View style={fb.moveError}>
                <Ionicons name="alert-circle-outline" size={15} color="#B3261E" />
                <Text style={fb.moveErrorText}>{folderMoveError}</Text>
              </View>
            )}

            <ScrollView style={{ maxHeight: 300, alignSelf: 'stretch', marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {moveDestinations(folderMove?.from ?? '', folderMoveServices).map(group => (
                <View key={group.title}>
                  <Text style={fb.moveGroupTitle}>{group.title.toUpperCase()}</Text>
                  {group.folders.map(f => (
                    <TouchableOpacity
                      key={f.key}
                      style={fb.moveRow}
                      onPress={() => handleMoveToFolder(f.key)}
                      disabled={folderMoveBusy}
                    >
                      <Ionicons name="folder-outline" size={15} color="#B5905B" />
                      <Text style={fb.moveRowText} numberOfLines={1}>{f.label}</Text>
                      {folderMoveBusy
                        ? <ActivityIndicator size="small" color="#B5905B" />
                        : <Ionicons name="arrow-forward" size={15} color="#94A3B8" />}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[fb.replyBtn, { marginTop: 10, backgroundColor: '#F1F5F9' }]}
              onPress={() => setFolderMove(null)}
              disabled={folderMoveBusy}
            >
              <Text style={[fb.replyBtnText, { color: '#475569' }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Move to subfolder picker ── */}
      <Modal visible={!!moveTarget} transparent animationType="fade" onRequestClose={() => setMoveTarget(null)}>
        <Pressable style={fb.modalOverlay} onPress={() => setMoveTarget(null)}>
          <Pressable style={fb.rejectModal} onPress={() => {}}>
            <View style={[fb.rejectIconWrap, { backgroundColor: 'rgba(232,185,35,0.15)' }]}><Ionicons name="swap-horizontal-outline" size={26} color="#E8B923" /></View>
            <Text style={fb.rejectModalTitle}>Move to Subfolder</Text>
            <Text style={fb.rejectModalSub} numberOfLines={2}>{moveTarget?.file.name}</Text>
            <ScrollView style={{ maxHeight: 260, alignSelf: 'stretch', marginTop: 10 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={[fb.moveRow, !moveTarget?.file.subfolder_id && fb.moveRowActive]} onPress={() => handleMoveToSubfolder(null)} disabled={subBusy}>
                <Ionicons name="file-tray-outline" size={16} color="#B5905B" />
                <Text style={fb.moveRowText}>Unfiled (no subfolder)</Text>
                {!moveTarget?.file.subfolder_id && <Ionicons name="checkmark" size={16} color="#10B981" />}
              </TouchableOpacity>
              {subfolders.map(sf => {
                const active = moveTarget?.file.subfolder_id === sf.id;
                return (
                  <TouchableOpacity key={sf.id} style={[fb.moveRow, active && fb.moveRowActive]} onPress={() => handleMoveToSubfolder(sf.id)} disabled={subBusy}>
                    <Ionicons name="folder" size={16} color="#B5905B" />
                    <Text style={fb.moveRowText} numberOfLines={1}>{sf.name}</Text>
                    {active && <Ionicons name="checkmark" size={16} color="#10B981" />}
                  </TouchableOpacity>
                );
              })}
              {subfolders.length === 0 && (
                <Text style={[fb.rejectModalSub, { textAlign: 'center', paddingVertical: 12 }]}>No subfolders yet. Create one from the file list.</Text>
              )}
            </ScrollView>
            <View style={[fb.rejectModalBtns, { marginTop: 8 }]}>
              <TouchableOpacity style={fb.rejectCancelBtn} onPress={() => setMoveTarget(null)}><Text style={fb.rejectCancelText}>Close</Text></TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Document viewer ── */}
      {viewFile && (
        <Modal visible animationType="slide" onRequestClose={() => setViewFile(null)}>
          <View style={[fb.viewerRoot, { paddingTop: Platform.OS === 'web' ? 0 : insets.top }]}>
            <View style={fb.viewerBar}>
              <TouchableOpacity style={fb.viewerClose} onPress={() => setViewFile(null)}>
                <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={fb.viewerName} numberOfLines={1}>{viewFile.name}</Text>
            </View>
            {Platform.OS === 'web'
              ? React.createElement('iframe', { src: viewFile.url, style: { flex: 1, width: '100%', height: '100%', border: 'none' } })
              : <WebView source={{ uri: viewFile.url }} style={{ flex: 1 }} />
            }
          </View>
        </Modal>
      )}

      {/* ── File Conversation Panel ── */}
      {nav.kind === 'detail' && (
        <FileConversationPanel
          visible={convOpen}
          doc={(() => {
            const { folder, client, file } = nav;
            return {
              id: file.id, user_id: client.user_id, name: file.name, file_name: file.name,
              document_url: file.document_url, document_type: folder.table,
              email: file.email, status: file.status as any,
              approval_status: file.approval_status as any, approval_note: file.approval_note,
              approved_by: null, approved_at: null, created_at: file.created_at,
            } as Document;
          })()}
          fileOwnerId={nav.client.user_id ?? ''}
          onClose={() => setConvOpen(false)}
        />
      )}
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const fb = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#F8FAFC' },
  loader:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent:{ padding: 16, gap: 0 },
  sectionLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8, marginLeft: 4 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTag: { backgroundColor: 'rgba(232,185,35,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  headerTagText: { color: '#E8B923', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  headerFolderLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.2, marginTop: 2 },
  headerIconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

  // Subfolder bar
  subBar:        { flexGrow: 0, backgroundColor: '#FFFFFF' },
  subBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
  subChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F8F4EC', borderWidth: 1, borderColor: '#EADFC8' },
  subChipActive: { backgroundColor: '#E8B923', borderColor: '#E8B923' },
  subChipText:   { color: '#8B6914', fontSize: 12, fontWeight: '700' },
  subChipTextActive: { color: '#1C1713' },
  subChipCount:  { color: '#B5905B', fontSize: 11, fontWeight: '800', marginLeft: 2 },
  subNewChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(232,185,35,0.12)', borderWidth: 1, borderColor: 'rgba(232,185,35,0.4)', borderStyle: 'dashed' },
  subNewText:    { color: '#B5905B', fontSize: 12, fontWeight: '800' },

  // Move-to-subfolder rows
  moveRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F8FAFC', marginBottom: 6 },
  moveRowActive: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  moveRowText:   { flex: 1, color: '#374151', fontSize: 13, fontWeight: '600' },
  subActions: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 14, marginBottom: 8,
    borderRadius: 12, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
  },
  subActionsName: { color: '#78350F', fontSize: 12.5, fontWeight: '800', marginRight: 4 },
  subActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
  },
  subActionMove: { backgroundColor: '#E8B923', borderColor: '#E8B923' },
  subActionText: { color: '#475569', fontSize: 11.5, fontWeight: '700' },
  moveGroupTitle: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 10, marginBottom: 6 },
  moveError:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  moveErrorText: { flex: 1, color: '#B3261E', fontSize: 12, lineHeight: 17 },

  // Breadcrumb
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  breadcrumbLink:    { color: '#E8B923', fontSize: 11, fontWeight: '600' },
  breadcrumbCurrent: { color: '#374151', fontSize: 11, fontWeight: '700', flex: 1 },

  // Category cards
  catCard:      { marginBottom: 14, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  catCardInner: { padding: 20, gap: 12 },
  catTopRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catAbbr:      { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  catAbbrText:  { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  catNewBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catNewText:   { color: '#1C1713', fontSize: 11, fontWeight: '800' },
  catArrow:     { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  catTitle:     { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  catDivider:   { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  catChips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  catChipText:  { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '500' },
  catFooter:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  catFooterText:{ color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  catFooterDot: { color: 'rgba(255,255,255,0.2)', fontSize: 11 },

  // Folder rows
  folderRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  folderIcon:   { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  folderInfo:   { flex: 1, gap: 3 },
  folderLabel:  { color: '#111827', fontSize: 15, fontWeight: '700' },
  folderSub:    { color: '#6B7280', fontSize: 12 },
  folderBar:    { height: 3, borderRadius: 2, backgroundColor: '#F1F5F9', marginTop: 4, overflow: 'hidden' },
  folderBarFill:{ height: 3, borderRadius: 2 },

  // Client rows
  clientRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  clientAvatar:     { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clientAvatarText: { color: '#1C1713', fontSize: 16, fontWeight: '900' },
  clientInfo:       { flex: 1, gap: 2, minWidth: 0 },
  clientName:       { color: '#111827', fontSize: 14, fontWeight: '700' },
  clientEmail:      { color: '#6B7280', fontSize: 11 },
  clientDocCount:   { color: '#94A3B8', fontSize: 11, marginTop: 1 },

  // Unread badge (shared)
  unreadBadge:     { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, flexShrink: 0 },
  unreadBadgeText: { color: '#1C1713', fontSize: 11, fontWeight: '800' },

  // File list sub-header
  fileSubHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  fileSubIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileSubTitle:  { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  fileSubSub:    { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 },

  // Search
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  searchInput: { flex: 1, color: '#111827', fontSize: 13 },

  // Filter tabs
  filterBar:        { maxHeight: 44 },
  filterBarContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  filterChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  filterChipText:   { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  filterChipCount:  { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  filterChipCountText: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  filterResultCount:   { color: '#94A3B8', fontSize: 11, marginLeft: 4 },

  // File list cards (new design matching screenshot)
  fileListCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  rowActBtn: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(232,185,35,0.14)',
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.32)',
  },
  fileListCardMarked: { backgroundColor: 'rgba(232,185,35,0.10)', borderColor: 'rgba(232,185,35,0.55)' },
  fileListIconSlot: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  dlDocBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(232,185,35,0.14)',
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.45)',
  },
  dlDocBtnText: { color: '#B5905B', fontSize: 14, fontWeight: '800' },
  fileListCardRejected: { backgroundColor: '#FFF5F5', borderColor: '#FECACA', borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  fileListIcon:   { width: 52, height: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  fileListExtBadge: { position: 'absolute', bottom: 2, right: 2, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  fileListExtText:  { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  fileListName:   { color: '#111827', fontSize: 13, fontWeight: '700' },
  fileListDate:   { color: '#94A3B8', fontSize: 11 },
  fileListRejected: { color: '#EF4444', fontSize: 11, fontWeight: '600' },
  fileListNote:   { color: '#EF4444', fontSize: 11 },
  viewedBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewedDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  viewedLabel:    { color: '#10B981', fontSize: 11, fontWeight: '600' },
  replyDot:       { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  replyDotText:   { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },

  // File detail
  detailScroll:    { paddingBottom: 40 },
  detailHero:      { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 12 },
  detailIconWrap:  {},
  detailIcon:      { width: 110, height: 110, borderRadius: 28, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  detailExtBadge:  { position: 'absolute', bottom: 6, right: 6, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  detailExtText:   { color: '#1C1713', fontSize: 9, fontWeight: '900' },
  detailFileName:  { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  detailStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  detailStatusText:  { fontSize: 12, fontWeight: '700' },

  detailSection:   { paddingHorizontal: 16, paddingTop: 16 },
  detailSectionLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  detailCard:      { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' },
  detailRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 12 },
  detailRowIcon:   { width: 28, height: 28, borderRadius: 8, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  detailRowLabel:  { color: '#6B7280', fontSize: 13, width: 110, flexShrink: 0 },
  detailRowValue:  { color: '#111827', fontSize: 13, fontWeight: '600', flex: 1 },

  // Feedback card
  feedbackCard:     { borderRadius: 14, padding: 14, borderWidth: 1, gap: 8 },
  feedbackRejected: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  feedbackPending:  { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  feedbackStatus:   { fontSize: 13, fontWeight: '800' },
  feedbackNote:     { fontSize: 13, lineHeight: 18 },
  replyBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 13, marginTop: 4 },
  replyBtnText:     { color: '#1C1713', fontSize: 14, fontWeight: '700' },

  // Detail action buttons
  detailApproveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 14 },
  detailDeclineBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 14 },
  detailActionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Reply preview
  replyBubble:       { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', gap: 4 },
  replyBubbleClient: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  replyName:         { fontSize: 11, fontWeight: '800', color: '#6B7280' },
  replyMsg:          { fontSize: 13, color: '#374151', lineHeight: 18 },
  replyTime:         { fontSize: 10, color: '#94A3B8', alignSelf: 'flex-end' },

  // View document button
  viewDocBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8B923', borderRadius: 16, paddingVertical: 16 },
  viewDocBtnText: { color: '#1C1713', fontSize: 15, fontWeight: '800' },

  // Modals
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  rejectModal:      { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, width: 320, alignItems: 'center', gap: 10 },
  rejectIconWrap:   { width: 60, height: 60, borderRadius: 18, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  rejectModalTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  rejectModalSub:   { color: '#6B7280', fontSize: 12, textAlign: 'center' },
  rejectInput:      { width: '100%', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, color: '#111827', fontSize: 13, minHeight: 72, marginTop: 4 },
  rejectModalBtns:  { flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 },
  rejectCancelBtn:  { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  rejectCancelText: { color: '#64748B', fontWeight: '700', fontSize: 14 },
  rejectConfirmBtn: { flex: 1, backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  rejectConfirmText:{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // Viewer
  viewerRoot: { flex: 1, backgroundColor: '#1C1713' },
  viewerBar:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#3A3131', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  viewerClose:{ width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  viewerName: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Empty
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 10 },
  emptyTitle: { color: '#374151', fontSize: 17, fontWeight: '700' },
  emptySub:   { color: '#94A3B8', fontSize: 13, textAlign: 'center', paddingHorizontal: 30, lineHeight: 19 },
});
