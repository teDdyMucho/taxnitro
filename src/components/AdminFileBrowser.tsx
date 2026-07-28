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
import { approveDocument, rejectDocument } from '../db/documents';
import type { Document } from '../db/documents';
import { useAuth } from '../context/AuthContext';
import { FileConversationPanel } from './FileConversationPanel';

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
      { table: 'bk_final_pnl',         label: 'Additional BK Docs',  icon: 'folder-outline'        as const },
      { table: 'bk_mr_required_info',  label: 'Monthly Reporting (Required Info)',     icon: 'cloud-upload-outline' as const },
      { table: 'bk_mr_client_review',  label: 'Monthly Reporting (For Client Review)', icon: 'eye-outline'          as const },
      { table: 'bk_mr_final_statements', label: 'Monthly Reporting (Final Statements)', icon: 'ribbon-outline'      as const },
      { table: 'bk_for_client_review', label: 'For Client Review',   icon: 'eye-outline'           as const },
      { table: 'bk_bank_statements',        label: 'Bank Statements',        icon: 'cloud-upload-outline' as const },
      { table: 'bk_credit_card_statements', label: 'Credit Card Statements', icon: 'cloud-upload-outline' as const },
      { table: 'bk_loan_statements',        label: 'Loan Statements',        icon: 'cloud-upload-outline' as const },
      { table: 'bk_payroll_reports',        label: 'Payroll Reports',        icon: 'cloud-upload-outline' as const },
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
    setLoading(true);
    const base = supabase.from(folder.table).select('id, name, status, approval_status, approval_note, document_url, created_at, email').order('created_at', { ascending: false });
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

  // ── File filter helper ──────────────────────────────────────────────────────

  const filteredFiles = files.filter(f => {
    if (fileFilter === 'new'      && f.status !== 'new')                   return false;
    if (fileFilter === 'viewed'   && f.status !== 'viewed')                return false;
    if (fileFilter === 'rejected' && f.approval_status !== 'rejected')     return false;
    if (fileFilter === 'approved' && f.approval_status !== 'approved')     return false;
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
            <TouchableOpacity key={f.table} style={[fb.folderRow, idx === cat.folders.length - 1 && { borderBottomWidth: 0 }]} onPress={() => !isEmpty && openFolder(cat, f)} activeOpacity={isEmpty ? 1 : 0.82}>
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
    if (clients.length === 0) return (
      <View style={fb.emptyWrap}><Ionicons name="people-outline" size={52} color="rgba(232,185,35,0.25)" /><Text style={fb.emptyTitle}>No clients yet</Text><Text style={fb.emptySub}>No files have been uploaded to this folder.</Text></View>
    );
    return (
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
            renderItem={({ item }) => {
              const ext      = item.name.split('.').pop()?.toLowerCase() ?? 'file';
              const extUpper = ext.toUpperCase().slice(0, 4);
              const extColor = EXT_COLOR[ext] ?? '#94A3B8';
              const approval = item.approval_status ?? 'pending';
              const isRejected = approval === 'rejected';
              const isApproved = approval === 'approved';
              return (
                <TouchableOpacity
                  style={[fb.fileListCard, isRejected && fb.fileListCardRejected]}
                  onPress={() => setNav({ kind: 'detail', category: cat, folder, client, file: item })}
                  activeOpacity={0.88}
                >
                  {/* Icon */}
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

        {/* View Document */}
        <View style={[fb.detailSection, { paddingBottom: 32 }]}>
          <TouchableOpacity style={fb.viewDocBtn} onPress={() => setViewFile({ url: file.document_url, name: file.name })} activeOpacity={0.82}>
            <Ionicons name="eye-outline" size={18} color="#1C1713" />
            <Text style={fb.viewDocBtnText}>View Document</Text>
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
        <TouchableOpacity style={[fb.headerIconBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} activeOpacity={0.75}>
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
