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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import WebView from 'react-native-webview';
import { Colors } from '../../constants/colors';
import { StatusBadge } from '../../components/StatusBadge';
import { FileConversationPanel } from '../../components/FileConversationPanel';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import {
  getDocumentsByEmail,
  updateDocumentStatus,
  uploadDocumentToStorage,
  createDocumentRecord,
  deleteDocument,
  renameDocument,
  approveDocument,
  rejectDocument,
  Document,
  FOLDER_TABLES,
} from '../../db/documents';
import {
  isRequirementFolder,
  itemsForFolderAndClient,
  createPendingRequirement,
  clearPendingRequirementForDocument,
  monthOf,
  RequiredItem,
  RequirementService,
} from '../../db/requirements';

const WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/fileupload-mobileapp-ghl-ftg';
import { supabase } from '../../lib/supabase';

const { width: SW } = Dimensions.get('window');

// ── Folder structure ──────────────────────────────────────────────────────────

interface SubFolder {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  // If present, this is a GROUP folder — tapping it opens a nested list of these
  // children instead of a document list (3rd navigation level).
  children?: SubFolder[];
}

interface RootFolder {
  key: string;
  label: string;
  description: string;
  service: 'BK' | 'TAX' | 'CFO';   // which client service this category belongs to
  color: string;
  darkColor: string;
  gradient: [string, string, string];
  subFolders: SubFolder[];
}

const FOLDERS: RootFolder[] = [
  {
    key: 'TAX',
    label: 'TAX',
    description: 'Tax Documents & Returns',
    service: 'TAX',
    color: '#00B16A',
    darkColor: '#008C5A',
    gradient: ['#2C2320', '#3A3131', '#4A3E3E'],
    subFolders: [
      { key: 'tax_contracts',          label: 'Tax Contracts',      icon: 'document-text-outline',      color: '#E8B923', bg: 'rgba(232,185,35,0.15)' },
      { key: 'tax_invoices',           label: 'Tax Invoices',       icon: 'receipt-outline',            color: '#B5905B', bg: 'rgba(181,144,91,0.15)' },
      { key: 'tax_client_uploads',     label: 'Client Uploads',     icon: 'cloud-upload-outline',       color: '#E8B923', bg: 'rgba(232,185,35,0.15)'  },
      { key: 'tax_additional_docs',    label: 'Additional Tax Docs', icon: 'folder-outline',            color: '#E8B923', bg: 'rgba(232,185,35,0.15)' },
      { key: 'tax_return_information', label: 'Tax Returns',        icon: 'information-circle-outline', color: '#B5905B', bg: 'rgba(181,144,91,0.15)' },
    ],
  },
  {
    key: 'BK',
    label: 'BK',
    description: 'Bookkeeping & Financials',
    service: 'BK',
    color: '#008C5A',
    darkColor: '#006644',
    gradient: ['#3A3131', '#4A3E3E', '#2C2320'],
    subFolders: [
      { key: 'bk_contracts',         label: 'BK Contracts',               icon: 'document-text-outline', color: '#E8B923', bg: 'rgba(232,185,35,0.15)'  },
      { key: 'bk_invoices',          label: 'BK Invoices',                icon: 'receipt-outline',       color: '#B5905B', bg: 'rgba(181,144,91,0.15)'  },
      { key: 'bk_final_pnl',         label: 'Additional BK Docs',         icon: 'folder-outline',        color: '#B5905B', bg: 'rgba(181,144,91,0.15)'  },
      { key: 'bk_mr_required_info',  label: 'Monthly Reporting (Required Info)',     icon: 'cloud-upload-outline', color: '#E8B923', bg: 'rgba(232,185,35,0.15)' },
      { key: 'bk_mr_client_review',  label: 'Monthly Reporting (For Client Review)', icon: 'eye-outline',          color: '#B5905B', bg: 'rgba(181,144,91,0.15)' },
      { key: 'bk_mr_final_statements', label: 'Monthly Reporting (Final Statements)', icon: 'ribbon-outline',      color: '#E8B923', bg: 'rgba(232,185,35,0.15)' },
    ],
  },
  {
    key: 'CFO',
    label: 'CFO',
    description: 'CFO Advisory',
    service: 'CFO',
    color: '#B5905B',
    darkColor: '#8B6914',
    gradient: ['#2C2320', '#4A3E3E', '#3A3131'],
    subFolders: [
      { key: 'cfo_contracts',       label: 'CFO Contracts',      icon: 'document-text-outline', color: '#E8B923', bg: 'rgba(232,185,35,0.15)' },
      { key: 'cfo_invoices',        label: 'CFO Invoices',       icon: 'receipt-outline',       color: '#B5905B', bg: 'rgba(181,144,91,0.15)' },
      { key: 'cfo_additional_docs', label: 'Additional CFO Docs', icon: 'folder-outline',        color: '#E8B923', bg: 'rgba(232,185,35,0.15)' },
      { key: 'cfo_mr_required_info',    label: 'Monthly Reporting (Required Info)',     icon: 'cloud-upload-outline', color: '#E8B923', bg: 'rgba(232,185,35,0.15)' },
      { key: 'cfo_mr_client_review',    label: 'Monthly Reporting (For Client Review)', icon: 'eye-outline',          color: '#B5905B', bg: 'rgba(181,144,91,0.15)' },
      { key: 'cfo_mr_final_statements', label: 'Monthly Reporting (Final Statements & Insights)',  icon: 'ribbon-outline', color: '#E8B923', bg: 'rgba(232,185,35,0.15)' },
    ],
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function displayName(doc: Document): string { return doc.file_name || doc.name || 'Document'; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
type FilterType = 'all' | 'new' | 'viewed';

// ═════════════════════════════════════════════════════════════════════════════
// LEVEL 1 — Root folder cards
// ═════════════════════════════════════════════════════════════════════════════

function RootView({ folders, documents, loading, refreshing, onRefresh, onSelect, pb, pt }: {
  folders: RootFolder[]; documents: Document[]; loading: boolean; refreshing: boolean;
  onRefresh: () => void; onSelect: (r: RootFolder) => void;
  pb: number; pt: number;
}) {
  const { isDesktop } = useResponsive();   // 3-column category grid on desktop
  const total  = documents.length;
  const unread = documents.filter(d => d.status !== 'viewed').length;

  const stats = (root: RootFolder) => {
    const keys = root.subFolders.map(s => s.key);
    const docs = documents.filter(d => keys.includes(d.document_type ?? ''));
    return { total: docs.length, unread: docs.filter(d => d.status !== 'viewed').length };
  };

  return (
    <View style={s.screen}>
      {/* ── Page header — same gradient as dashboard ── */}
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.pageHeader, { paddingTop: pt }]}
      >
        <View style={s.headerOverlay} pointerEvents="none" />
        <View style={s.decorCircle1} pointerEvents="none" />
        <View style={s.decorCircle2} pointerEvents="none" />
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Documents</Text>
          <Text style={s.pageSub}>
            {loading ? 'Loading…' : `${total} file${total !== 1 ? 's' : ''}${unread > 0 ? ` · ${unread} unread` : ''}`}
          </Text>
        </View>
        <View style={s.headerBadge}>
          <Ionicons name="folder" size={14} color="#2C2320" />
          <Text style={s.headerBadgeText}>{folders.length} {folders.length === 1 ? 'Category' : 'Categories'}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[s.rootScroll, { paddingBottom: pb }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor='#E8B923' />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.sectionLabel}>Select a category</Text>

          <View style={isDesktop ? s.catGridDesktop : undefined}>
          {folders.map(root => {
            const { total: rTotal, unread: rUnread } = stats(root);
            return (
              <TouchableOpacity key={root.key} onPress={() => onSelect(root)} activeOpacity={0.88} style={[s.rootCardWrap, isDesktop && s.rootCardWrapDesktop]}>
                <LinearGradient colors={root.gradient} style={s.rootCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>

                  {/* Top row */}
                  <View style={s.rootCardTop}>
                    <View style={s.rootIconBox}>
                      <Text style={s.rootIconText}>{root.label}</Text>
                    </View>
                    <View style={s.rootCardTopRight}>
                      {rUnread > 0 && (
                        <View style={s.rootUnreadBadge}>
                          <Text style={s.rootUnreadText}>{rUnread} new</Text>
                        </View>
                      )}
                      <View style={s.rootChevron}>
                        <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.9)" />
                      </View>
                    </View>
                  </View>

                  {/* Title */}
                  <Text style={s.rootCardTitle}>{root.description}</Text>

                  {/* Divider */}
                  <View style={s.rootDivider} />

                  {/* Subfolder chips */}
                  <View style={s.chipRow}>
                    {root.subFolders.map(sf => (
                      <View key={sf.key} style={s.chip}>
                        <Ionicons name={sf.icon} size={11} color="rgba(255,255,255,0.7)" />
                        <Text style={s.chipText} numberOfLines={1}>{sf.label}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Stats row */}
                  <View style={s.rootStatRow}>
                    <View style={s.rootStatItem}>
                      <Ionicons name="folder-open-outline" size={13} color="rgba(255,255,255,0.5)" />
                      <Text style={s.rootStatText}>{root.subFolders.length} folders</Text>
                    </View>
                    <View style={s.rootStatDot} />
                    <View style={s.rootStatItem}>
                      <Ionicons name="document-outline" size={13} color="rgba(255,255,255,0.5)" />
                      <Text style={s.rootStatText}>{rTotal} document{rTotal !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
          </View>

          {/* Info card */}
          <View style={s.infoCard}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
            <Text style={s.infoText}>
              Documents are automatically synced. Tap any category to view your files.
            </Text>
          </View>
      </ScrollView>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LEVEL 2 — Subfolder list
// ═════════════════════════════════════════════════════════════════════════════

function SubFolderView({ root, folders, title, documents, refreshing, onRefresh, onBack, onSelect, pb, pt }: {
  root: RootFolder; folders?: SubFolder[]; title?: string; documents: Document[]; refreshing: boolean;
  onRefresh: () => void; onBack: () => void;
  onSelect: (sf: SubFolder) => void; pb: number; pt: number;
}) {
  // `folders` lets us reuse this view for a nested group's children (3rd level).
  const list = folders ?? root.subFolders;

  // Count documents for a folder — a GROUP folder sums its children's docs.
  const countFor = (sf: SubFolder): { total: number; unread: number } => {
    if (sf.children) {
      return sf.children.reduce((acc, c) => {
        const cc = countFor(c);
        return { total: acc.total + cc.total, unread: acc.unread + cc.unread };
      }, { total: 0, unread: 0 });
    }
    const docs = documents.filter(d => d.document_type === sf.key);
    return { total: docs.length, unread: docs.filter(d => d.status !== 'viewed').length };
  };

  const rootTotal = list.reduce((acc, sf) => acc + countFor(sf).total, 0);

  return (
    <View style={s.screen}>
      {/* ── Header — FTG gradient ── */}
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} style={[s.subHeader, { paddingTop: pt }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={s.subHeaderRow}>
          <TouchableOpacity style={s.backBtn} onPress={onBack}>
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <View style={s.subHeaderCenter}>
            <View style={s.subRootBadge}>
              <Text style={s.subRootBadgeText}>{root.label}</Text>
            </View>
            <Text style={s.subHeaderTitle}>{title ?? root.description}</Text>
          </View>
        </View>
        <View style={s.subHeaderMeta}>
          <View style={s.metaPill}>
            <Ionicons name="folder-outline" size={11} color="rgba(255,255,255,0.6)" />
            <Text style={s.metaPillText}>{list.length} folders</Text>
          </View>
          <View style={s.metaPill}>
            <Ionicons name="document-outline" size={11} color="rgba(255,255,255,0.6)" />
            <Text style={s.metaPillText}>{rootTotal} documents</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[s.subScroll, { paddingBottom: pb }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor='#E8B923' />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.sectionLabel}>Folders</Text>

        {list.map((sf, idx) => {
          const { total, unread } = countFor(sf);
          const pct = rootTotal > 0 ? (total / rootTotal) * 100 : 0;
          return (
            <TouchableOpacity key={sf.key} style={s.sfCard} onPress={() => onSelect(sf)} activeOpacity={0.8}>
              {/* Left icon */}
              <View style={[s.sfIconBox, { backgroundColor: 'rgba(232,185,35,0.12)' }]}>
                <Ionicons name={sf.icon} size={24} color="#E8B923" />
              </View>

              {/* Center content */}
              <View style={s.sfBody}>
                <View style={s.sfTitleRow}>
                  <Text style={s.sfName}>{sf.label}</Text>
                  {unread > 0 && (
                    <View style={[s.sfBadge, { backgroundColor: '#E8B923' }]}>
                      <Text style={[s.sfBadgeText, { color: '#2C2320' }]}>{unread}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.sfMeta}>
                  {total} document{total !== 1 ? 's' : ''}
                  {unread > 0 ? ` · ${unread} unread` : total === 0 ? ' · Empty' : ' · All viewed'}
                </Text>
                {/* Mini progress bar */}
                <View style={s.miniBar}>
                  <View style={[s.miniBarFill, { width: `${pct}%` as any, backgroundColor: '#E8B923' }]} />
                </View>
              </View>

              <Ionicons name="chevron-forward" size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LEVEL 3 — Document list
// ═════════════════════════════════════════════════════════════════════════════

function DocListView({ sf, root, rootColor, documents, refreshing, onRefresh, onBack, onDocPress, onUploadDone, userId, userEmail, pb, pt }: {
  sf: SubFolder; root: RootFolder; rootColor: string; documents: Document[]; refreshing: boolean;
  onRefresh: () => void; onBack: () => void;
  onDocPress: (d: Document) => void; onUploadDone: (d: Document) => void;
  userId: string; userEmail: string; pb: number; pt: number;
}) {
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<FilterType>('all');
  const [uploadOpen, setUploadOpen] = useState(false);

  const unread = documents.filter(d => d.status !== 'viewed').length;

  const filtered = useMemo(() => {
    let items = [...documents];
    if (search) items = items.filter(d => displayName(d).toLowerCase().includes(search.toLowerCase()));
    if (filter !== 'all') items = items.filter(d => d.status === filter);
    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [documents, search, filter]);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'new', label: 'New' }, { key: 'viewed', label: 'Viewed' },
  ];

  return (
    <View style={s.screen}>
      {/* ── Header — FTG gradient ── */}
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.docHeader, { paddingTop: pt }]}
      >
        <View style={s.docHeaderTop}>
          <TouchableOpacity style={s.backBtn} onPress={onBack}>
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          <View style={[s.docFolderIcon, { backgroundColor: 'rgba(232,185,35,0.2)' }]}>
            <Ionicons name={sf.icon} size={18} color="#E8B923" />
          </View>

          <View style={s.docHeaderMid}>
            <Text style={s.docHeaderTitle} numberOfLines={1}>{sf.label}</Text>
            <Text style={s.docHeaderSub}>
              {documents.length} file{documents.length !== 1 ? 's' : ''}
              {unread > 0 ? ` · ${unread} unread` : ''}
            </Text>
          </View>

          <TouchableOpacity style={s.uploadFab} onPress={() => setUploadOpen(true)}>
            <Ionicons name="cloud-upload-outline" size={15} color="#2C2320" />
            <Text style={s.uploadFabText}>Upload</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.5)" />
          <TextInput
            style={[s.searchInput, { outlineWidth: 0 } as any]}
            placeholder="Search files…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <View style={s.filterWrap}>
          {filters.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterPill, filter === f.key && s.filterPillActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.filterPillText, filter === f.key && s.filterPillTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
          <Text style={s.filterCount}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</Text>
        </View>
      </LinearGradient>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={[s.docList, { paddingBottom: pb }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor='#E8B923' />}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <DocCard doc={item} sf={sf} onPress={() => onDocPress(item)} />}
        ListEmptyComponent={<EmptyDocs sf={sf} onUpload={() => setUploadOpen(true)} />}
      />

      <UploadModal
        visible={uploadOpen}
        sf={sf}
        root={root}
        userId={userId}
        userEmail={userEmail}
        onClose={() => setUploadOpen(false)}
        onUploaded={d => { onUploadDone(d); setUploadOpen(false); }}
      />
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyDocs({ sf, onUpload }: { sf: SubFolder; onUpload: () => void }) {
  return (
    <View style={s.empty}>
      <View style={[s.emptyIcon, { backgroundColor: sf.bg }]}>
        <Ionicons name={sf.icon} size={36} color={sf.color} />
      </View>
      <Text style={s.emptyTitle}>No files yet</Text>
      <Text style={s.emptySub}>Upload files or wait for staff to share documents in this folder</Text>
      <TouchableOpacity style={[s.emptyBtn, { backgroundColor: sf.color }]} onPress={onUpload}>
        <Ionicons name="cloud-upload-outline" size={16} color={Colors.white} />
        <Text style={s.emptyBtnText}>Upload First File</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Approval status badge ─────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'approved') return null;
  const isPending  = status === 'pending';
  const bg         = isPending ? '#FEF3C7' : '#FEF2F2';
  const textColor  = isPending ? '#92400E' : '#991B1B';
  const icon: any  = isPending ? 'time-outline' : 'close-circle-outline';
  const label      = isPending ? 'Pending Approval' : 'Rejected';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: bg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 4 }}>
      <Ionicons name={icon} size={10} color={textColor} />
      <Text style={{ color: textColor, fontSize: 9, fontWeight: '700', letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

// ── Doc card ──────────────────────────────────────────────────────────────────

function DocCard({ doc, sf, onPress }: { doc: Document; sf: SubFolder; onPress: () => void }) {
  const isNew      = doc.status !== 'viewed';
  const isPending  = (doc.approval_status ?? 'approved') === 'pending';
  const isRejected = (doc.approval_status ?? 'approved') === 'rejected';
  const ext        = (displayName(doc).split('.').pop() ?? '').toUpperCase().slice(0, 4);

  return (
    <TouchableOpacity
      style={[
        s.docCard,
        isNew && !isPending && !isRejected && s.docCardNew,
        isPending  && s.docCardPending,
        isRejected && s.docCardRejected,
      ]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      {isPending  && <View style={[s.newAccent, { backgroundColor: '#F59E0B' }]} />}
      {isRejected && <View style={[s.newAccent, { backgroundColor: '#EF4444' }]} />}
      {isNew && !isPending && !isRejected && <View style={[s.newAccent, { backgroundColor: sf.color }]} />}

      {/* File type badge */}
      <View style={[s.extBox, { backgroundColor: isPending ? '#FEF3C7' : isRejected ? '#FEF2F2' : sf.bg }]}>
        <Ionicons
          name={isPending ? 'time-outline' : isRejected ? 'close-circle-outline' : 'document-text'}
          size={20}
          color={isPending ? '#F59E0B' : isRejected ? '#EF4444' : sf.color}
        />
        {!!ext && <Text style={[s.extText, { color: isPending ? '#F59E0B' : isRejected ? '#EF4444' : sf.color }]}>{ext}</Text>}
      </View>

      <View style={s.docCardBody}>
        <Text style={s.docCardName} numberOfLines={2}>{displayName(doc)}</Text>
        <View style={s.docCardMeta}>
          <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
          <Text style={s.docCardMetaText}>{fmtDate(doc.created_at)}</Text>
        </View>
        <ApprovalBadge status={doc.approval_status ?? 'approved'} />
        {isRejected && !!doc.approval_note && (
          <Text style={{ color: '#EF4444', fontSize: 10, marginTop: 2, fontStyle: 'italic' }} numberOfLines={1}>
            {doc.approval_note}
          </Text>
        )}
      </View>

      <View style={s.docCardRight}>
        {!isPending && !isRejected && <StatusBadge status={doc.status} size="sm" />}
        <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} style={{ marginTop: 4 }} />
      </View>
    </TouchableOpacity>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

interface PickedFile { uri: string; name: string; mimeType: string; size?: number }

function UploadModal({ visible, sf, root, userId, userEmail, onClose, onUploaded }: {
  visible: boolean; sf: SubFolder; root: RootFolder; userId: string; userEmail: string;
  onClose: () => void; onUploaded: (d: Document) => void;
}) {
  const { user } = useAuth();
  const [picked, setPicked]   = useState<PickedFile | null>(null);
  const [busy, setBusy]       = useState(false);
  const [pct, setPct]         = useState(0);
  const [done, setDone]       = useState(false);

  // Collector folders (e.g. Monthly Reporting → Required Info) show a picker of the
  // required items, so the client tags which item this upload is for.
  const requiresPick = isRequirementFolder(sf.key);
  const [requirement, setRequirement] = useState<RequiredItem | null>(null);

  const reset = () => { setPicked(null); setPct(0); setDone(false); setRequirement(null); };
  const close = () => { reset(); onClose(); };

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (r.canceled) return;
      const a = r.assets[0];
      setPicked({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size });
    } catch { Alert.alert('Error', 'Could not pick a file.'); }
  };

  const upload = async () => {
    if (!picked) return;
    setBusy(true); setPct(15);

    try {
      // ── Step 1: Upload to Supabase Storage to get a real public URL ──────────
      const storageUrl = await uploadDocumentToStorage(
        userId, sf.key, picked.uri, picked.name, picked.mimeType,
      );
      setPct(50);

      if (!storageUrl) {
        setBusy(false); setPct(0);
        Alert.alert('Upload Failed', 'Could not save file to storage. Make sure the "documents" bucket exists in Supabase and is set to Public.');
        return;
      }

      // ── Step 2: Notify webhook (fire-and-forget, non-blocking) ───────────────
      try {
        const formData = new FormData();
        if (Platform.OS === 'web') {
          const res = await fetch(picked.uri);
          const blob = await res.blob();
          formData.append('file', blob, picked.name);
        } else {
          formData.append('file', { uri: picked.uri, name: picked.name, type: picked.mimeType } as any);
        }
        formData.append('folder',        root.label);   // TAX or BK
        formData.append('subfolder',     sf.label);      // e.g. Client Uploads
        formData.append('subfolder_key', sf.key);        // e.g. tax_client_uploads
        formData.append('document_url',  storageUrl);   // real public URL
        formData.append('email',         userEmail);
        formData.append('user_id',       userId);
        await fetch(WEBHOOK_URL, { method: 'POST', body: formData });
      } catch (webhookErr: any) {
        console.warn('Webhook notify failed (non-fatal):', webhookErr?.message);
      }
      setPct(80);

      // ── Step 3: Save record to the correct folder table ──────────────────────
      const doc = await createDocumentRecord({
        userId,
        email: userEmail,
        name: picked.name,
        documentUrl: storageUrl,   // always a real https:// URL
        documentType: sf.key,
      });
      // ── Step 4: If this folder IS a required item, mark it PENDING ──────────────
      // (turns the dashboard radio yellow immediately, before admin approval)
      if (doc && requirement && userEmail) {
        await createPendingRequirement({
          clientEmail:    userEmail,
          documentId:     doc.id,
          documentTable:  sf.key,
          service:        requirement.service,
          requirementKey: requirement.key,
          month:          monthOf(),
        });
      }

      setPct(100); setBusy(false);

      if (!doc) { Alert.alert('Partial Success', 'File saved but record creation failed.'); return; }
      setDone(true);
      setTimeout(() => { onUploaded(doc); reset(); }, 1400);

    } catch (err: any) {
      setBusy(false); setPct(0);
      Alert.alert('Upload Failed', err?.message ?? 'Something went wrong. Check your connection and try again.');
    }
  };

  const fmtSize = (b?: number) => !b ? '' : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={up.root}>
        {/* Header */}
        <LinearGradient colors={[sf.bg, Colors.bgDeep]} style={up.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <TouchableOpacity onPress={close} disabled={busy} style={up.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={up.headerCenter}>
            <View style={[up.headerIcon, { backgroundColor: sf.bg }]}>
              <Ionicons name={sf.icon} size={22} color={sf.color} />
            </View>
            <Text style={up.headerTitle}>{sf.label}</Text>
            <Text style={up.headerSub}>{requiresPick ? 'Select an item, then upload' : 'Upload a document'}</Text>
          </View>
          <View style={{ width: 34 }} />
        </LinearGradient>

        <ScrollView contentContainerStyle={up.body} showsVerticalScrollIndicator={false}>
          {/* ── Done */}
          {done && (
            <View style={up.doneWrap}>
              <View style={up.doneCircle}>
                <Ionicons name="time-outline" size={72} color="#F59E0B" />
              </View>
              <Text style={up.doneTitle}>Sent for Review</Text>
              <Text style={up.doneSub}>"{picked?.name}" is pending admin approval before it appears in {sf.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, marginTop: 8 }}>
                <Ionicons name="shield-checkmark-outline" size={14} color="#92400E" />
                <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '600' }}>Admin will review shortly</Text>
              </View>
            </View>
          )}

          {/* ── Uploading */}
          {!done && busy && (
            <View style={up.progressWrap}>
              <View style={[up.progressIcon, { backgroundColor: sf.bg }]}>
                <Ionicons name="cloud-upload" size={40} color={sf.color} />
              </View>
              <Text style={up.progressTitle}>Uploading…</Text>
              <Text style={up.progressFile} numberOfLines={1}>{picked?.name}</Text>
              <View style={up.barBg}>
                <View style={[up.barFill, { width: `${pct}%` as any, backgroundColor: sf.color }]} />
              </View>
              <Text style={[up.pctText, { color: sf.color }]}>{pct}%</Text>
            </View>
          )}

          {/* ── Idle */}
          {!done && !busy && (
            <>
              {/* Step 1 (collector folders): pick which required item this file is for */}
              {requiresPick && !requirement && (
                <View style={up.reqPick}>
                  <Text style={up.reqPickTitle}>What are you uploading?</Text>
                  <Text style={up.reqPickSub}>Choose the required item this file is for</Text>
                  {itemsForFolderAndClient(sf.key, user?.services, user?.hasQboAccess).map(item => (
                    <TouchableOpacity key={item.key} style={up.reqItem} activeOpacity={0.75} onPress={() => setRequirement(item)}>
                      <Ionicons name="ellipse-outline" size={18} color={sf.color} />
                      <Text style={up.reqItemText}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={up.cancelBtn} onPress={close}>
                    <Text style={up.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Step 2: selected-item chip + file picker (collector), or plain folder */}
              {(!requiresPick || requirement) && (
              <>
              {requiresPick && requirement && (
                <TouchableOpacity
                  style={[up.selectedReq, { borderColor: `${sf.color}50`, backgroundColor: sf.bg }]}
                  onPress={() => { setRequirement(null); setPicked(null); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle" size={18} color={sf.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={up.selectedReqLabel}>{requirement.label}</Text>
                    <Text style={up.selectedReqHint}>Tap to change</Text>
                  </View>
                  <Ionicons name="swap-horizontal-outline" size={16} color={sf.color} />
                </TouchableOpacity>
              )}

              {/* Drop zone */}
              {!picked ? (
                <TouchableOpacity style={[up.dropZone, { borderColor: `${sf.color}50` }]} onPress={pick} activeOpacity={0.85}>
                  <LinearGradient colors={[sf.bg, 'transparent']} style={up.dropGrad} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
                    <View style={[up.dropIconBox, { backgroundColor: sf.bg }]}>
                      <Ionicons name="cloud-upload-outline" size={40} color={sf.color} />
                    </View>
                    <Text style={up.dropTitle}>Tap to select a file</Text>
                    <Text style={up.dropSub}>PDF · XLSX · DOCX · Images · Any format</Text>
                    <View style={[up.browseChip, { borderColor: sf.color, backgroundColor: `${sf.color}15` }]}>
                      <Ionicons name="folder-open-outline" size={14} color={sf.color} />
                      <Text style={[up.browseText, { color: sf.color }]}>Browse Files</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                /* File preview card */
                <View style={up.fileCard}>
                  <View style={[up.fileIconBox, { backgroundColor: sf.bg }]}>
                    <Ionicons name="document-text" size={32} color={sf.color} />
                  </View>
                  <View style={up.fileInfo}>
                    <Text style={up.fileName} numberOfLines={2}>{picked.name}</Text>
                    <Text style={up.fileMeta}>
                      {fmtSize(picked.size)}
                      {picked.mimeType ? ` · ${picked.mimeType.split('/')[1]?.toUpperCase()}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setPicked(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={22} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Action buttons */}
              {picked ? (
                <TouchableOpacity style={[up.actionBtn, { backgroundColor: sf.color }]} onPress={upload}>
                  <Ionicons name="cloud-upload" size={18} color={Colors.white} />
                  <Text style={up.actionBtnText}>Upload Document</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[up.actionBtn, { backgroundColor: sf.bg, borderWidth: 1, borderColor: `${sf.color}50` }]} onPress={pick}>
                  <Ionicons name="add-circle-outline" size={18} color={sf.color} />
                  <Text style={[up.actionBtnText, { color: sf.color }]}>Select a File</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={up.cancelBtn} onPress={close}>
                <Text style={up.cancelText}>Cancel</Text>
              </TouchableOpacity>
              </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Inline document viewer modal ─────────────────────────────────────────────

function DocViewerModal({ url, name, sf, visible, onClose }: {
  url: string; name: string; sf: SubFolder; visible: boolean; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const pt = Platform.OS === 'web' ? 0 : insets.top;

  useEffect(() => { if (visible) { setLoading(true); setError(false); } }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[vw.root, { paddingTop: pt }]}>
        {/* header */}
        <View style={[vw.bar, { backgroundColor: sf.bg }]}>
          <TouchableOpacity style={vw.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={Colors.white} />
          </TouchableOpacity>
          <View style={[vw.fileIcon, { backgroundColor: `${sf.color}30` }]}>
            <Ionicons name={sf.icon} size={16} color={sf.color} />
          </View>
          <Text style={vw.barTitle} numberOfLines={1}>{name}</Text>
        </View>

        {/* viewer */}
        <View style={vw.body}>
          {loading && !error && (
            <View style={vw.loader}>
              <ActivityIndicator size="large" color={sf.color} />
              <Text style={vw.loaderText}>Loading…</Text>
            </View>
          )}
          {error && (
            <View style={vw.errorWrap}>
              <Ionicons name="alert-circle-outline" size={52} color={Colors.error} />
              <Text style={vw.errorTitle}>Could not load document</Text>
              <Text style={vw.errorSub}>The file may not support inline preview.</Text>
              <TouchableOpacity style={vw.errorClose} onPress={onClose}>
                <Text style={vw.errorCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}

          {Platform.OS === 'web'
            ? React.createElement('iframe', {
                src: url,
                style: { flex: 1, width: '100%', height: '100%', border: 'none', display: loading ? 'none' : 'flex' },
                title: name,
                onLoad: () => setLoading(false),
                onError: () => { setLoading(false); setError(true); },
              })
            : <WebView
                source={{ uri: url }}
                style={{ flex: 1, display: loading || error ? 'none' : 'flex' } as any}
                onLoadEnd={() => setLoading(false)}
                onError={() => { setLoading(false); setError(true); }}
                javaScriptEnabled
                allowsInlineMediaPlayback
              />
          }
        </View>
      </View>
    </Modal>
  );
}

// ── Rename modal (cross-platform, no Alert.prompt) ────────────────────────────

function RenameModal({ visible, current, onConfirm, onCancel }: {
  visible: boolean; current: string; onConfirm: (name: string) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  useEffect(() => { if (visible) setValue(current); }, [visible, current]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={rm.overlay} onPress={onCancel}>
        <Pressable style={rm.card} onPress={e => e.stopPropagation()}>
          <Text style={rm.title}>Rename File</Text>
          <TextInput
            style={rm.input}
            value={value}
            onChangeText={setValue}
            autoFocus
            selectTextOnFocus
            placeholderTextColor={Colors.textMuted}
            onSubmitEditing={() => { if (value.trim()) onConfirm(value.trim()); }}
          />
          <View style={rm.btnRow}>
            <TouchableOpacity style={rm.cancelBtn} onPress={onCancel}>
              <Text style={rm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[rm.confirmBtn, !value.trim() && { opacity: 0.4 }]}
              onPress={() => { if (value.trim()) onConfirm(value.trim()); }}
              disabled={!value.trim()}
            >
              <Text style={rm.confirmText}>Rename</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Document detail — metadata page ──────────────────────────────────────────

function DocDetailPage({ doc, sf, root, fileOwnerId, userEmail, onClose, onMarkViewed, onDelete, onRename, onApprovalChange }: {
  doc: Document; sf: SubFolder; root: RootFolder;
  fileOwnerId: string; userEmail: string;
  onClose: () => void; onMarkViewed: () => void;
  onDelete: () => void; onRename: (newName: string) => void;
  onApprovalChange: (status: 'approved' | 'rejected', note: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [viewerOpen, setViewerOpen]           = useState(false);
  const [renameOpen, setRenameOpen]           = useState(false);
  const [deleteOpen, setDeleteOpen]           = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [reviewBusy, setReviewBusy]           = useState(false);

  // Client can approve/reject only files that STAFF delivered to them, while pending.
  const isStaffFile = doc.uploaded_by_role === 'staff' || doc.uploaded_by_role === 'admin';
  const awaitingClient = isStaffFile && (doc.approval_status ?? 'approved') === 'pending';

  const clientApprove = async () => {
    if (reviewBusy) return;
    setReviewBusy(true);
    const ok = await approveDocument(doc.id, doc.document_type ?? '', userEmail);
    setReviewBusy(false);
    if (ok) onApprovalChange('approved', null);
    else Alert.alert('Error', 'Could not approve this file.');
  };

  const clientReject = async () => {
    if (reviewBusy) return;
    setReviewBusy(true);
    const ok = await rejectDocument(doc.id, doc.document_type ?? '', userEmail, 'Rejected by client');
    setReviewBusy(false);
    if (ok) onApprovalChange('rejected', 'Rejected by client');
    else Alert.alert('Error', 'Could not reject this file.');
  };

  const hasValidUrl = !!doc.document_url && doc.document_url.startsWith('http');
  const ext = (displayName(doc).split('.').pop() ?? '').toUpperCase().slice(0, 4);
  const pt  = Platform.OS === 'web' ? 0 : insets.top;
  const pb  = Platform.OS === 'web' ? 0 : insets.bottom;

  return (
    <View style={[dp.root, { paddingTop: pt }]}>

      {/* ── Top bar */}
      <LinearGradient colors={root.gradient} style={dp.topBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <TouchableOpacity style={dp.backBtn} onPress={onClose}>
          <Ionicons name="chevron-back" size={20} color={Colors.white} />
        </TouchableOpacity>
        <View style={dp.topBarCenter}>
          <Text style={dp.topBarFileName} numberOfLines={1}>{displayName(doc)}</Text>
          <View style={dp.topBarMeta}>
            <View style={[dp.rootChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={dp.rootChipText}>{root.label}</Text>
            </View>
            <Text style={dp.topBarSub}>{sf.label}</Text>
          </View>
        </View>
        <View style={dp.topBarRight}>
          <TouchableOpacity style={dp.iconBtn} onPress={() => setRenameOpen(true)}>
            <Ionicons name="pencil-outline" size={19} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={dp.iconBtn} onPress={() => setDeleteOpen(true)}>
            <Ionicons name="trash-outline" size={19} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[dp.scroll, { paddingBottom: pb + 20 }]} showsVerticalScrollIndicator={false}>

        {/* ── File hero */}
        <LinearGradient colors={[root.gradient[0], Colors.bgDeep]} style={dp.hero} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
          <View style={[dp.heroIconWrap, { backgroundColor: sf.bg, borderColor: `${sf.color}40` }]}>
            <Ionicons name="document-text" size={52} color={sf.color} />
            {!!ext && <View style={[dp.extBadge, { backgroundColor: sf.color }]}><Text style={dp.extBadgeText}>{ext}</Text></View>}
          </View>
          <Text style={dp.heroName} numberOfLines={3}>{displayName(doc)}</Text>
          <StatusBadge status={doc.status} />
        </LinearGradient>

        {/* ── Metadata */}
        <View style={dp.section}>
          <Text style={dp.sectionLabel}>File Details</Text>
          <View style={dp.metaCard}>
            <DetailRow icon="calendar-outline" label="Date Uploaded" value={fmtDate(doc.created_at)} color={sf.color} />
            <View style={dp.div} />
            <DetailRow icon="folder-outline"   label="Folder"        value={sf.label}                color={sf.color} />
            <View style={dp.div} />
            <DetailRow icon="layers-outline"   label="Category"      value={root.description}        color={sf.color} />
            {!!doc.email && <><View style={dp.div} /><DetailRow icon="mail-outline" label="Email" value={doc.email} color={sf.color} /></>}
            <View style={dp.div} />
            <DetailRow
              icon={doc.status === 'viewed' ? 'eye-outline' : 'eye-off-outline'}
              label="Status"
              value={doc.status === 'viewed' ? 'Viewed' : doc.status === 'new' ? 'New' : 'Not Viewed'}
              color={doc.status === 'viewed' ? Colors.viewed : Colors.notViewed}
            />
          </View>
        </View>

        {/* ── Admin Feedback ── */}
        {!!doc.approval_note && doc.approval_status !== 'approved' && (
          <View style={dp.section}>
            <Text style={dp.sectionLabel}>Admin Feedback</Text>
            <View style={[dp.feedbackCard, doc.approval_status === 'rejected' ? dp.feedbackRejected : dp.feedbackPending]}>
              <View style={dp.feedbackRow}>
                <Ionicons
                  name={doc.approval_status === 'rejected' ? 'close-circle' : 'time'}
                  size={16}
                  color={doc.approval_status === 'rejected' ? '#EF4444' : '#F59E0B'}
                />
                <Text style={[dp.feedbackStatus, { color: doc.approval_status === 'rejected' ? '#991B1B' : '#92400E' }]}>
                  {doc.approval_status === 'rejected' ? 'Rejected' : 'Pending Approval'}
                </Text>
              </View>
              <Text style={[dp.feedbackNote, { color: doc.approval_status === 'rejected' ? '#B91C1C' : '#B45309' }]}>
                {doc.approval_note}
              </Text>
              <TouchableOpacity style={dp.replyBtn} onPress={() => setConversationOpen(true)} activeOpacity={0.85}>
                <Ionicons name="chatbubble-outline" size={15} color="#2C2320" />
                <Text style={dp.replyBtnText}>Reply to Feedback</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Client review of a staff-delivered file ── */}
        {awaitingClient && (
          <View style={dp.section}>
            <Text style={dp.sectionLabel}>Review This File</Text>
            <View style={dp.reviewCard}>
              <Text style={dp.reviewText}>Our team sent you this document. Please approve it, or reject it if something's wrong.</Text>
              <View style={dp.reviewRow}>
                <TouchableOpacity style={[dp.rejectBtn, reviewBusy && { opacity: 0.5 }]} onPress={clientReject} disabled={reviewBusy} activeOpacity={0.85}>
                  <Ionicons name="close-circle-outline" size={17} color="#DC2626" />
                  <Text style={dp.rejectText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[dp.approveBtn, reviewBusy && { opacity: 0.5 }]} onPress={clientApprove} disabled={reviewBusy} activeOpacity={0.85}>
                  {reviewBusy ? <ActivityIndicator size="small" color={Colors.white} /> : <><Ionicons name="checkmark-circle-outline" size={17} color={Colors.white} /><Text style={dp.approveText}>Approve</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Actions */}
        <View style={dp.section}>
          <TouchableOpacity
            style={[dp.viewBtn, { backgroundColor: hasValidUrl ? sf.color : Colors.bgElevated, opacity: hasValidUrl ? 1 : 0.5 }]}
            onPress={() => { setViewerOpen(true); onMarkViewed(); }}
            disabled={!hasValidUrl}
            activeOpacity={0.85}
          >
            <Ionicons name="eye-outline" size={20} color={Colors.white} />
            <Text style={dp.viewBtnText}>{hasValidUrl ? 'View Document' : 'No Preview Available'}</Text>
          </TouchableOpacity>

          {doc.status !== 'viewed' && (
            <TouchableOpacity style={dp.markBtn} onPress={onMarkViewed}>
              <Ionicons name="checkmark-circle-outline" size={17} color={Colors.primary} />
              <Text style={dp.markBtnText}>Mark as Viewed</Text>
            </TouchableOpacity>
          )}

          {/* Message button (always available) */}
          <TouchableOpacity style={dp.msgBtn} onPress={() => setConversationOpen(true)} activeOpacity={0.8}>
            <Ionicons name="chatbubbles-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={dp.msgBtnText}>Message Admin</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Inline viewer modal */}
      <DocViewerModal
        visible={viewerOpen}
        url={doc.document_url}
        name={displayName(doc)}
        sf={sf}
        onClose={() => setViewerOpen(false)}
      />

      {/* ── Rename modal */}
      <RenameModal
        visible={renameOpen}
        current={displayName(doc)}
        onConfirm={name => { onRename(name); setRenameOpen(false); }}
        onCancel={() => setRenameOpen(false)}
      />

      {/* ── Conversation panel */}
      <FileConversationPanel
        visible={conversationOpen}
        doc={doc}
        fileOwnerId={fileOwnerId}
        onClose={() => setConversationOpen(false)}
      />

      {/* ── Delete confirmation modal */}
      <Modal visible={deleteOpen} animationType="fade" transparent onRequestClose={() => setDeleteOpen(false)}>
        <Pressable style={rm.overlay} onPress={() => setDeleteOpen(false)}>
          <Pressable style={rm.card} onPress={e => e.stopPropagation()}>
            <View style={dc.iconWrap}>
              <Ionicons name="trash-outline" size={32} color={Colors.error} />
            </View>
            <Text style={dc.title}>Delete File</Text>
            <Text style={dc.msg}>
              Are you sure you want to delete{'\n'}
              <Text style={dc.fileName}>"{displayName(doc)}"</Text>?{'\n'}
              This cannot be undone.
            </Text>
            <View style={rm.btnRow}>
              <TouchableOpacity style={rm.cancelBtn} onPress={() => setDeleteOpen(false)}>
                <Text style={rm.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dc.deleteBtn}
                onPress={() => { setDeleteOpen(false); onDelete(); }}
              >
                <Ionicons name="trash-outline" size={15} color={Colors.white} />
                <Text style={dc.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

function DetailRow({ icon, label, value, color }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string;
}) {
  return (
    <View style={dp.metaRow}>
      <View style={[dp.metaIconBox, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={dp.metaLabel}>{label}</Text>
      <Text style={dp.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Root screen (state machine)
// ═════════════════════════════════════════════════════════════════════════════

type Nav = 'root' | 'sub' | 'group' | 'docs';

export function DocumentsScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const insets   = useSafeAreaInsets();
  const pt = Platform.OS === 'web' ? 16 : insets.top + 12;
  const pb = Platform.OS === 'web' ? 24 : insets.bottom + 90;

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nav,        setNav]       = useState<Nav>('root');
  const [activeRoot, setActiveRoot] = useState<RootFolder | null>(null);
  const [activeGroup, setActiveGroup] = useState<SubFolder | null>(null);   // nested group (Monthly Reporting)
  const [activeSub,  setActiveSub]  = useState<SubFolder | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!user?.email) return;
    if (isRefresh) setRefreshing(true);
    // No setLoading(true) — show existing content immediately
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }, 8000);
    try {
      const docs = await getDocumentsByEmail(user.email);
      if (mountedRef.current) setDocuments(docs);
    } catch (e) {
      console.error('load documents:', e);
    } finally {
      clearTimeout(safetyTimer);
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [user?.email]);

  // Load only after auth is fully resolved and user email is available
  useEffect(() => {
    if (!authLoading && user?.email) load();
  }, [authLoading, user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email;

    // Subscribe to all 8 folder tables.
    // UPDATE events: no row-level filter here — Supabase needs REPLICA IDENTITY FULL
    // for filtered UPDATEs to work. Instead we check client-side (only update docs
    // already in local state, which guarantees they belong to this user).
    const channels = FOLDER_TABLES.map(table =>
      supabase.channel(`docs:${table}:${email}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `email=eq.${email}` },
          p => {
            const newDoc: Document = {
              ...p.new as Document,
              document_type: table,
              approval_status: (p.new as any).approval_status ?? 'pending',
              approval_note: (p.new as any).approval_note ?? null,
            };
            // Skip if already added by onUploadDone (optimistic update)
            setDocuments(prev => prev.find(d => d.id === newDoc.id) ? prev : [newDoc, ...prev]);
          })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table },
          p => {
            const raw = p.new as any;
            const u: Document = {
              ...raw,
              document_type: table,
              approval_status: raw.approval_status ?? 'approved',
              approval_note: raw.approval_note ?? null,
            };
            setDocuments(prev => {
              // Only update docs already in this user's list
              if (!prev.find(d => d.id === u.id)) return prev;
              return prev.map(d => d.id === u.id ? u : d);
            });
            setSelectedDoc(prev => prev?.id === u.id ? u : prev);
          })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table },
          p => setDocuments(prev => prev.filter(d => d.id !== (p.old as any).id)))
        .subscribe()
    );

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [user?.email]);

  const onRefresh = useCallback(async () => { await load(true); }, [load]);
  const markViewed = useCallback(async (doc: Document) => {
    if (doc.status === 'viewed') return;
    const table = doc.document_type ?? '';
    await updateDocumentStatus(doc.id, 'viewed', table);
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'viewed' } : d));
    setSelectedDoc(prev => prev?.id === doc.id ? { ...prev, status: 'viewed' } : prev);
  }, []);

  const subDocs = useMemo(
    () => activeSub ? documents.filter(d => d.document_type === activeSub.key) : [],
    [documents, activeSub],
  );

  // Only show the categories for the services this client has (BK / TAX / CFO),
  // and within each, hide requirement sub-folders that don't apply (e.g. the QBO
  // folder when we already have QBO access).
  const visibleFolders = useMemo(() => {
    const svc = user?.services && user.services.length > 0 ? user.services : ['BK'];
    return FOLDERS.filter(f => svc.includes(f.service));
  }, [user?.services]);

  return (
    <>
      {nav === 'root' && (
        <RootView folders={visibleFolders} documents={documents} loading={loading} refreshing={refreshing} onRefresh={onRefresh}
          onSelect={r => { setActiveRoot(r); setActiveGroup(null); setNav('sub'); }} pb={pb} pt={pt} />
      )}
      {nav === 'sub' && !!activeRoot && (
        <SubFolderView root={activeRoot} documents={documents} refreshing={refreshing} onRefresh={onRefresh}
          onBack={() => setNav('root')}
          onSelect={sf => {
            if (sf.children) { setActiveGroup(sf); setNav('group'); }   // open nested group
            else { setActiveGroup(null); setActiveSub(sf); setNav('docs'); }
          }}
          pb={pb} pt={pt} />
      )}
      {nav === 'group' && !!activeRoot && !!activeGroup && (
        <SubFolderView root={activeRoot} folders={activeGroup.children} title={activeGroup.label}
          documents={documents} refreshing={refreshing} onRefresh={onRefresh}
          onBack={() => setNav('sub')} onSelect={sf => { setActiveSub(sf); setNav('docs'); }} pb={pb} pt={pt} />
      )}
      {nav === 'docs' && !!activeSub && !!activeRoot && (
        <DocListView sf={activeSub} root={activeRoot} rootColor={activeRoot.color} documents={subDocs}
          refreshing={refreshing} onRefresh={onRefresh}
          onBack={() => setNav(activeGroup ? 'group' : 'sub')} onDocPress={setSelectedDoc}
          onUploadDone={d => setDocuments(prev => prev.find(x => x.id === d.id) ? prev : [d, ...prev])}
          userId={user?.id ?? ''} userEmail={user?.email ?? ''} pb={pb} pt={pt} />
      )}

      <Modal visible={!!selectedDoc} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setSelectedDoc(null)}>
        {!!selectedDoc && !!activeSub && !!activeRoot && (
          <DocDetailPage
            doc={selectedDoc}
            sf={activeSub}
            root={activeRoot}
            fileOwnerId={user?.id ?? ''}
            userEmail={user?.email ?? ''}
            onClose={() => setSelectedDoc(null)}
            onMarkViewed={() => markViewed(selectedDoc)}
            onApprovalChange={(status, note) => {
              const updated = { ...selectedDoc, approval_status: status, approval_note: note } as Document;
              setDocuments(prev => prev.map(d => d.id === selectedDoc.id ? updated : d));
              setSelectedDoc(updated);
            }}
            onDelete={async () => {
              const table = selectedDoc.document_type ?? '';
              const docId = selectedDoc.id;
              const ok = await deleteDocument(docId, table);
              if (ok) {
                // If this file was fulfilling a required item, clear the pending slot
                // so the dashboard radio goes back to grey (not stuck on "Pending").
                await clearPendingRequirementForDocument(docId);
                setDocuments(prev => prev.filter(d => d.id !== docId));
                setSelectedDoc(null);
              } else {
                Alert.alert('Could not delete', 'The file could not be deleted. You may not have permission to delete it — please contact an admin.');
              }
            }}
            onRename={async (newName) => {
              const table = selectedDoc.document_type ?? '';
              const ok = await renameDocument(selectedDoc.id, newName, table);
              if (ok) {
                const updated = { ...selectedDoc, name: newName, file_name: newName };
                setDocuments(prev => prev.map(d => d.id === selectedDoc.id ? updated : d));
                setSelectedDoc(updated);
              } else {
                Alert.alert('Error', 'Could not rename the document.');
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: Colors.bgDeep },
  loader:   { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // page header
  pageHeader: { paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', overflow: 'hidden', position: 'relative' },
  headerOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.04 },
  decorCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,185,35,0.06)', top: -60, right: -40 } as any,
  decorCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(232,185,35,0.05)', bottom: -30, left: 60 } as any,
  pageTitle:  { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  pageSub:    { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8B923', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  headerBadgeText: { color: '#2C2320', fontSize: 12, fontWeight: '700' },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, paddingHorizontal: 20, paddingTop: 20 },

  // root cards
  rootScroll:    { paddingBottom: 20 },
  rootCardWrap:  { marginHorizontal: 16, marginBottom: 14, borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  // Desktop: lay the category cards out as a 3-column grid.
  catGridDesktop:      { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  rootCardWrapDesktop: { flexBasis: '31%', flexGrow: 1, marginHorizontal: 8 },
  rootCard:      { padding: 22 },
  rootCardTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  rootIconBox:   { width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  rootIconText:  { color: Colors.white, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  rootCardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rootUnreadBadge:  { backgroundColor: '#E8B923', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  rootUnreadText:   { color: '#2C2320', fontSize: 11, fontWeight: '700' },
  rootChevron:   { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  rootCardTitle: { color: Colors.white, fontSize: 17, fontWeight: '700', marginBottom: 16, opacity: 0.95 },
  rootDivider:   { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 14 },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  chipText:      { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '500', maxWidth: SW / 4 },
  rootStatRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rootStatItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rootStatText:  { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  rootStatDot:   { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },

  // info card
  infoCard: { marginHorizontal: 16, marginTop: 4, flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)' },
  infoText: { color: Colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 },

  // back btn
  backBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },

  // subfolder header
  subHeader:     { paddingHorizontal: 16, paddingBottom: 16 },
  subHeaderRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  subHeaderCenter: { flex: 1, gap: 4 },
  subRootBadge:  { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#E8B923' },
  subRootBadgeText: { color: '#2C2320', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  subHeaderTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  subHeaderMeta: { flexDirection: 'row', gap: 10, marginTop: 2 },
  metaPill:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaPillText:  { color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  // subfolder cards
  subScroll: { paddingHorizontal: 16, paddingBottom: 20 },
  sfCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E8E0D0', gap: 14, shadowColor: '#3A3131', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sfIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sfBody:    { flex: 1 },
  sfTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sfName:    { color: '#1C1713', fontSize: 15, fontWeight: '700', flex: 1 },
  sfBadge:   { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  sfBadgeText: { color: '#2C2320', fontSize: 10, fontWeight: '800' },
  sfMeta:    { color: '#A8998A', fontSize: 12, marginBottom: 8 },
  miniBar:   { height: 3, backgroundColor: '#F5F0E8', borderRadius: 2, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 2 },

  // doc header — gradient, no bg color needed
  docHeader:    { paddingHorizontal: 16, paddingBottom: 14 },
  docHeaderTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  docFolderIcon:{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docHeaderMid: { flex: 1 },
  docHeaderTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  docHeaderSub:   { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 },
  uploadFab:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, backgroundColor: '#E8B923', shadowColor: '#E8B923', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  uploadFabText: { color: '#2C2320', fontSize: 12, fontWeight: '800' },

  // search & filter
  searchWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', gap: 8 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 10 },
  filterWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterPill:  { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  filterPillActive: { backgroundColor: '#E8B923', borderColor: '#E8B923' },
  filterPillText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: '#2C2320', fontWeight: '700' },
  filterCount:    { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginLeft: 'auto' as any },

  // doc list
  docList: { padding: 14 },
  docCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E8E0D0', gap: 12, overflow: 'hidden', shadowColor: '#3A3131', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  docCardNew:      { borderColor: '#E8B923', borderLeftWidth: 3 },
  docCardPending:  { borderColor: '#F59E0B', borderLeftWidth: 3, backgroundColor: '#FFFBEB' },
  docCardRejected: { borderColor: '#EF4444', borderLeftWidth: 3, backgroundColor: '#FFF5F5' },
  newAccent:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  extBox:      { width: 50, height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 2 },
  extText:     { fontSize: 8, fontWeight: '800', letterSpacing: 0.3 },
  docCardBody: { flex: 1 },
  docCardName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 5, lineHeight: 19 },
  docCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  docCardMetaText: { color: Colors.textMuted, fontSize: 11 },
  docCardRight: { alignItems: 'flex-end', gap: 2 },

  // empty
  empty:      { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30, gap: 12 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptySub:   { color: Colors.textMuted,   fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 22, marginTop: 8 },
  emptyBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});

// upload modal styles
const up = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bgDeep },
  header: { paddingVertical: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Colors.border },
  closeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center', gap: 6 },
  headerIcon:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  headerSub:    { color: Colors.textMuted,   fontSize: 12 },
  body:    { padding: 20, gap: 14 },
  // Requirement picker (Required Documents folders)
  reqPick:       { gap: 2 },
  reqPickTitle:  { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  reqPickSub:    { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  reqGroupLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  reqItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  reqItemText:   { flex: 1, color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  selectedReq:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  selectedReqLabel: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  selectedReqHint:  { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  dropZone: { borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', overflow: 'hidden' },
  dropGrad: { padding: 36, alignItems: 'center', gap: 10 },
  dropIconBox: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  dropTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  dropSub:   { color: Colors.textMuted,   fontSize: 13, textAlign: 'center' },
  browseChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, borderWidth: 1, marginTop: 6 },
  browseText: { fontSize: 13, fontWeight: '700' },
  fileCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 14 },
  fileIconBox: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fileInfo:    { flex: 1 },
  fileName:    { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 4, lineHeight: 20 },
  fileMeta:    { color: Colors.textMuted,   fontSize: 12 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16 },
  actionBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  cancelBtn:   { alignItems: 'center', paddingVertical: 12 },
  cancelText:  { color: Colors.textMuted, fontSize: 14 },
  progressWrap: { alignItems: 'center', paddingVertical: 50, gap: 14 },
  progressIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  progressTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700' },
  progressFile:  { color: Colors.textMuted,   fontSize: 13, maxWidth: '80%', textAlign: 'center' },
  barBg:   { width: '100%', height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  pctText: { fontSize: 15, fontWeight: '800' },
  doneWrap:   { alignItems: 'center', paddingVertical: 60, gap: 14 },
  doneCircle: { marginBottom: 8 },
  doneTitle:  { color: Colors.textPrimary, fontSize: 26, fontWeight: '800' },
  doneSub:    { color: Colors.textMuted,   fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
});

// ── Detail page styles ────────────────────────────────────────────────────────
const dp = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bgDeep },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  backBtn:{ width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  topBarCenter: { flex: 1 },
  topBarFileName: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  topBarMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  topBarSub:  { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  topBarRight:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  rootChip:   { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  rootChipText: { color: Colors.white, fontSize: 10, fontWeight: '800' },
  iconBtn:    { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingBottom: 20 },

  hero: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 12 },
  heroIconWrap: { width: 96, height: 96, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, position: 'relative' },
  extBadge: { position: 'absolute', bottom: -6, right: -6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  extBadgeText: { color: Colors.white, fontSize: 9, fontWeight: '900' },
  heroName: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center', lineHeight: 24 },

  section: { paddingHorizontal: 16, marginTop: 12 },
  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },

  metaCard: { backgroundColor: Colors.bgCard, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  div:  { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  metaIconBox: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  metaLabel: { color: Colors.textMuted,   fontSize: 13, width: 108 },
  metaValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },

  viewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, marginBottom: 10 },
  viewBtnText: { color: Colors.white, fontSize: 16, fontWeight: '800' },
  markBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)', backgroundColor: 'rgba(37,99,235,0.08)', marginBottom: 10 },
  markBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  msgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)' },
  msgBtnText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: '600' },

  // Feedback card
  feedbackCard:     { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  feedbackRejected: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  feedbackPending:  { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  feedbackRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedbackStatus:   { fontSize: 12, fontWeight: '700' },
  feedbackNote:     { fontSize: 13, lineHeight: 19 },
  replyBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E8B923', paddingVertical: 10, borderRadius: 12, marginTop: 4 },
  replyBtnText:     { color: '#2C2320', fontSize: 13, fontWeight: '800' },
  reviewCard:       { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  reviewText:       { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  reviewRow:        { flexDirection: 'row', gap: 10 },
  rejectBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DC2626', backgroundColor: 'rgba(220,38,38,0.08)' },
  rejectText:       { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  approveBtn:       { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#16A34A' },
  approveText:      { color: Colors.white, fontSize: 14, fontWeight: '700' },
});

// ── Viewer modal styles ───────────────────────────────────────────────────────
const vw = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },
  bar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  closeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  fileIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, color: Colors.white, fontSize: 13, fontWeight: '600' },
  body:  { flex: 1 },
  loader:{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', gap: 12, zIndex: 5 },
  loaderText: { color: Colors.textMuted, fontSize: 13 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  errorTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  errorSub:   { color: Colors.textMuted,   fontSize: 13, textAlign: 'center' },
  errorClose: { marginTop: 10, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14, backgroundColor: Colors.bgElevated },
  errorCloseText: { color: Colors.textPrimary, fontWeight: '600' },
});

// ── Rename modal styles ───────────────────────────────────────────────────────
const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:    { width: '100%', backgroundColor: Colors.bgCard, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: Colors.border },
  title:   { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 16 },
  input:   { backgroundColor: Colors.bgMid, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20 },
  btnRow:  { flexDirection: 'row', gap: 10 },
  cancelBtn:  { flex: 1, paddingVertical: 13, borderRadius: 13, backgroundColor: Colors.bgElevated, alignItems: 'center' },
  cancelText: { color: Colors.textMuted, fontWeight: '600', fontSize: 15 },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 13, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmText:{ color: Colors.white, fontWeight: '700', fontSize: 15 },
});

// ── Delete confirm styles ─────────────────────────────────────────────────────
const dc = StyleSheet.create({
  iconWrap:   { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  title:      { color: Colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  msg:        { color: Colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  fileName:   { color: Colors.textPrimary, fontWeight: '700' },
  deleteBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 13, backgroundColor: Colors.error },
  deleteBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
});
