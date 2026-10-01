import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated, Modal, Pressable, Platform, Linking, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useSheetStyles } from '../../hooks/useSheetStyles';
import { useResponsive } from '../../hooks/useResponsive';
import { supabase } from '../../lib/supabase';
import { FOLDER_TABLES } from '../../db/documents';

// ─── Folder metadata (FTG brand palette only) ───────────────────────────────
const FOLDER_META: Record<string, { label: string; color: string; icon: string }> = {
  tax_client_uploads:     { label: 'Client Uploads',  color: '#E8B923', icon: 'cloud-upload-outline'      },
  tax_additional_docs:    { label: 'Additional Tax Docs', color: '#E8B923', icon: 'folder-outline'        },
  tax_contracts:          { label: 'Tax Contracts',   color: '#B5905B', icon: 'document-text-outline'     },
  tax_invoices:           { label: 'Tax Invoices',    color: '#E8B923', icon: 'receipt-outline'            },
  tax_return_information: { label: 'Tax Returns',     color: '#B5905B', icon: 'information-circle-outline' },
  tax_prior_returns:      { label: 'Previous Tax Returns',      color: '#E8B923', icon: 'document-attach-outline' },
  tax_prior_transcripts:  { label: 'Previous Year Transcripts', color: '#B5905B', icon: 'reader-outline'          },
  bk_contracts:           { label: 'BK Contracts',    color: '#2C2320', icon: 'document-text-outline'     },
  bk_invoices:            { label: 'BK Invoices',     color: '#E8B923', icon: 'receipt-outline'            },
  bk_bank_accounts:       { label: 'Bank Accounts',      color: '#2C2320', icon: 'card-outline'           },
  bk_final_pnl:           { label: 'Additional BK Docs', color: '#2C2320', icon: 'folder-outline'         },
  bk_mr_required_info:    { label: 'Monthly Reporting (Required Info)',     color: '#E8B923', icon: 'cloud-upload-outline' },
  bk_mr_client_review:    { label: 'Monthly Reporting (For Client Review)', color: '#B5905B', icon: 'eye-outline'          },
  bk_mr_final_statements: { label: 'Monthly Reporting (Final Statements)',  color: '#E8B923', icon: 'ribbon-outline'       },
  cfo_contracts:          { label: 'CFO Contracts',   color: '#B5905B', icon: 'document-text-outline'     },
  cfo_invoices:           { label: 'CFO Invoices',    color: '#E8B923', icon: 'receipt-outline'           },
  cfo_additional_docs:    { label: 'Additional CFO Docs', color: '#B5905B', icon: 'folder-outline'        },
  cfo_mr_required_info:   { label: 'Monthly Reporting (Required Info)',     color: '#E8B923', icon: 'cloud-upload-outline' },
  cfo_mr_client_review:   { label: 'Monthly Reporting (For Client Review)', color: '#B5905B', icon: 'eye-outline'          },
  cfo_mr_final_statements:{ label: 'Monthly Reporting (Final Statements & Insights)',  color: '#E8B923', icon: 'ribbon-outline' },
};

// Group folder tables into the three categories for the segregated breakdown.
// The four categories a client is assigned to, in the spec's order. YER has
// no folder tables yet — its prefix is spoken for so files land in the right
// place the day they exist, but until then nothing matches it.
type CategoryKey = 'TAX' | 'YER' | 'BK' | 'CFO';
const CATEGORIES: { key: CategoryKey; title: string; color: string; icon: string; match: (t: string) => boolean }[] = [
  { key: 'TAX', title: 'Tax Documents & Returns', color: '#00B16A', icon: 'reader-outline',   match: t => t.startsWith('tax_') },
  { key: 'YER', title: 'Year-End Review',         color: '#4A3E3E', icon: 'calendar-outline', match: t => t.startsWith('yer_') },
  { key: 'BK',  title: 'Bookkeeping & Financials', color: '#008C5A', icon: 'calculator-outline', match: t => t.startsWith('bk_') },
  { key: 'CFO', title: 'CFO Advisory',             color: '#B5905B', icon: 'trending-up-outline', match: t => t.startsWith('cfo_') },
];

// Bar colours for the chart. Kept apart from CATEGORIES because those colours
// also tint icons and pills elsewhere on the screen, where a pale beige would
// read as disabled.
const CHART_COLORS: Record<CategoryKey, string> = {
  TAX: '#D8CCB4',
  YER: '#4A3E3E',
  BK:  '#A8A29A',
  CFO: '#C9A75C',
};


// File extension colors (FTG palette)
const EXT_COLORS: Record<string, string> = {
  PDF: '#2C2320',
  DOC: '#B5905B', DOCX: '#B5905B',
  XLS: '#E8B923', XLSX: '#E8B923',
  PNG: '#B5905B', JPG: '#B5905B', JPEG: '#B5905B',
  PPT: '#E8B923', PPTX: '#E8B923',
};

// Rows shown per page in each upload column. Both columns use it, so the two
// stay the same height however lopsided the split is.
const UPLOADS_PER_PAGE = 5;

// ─── Types ───────────────────────────────────────────────────────────────────
interface Stats {
  totalClients:  number;
  totalStaff:    number;
  // How many clients hold each service. One client can hold several, so these
  // do not add up to totalClients.
  clientsByService: Record<CategoryKey, number>;
  totalDocs:     number;
  newDocs:       number;
  docsThisWeek:  number;
  folderCounts:  { table: string; count: number }[];
  // Every document's table, date and owner, and nothing else — the progress
  // cards count from this. Counting from recentUploads capped the totals at
  // its 60-row slice, which quietly wrong-footed busy months.
  docMeta:       { table: string; created_at: string; email: string }[];
  // Which services each client is assigned (keyed by lower-cased email), and
  // their display name. The progress cards count by assignment, and the
  // upload rows are labelled by client, as the spec asks — not by address.
  svcByEmail:    Record<string, string[]>;
  nameByEmail:   Record<string, string>;
  // The two snapshot tiles: client files waiting on us, and our deliverables
  // waiting on a client.
  pendingFtg:    number;
  forReview:     number;
  // uploaded_by_role is null on rows that predate the column; those were all
  // client uploads, which is what the read paths elsewhere assume too.
  recentUploads: { id: string; name: string; email: string; created_at: string; document_type: string; document_url: string; uploaded_by_role?: string | null; subfolder_id?: string | null }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// ─── Pulsing dot component ────────────────────────────────────────────────────
function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.6, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,   duration: 0,   useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0,   useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={s.pulseContainer}>
      <Animated.View style={[s.pulseRing, { transform: [{ scale }], opacity }]} />
      <View style={s.pulseDot} />
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
type RecentDoc = Stats['recentUploads'][number];
type TimePeriod = 'today' | 'week' | 'month' | 'year';

const PERIOD_OPTIONS: { key: TimePeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year',  label: 'This Year' },
];

function getPeriodStart(period: TimePeriod): string {
  const now = new Date();
  if (period === 'today') {
    now.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = now.getDay();
    now.setDate(now.getDate() - day);
    now.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
  } else {
    now.setMonth(0, 1);
    now.setHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

export function AdminDashboardScreen({ onViewAllDocuments }: { onViewAllDocuments?: () => void }) {
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin    = user?.role === 'admin';
  const sheet      = useSheetStyles('sm');
  const insets     = useSafeAreaInsets();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [stats, setStats]           = useState<Stats>({ totalClients: 0, totalStaff: 0, clientsByService: { TAX: 0, YER: 0, BK: 0, CFO: 0 }, svcByEmail: {}, nameByEmail: {}, pendingFtg: 0, forReview: 0, totalDocs: 0, newDocs: 0, docsThisWeek: 0, folderCounts: [], docMeta: [], recentUploads: [] });
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuDoc, setMenuDoc]       = useState<RecentDoc | null>(null);
  const [period, setPeriod]         = useState<TimePeriod>('month');
  const [periodOpen, setPeriodOpen] = useState(false);
  // Which page each upload column is showing. Both sides page independently,
  // so a long client list does not drag the internal one along with it.
  const [uploadPage, setUploadPage] = useState<Record<string, number>>({});
  // Which chart bar the pointer is over, for the tooltip.
  const [hoverBar, setHoverBar]     = useState<CategoryKey | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    // No setLoading(true) — show existing content immediately
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }, 8000);
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [clientRes, staffRes, ...tableResults] = await Promise.all([
        // Rows rather than a head-count, so the same request also answers how
        // many clients each service has, and what to call them on a row.
        supabase.from('profiles').select('id, services, email, full_name').eq('role', 'client'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['staff', 'admin']),
        ...FOLDER_TABLES.map(t => supabase.from(t).select('id, name, email, created_at, status, document_url, uploaded_by_role, approval_status, subfolder_id').order('created_at', { ascending: false })),
      ]);
      const allDocs = tableResults.flatMap((r, i) => (r.data ?? []).map(d => ({ ...d, document_type: FOLDER_TABLES[i] })));
      // Clients per service. A client on both BK and CFO counts in both, so
      // these figures deliberately sum to more than the client total.
      const clientRows = (clientRes.data ?? []) as { services?: string[] | null; email?: string | null; full_name?: string | null }[];
      const clientsPerService = (svc: string) =>
        clientRows.filter(c => (c.services ?? ['BK']).includes(svc)).length;

      const svcByEmail: Record<string, string[]> = {};
      const nameByEmail: Record<string, string> = {};
      clientRows.forEach(c => {
        const key = (c.email ?? '').toLowerCase();
        if (!key) return;
        svcByEmail[key]  = c.services ?? ['BK'];
        nameByEmail[key] = c.full_name ?? '';
      });

      // The two snapshot tiles, split on who put the file there — a pending
      // client upload waits on FTG, a pending staff upload waits on the client.
      const pendingDocs = allDocs.filter(d => (d.approval_status ?? 'approved') === 'pending');
      const isInternalRole = (r?: string | null) => r === 'staff' || r === 'admin';

      if (mountedRef.current) setStats({
        totalClients:  clientRows.length,
        totalStaff:    staffRes.count ?? 0,
        clientsByService: {
          TAX: clientsPerService('TAX'),
          YER: clientsPerService('YER'),
          BK:  clientsPerService('BK'),
          CFO: clientsPerService('CFO'),
        },
        svcByEmail,
        nameByEmail,
        pendingFtg: pendingDocs.filter(d => !isInternalRole(d.uploaded_by_role)).length,
        forReview:  pendingDocs.filter(d => isInternalRole(d.uploaded_by_role)).length,
        totalDocs:     allDocs.length,
        newDocs:       allDocs.filter(d => d.status === 'new').length,
        docsThisWeek:  allDocs.filter(d => d.created_at >= weekAgo).length,
        folderCounts:  FOLDER_TABLES.map((table, i) => ({ table, count: tableResults[i].data?.length ?? 0 })),
        docMeta:       allDocs.map(d => ({ table: d.document_type ?? '', created_at: d.created_at, email: (d.email ?? '').toLowerCase() })),
        // Enough to page through on both sides of the split, not so many that
        // the whole list is held in memory for a dashboard panel.
        recentUploads: [...allDocs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 60) as any,
      });
    } catch (e) { console.error(e); }
    finally { clearTimeout(safetyTimer); if (mountedRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => { if (!authLoading && user?.id) load(); }, [authLoading, user?.id]);

  const periodStart = useMemo(() => getPeriodStart(period), [period]);

  // The four progress cards, counted by assignment as the spec asks:
  //   TOTAL   — clients assigned to the category.
  //   STARTED — of those, how many have at least one document in that
  //             category's folders within the chosen period.
  // "Started" is not stored anywhere, so this is its observable reading. YER
  // has no folder tables yet, so its started count sits at 0 until they exist.
  const progressByCategory = useMemo(() =>
    CATEGORIES.map(cat => {
      const started = new Set<string>();
      stats.docMeta.forEach(d => {
        if (!d.email || d.created_at < periodStart) return;
        if (!cat.match(d.table)) return;
        if ((stats.svcByEmail[d.email] ?? []).includes(cat.key)) started.add(d.email);
      });
      return { ...cat, started: started.size, total: stats.clientsByService[cat.key] ?? 0 };
    }),
  [stats, periodStart]);

  // The two snapshot tiles the spec names: client files waiting on FTG, and
  // FTG deliverables waiting on a client.
  const sideCards = [
    { value: stats.pendingFtg, label: 'DOCUMENTS PENDING\nFTG APPROVAL' },
    { value: stats.forReview,  label: 'DOCUMENTS FOR\nCLIENT REVIEW' },
  ];

  // The feed splits on whether the file has been filed into a folder yet —
  // the same reading of sorted the Documents tab uses. Who uploaded it stays
  // as the tag on each row.
  const sortedUploads   = stats.recentUploads.filter(d => !!d.subfolder_id);
  const unsortedUploads = stats.recentUploads.filter(d => !d.subfolder_id);

  /** The client's name for a row, falling back to the address for strays. */
  const labelFor = (email: string | null | undefined) =>
    stats.nameByEmail[(email ?? '').toLowerCase()] || email || 'Unknown client';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>

      {/* ══════════════════════════════════════════════════════
          HERO HEADER — dark emerald gradient
      ══════════════════════════════════════════════════════ */}
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 18 }]}
      >
        {/* Subtle grid overlay */}
        <View style={s.headerOverlay} pointerEvents="none" />

        <View style={s.headerContent}>
          {/* Left — greeting (name + role-aware subtitle) */}
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>Welcome back,</Text>
            <Text style={s.adminName}>{user?.name?.split(' ')[0] || (isAdmin ? 'Admin' : 'Team')}</Text>
            <View style={s.statusRow}>
              <PulsingDot />
              <Text style={s.statusText}>
                {isAdmin ? 'All systems operational' : 'Staff Portal · Finance Therapy Group'}
              </Text>
            </View>
          </View>

          {/* Right — FTG favicon logo (floating) */}
          <View style={s.adminBadge}>
            <Image
              source={require('../../../assets/favicon.png')}
              style={{ width: 80, height: 80 }}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Decorative circles */}
        <View style={s.decorCircle1} pointerEvents="none" />
        <View style={s.decorCircle2} pointerEvents="none" />
      </LinearGradient>

      {/* ══════════════════════════════════════════════════════
          BODY
      ══════════════════════════════════════════════════════ */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#E8B923" size="large" />
          <Text style={s.loadingText}>Loading dashboard…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#E8B923"
            />
          }
        >

          {/* ── OVERVIEW, with the period the figures cover ──
              The picker sits here rather than below, because the cards that
              follow are what it changes. */}
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionLabel}>OVERVIEW</Text>
            <TouchableOpacity style={s.sectionAction} onPress={() => setPeriodOpen(true)}>
              <Ionicons name="calendar-outline" size={13} color="#E8B923" />
              <Text style={[s.sectionActionText, { color: '#E8B923' }]}>
                {PERIOD_OPTIONS.find(p => p.key === period)?.label}
              </Text>
              <Ionicons name="chevron-down" size={12} color="#E8B923" />
            </TouchableOpacity>
          </View>

          {/* ── One row: a progress card per category, then two tiles ──
              Per the spec: counts by client assignment. The big figure is
              how many of the category's clients have started in the chosen
              period; the denominator, how many it has in all. */}
          <View style={s.progressRow}>
            {progressByCategory.map(group => (
              <View key={group.key} style={s.progressCard}>
                <View style={s.progressHead}>
                  <Text style={s.progressHeadText}>
                    {PERIOD_OPTIONS.find(p => p.key === period)?.label.toUpperCase()}
                  </Text>
                  <View style={[s.progressHeadIcon, { backgroundColor: group.color + '20' }]}>
                    <Ionicons name={group.icon as any} size={11} color={group.color} />
                  </View>
                </View>

                <Text style={s.progressTitle} numberOfLines={2}>{group.key} CLIENT PROGRESS</Text>

                {/* The figure is near-black and the denominator carries the
                    category's colour, so the eye lands on the count first. */}
                <View style={s.progressFigure}>
                  <View>
                    <Text style={s.progressStartedLabel}>STARTED</Text>
                    <Text style={s.progressValue}>{group.started}</Text>
                  </View>
                  <View>
                    <Text style={[s.progressOf, { color: group.color }]}>/{group.total}</Text>
                    <Text style={s.progressOfLabel}>TOTAL</Text>
                  </View>
                </View>
              </View>
            ))}

            {/* Narrow tiles — a figure and what it counts, nothing else */}
            <View style={s.sideCol}>
              {sideCards.map(tile => (
                <View key={tile.label} style={s.sideCard}>
                  <Text style={s.sideValue}>{tile.value}</Text>
                  <Text style={s.sideLabel}>{tile.label}</Text>
                </View>
              ))}
            </View>
          </View>


          {/* Period picker modal */}
          <Modal visible={periodOpen} transparent animationType="fade" onRequestClose={() => setPeriodOpen(false)}>
            <Pressable style={{ flex: 1 }} onPress={() => setPeriodOpen(false)}>
              <View style={s.periodDropdown}>
                {PERIOD_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.periodOption, period === opt.key && s.periodOptionActive]}
                    onPress={() => { setPeriod(opt.key); setPeriodOpen(false); }}
                  >
                    <Text style={[s.periodOptionText, period === opt.key && { color: '#E8B923', fontWeight: '700' }]}>
                      {opt.label}
                    </Text>
                    {period === opt.key && <Ionicons name="checkmark" size={14} color="#E8B923" />}
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>


          {/* ── RECENT UPLOADS — a centred heading over the two columns ── */}
          <View style={s.uploadsHeader}>
            <View style={{ flex: 1 }} />
            <Text style={s.uploadsHeading}>RECENT UPLOADS</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TouchableOpacity style={s.sectionAction} onPress={onViewAllDocuments}>
                <Text style={s.sectionActionText}>View All</Text>
                <Text style={s.viewAllArrow}> ›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── The chart, then the two upload columns beside it ── */}
          <View style={s.uploadCols}>

            {/* Clients per service. Bars are drawn to the tallest one. */}
            <View style={s.chartCard}>
              <Text style={s.chartTitle}>CLIENTS BY SERVICE</Text>
              <View style={s.chartPlot}>
                {CATEGORIES.map(cat => {
                  const value = stats.clientsByService[cat.key] ?? 0;
                  const tallest = Math.max(1, ...Object.values(stats.clientsByService));
                  const hovered = hoverBar === cat.key;
                  return (
                    <View key={cat.key} style={s.chartCol}>
                      <Text style={s.chartValue}>{value}</Text>

                      <View style={s.chartBarTrack}>
                        {/* Hover tooltip. Web only — there is no pointer to
                            hover with on a touch screen. */}
                        {hovered && (
                          <View style={s.chartTip} pointerEvents="none">
                            <Text style={s.chartTipTitle}>{cat.key}</Text>
                            <Text style={s.chartTipValue}>Clients: {value}</Text>
                          </View>
                        )}
                        <Pressable
                          style={{ flex: 1, justifyContent: 'flex-end' }}
                          onHoverIn={() => setHoverBar(cat.key)}
                          onHoverOut={() => setHoverBar(null)}
                        >
                          <View
                            style={[
                              s.chartBar,
                              { height: `${Math.max(2, (value / tallest) * 100)}%`, backgroundColor: CHART_COLORS[cat.key] },
                              hovered && s.chartBarOn,
                            ]}
                          />
                        </Pressable>
                      </View>

                      <Text style={s.chartAxis}>{cat.key}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {stats.recentUploads.length === 0 ? (
              <View style={[s.emptyCard, { flex: 2 }]}>
                <View style={s.emptyIconWrap}>
                  <Ionicons name="cloud-upload-outline" size={32} color="#E8B923" />
                </View>
                <Text style={s.emptyTitle}>No uploads yet</Text>
                <Text style={s.emptyText}>Documents uploaded by clients will appear here.</Text>
              </View>
            ) : (
              <>
              {[
                { title: 'SORTED',   rows: sortedUploads },
                { title: 'UNSORTED', rows: unsortedUploads },
              ].map(col => {
                // Both columns show the same number of rows, so they stay the
                // same height whichever side has more.
                const page      = uploadPage[col.title] ?? 0;
                const pageCount = Math.max(1, Math.ceil(col.rows.length / UPLOADS_PER_PAGE));
                const safePage  = Math.min(page, pageCount - 1);
                const pageRows  = col.rows.slice(safePage * UPLOADS_PER_PAGE, safePage * UPLOADS_PER_PAGE + UPLOADS_PER_PAGE);
                const step = (by: number) =>
                  setUploadPage(p => ({ ...p, [col.title]: Math.min(pageCount - 1, Math.max(0, safePage + by)) }));

                return (
                <View key={col.title} style={s.uploadCol}>
                  <Text style={s.uploadColTitle}>{col.title}</Text>

                  {col.rows.length === 0 ? (
                    <View style={s.uploadColEmpty}>
                      <Text style={s.uploadColEmptyText}>Nothing here yet</Text>
                    </View>
                  ) : (
                    <View style={s.card}>
                      {pageRows.map((doc, i) => {
                        const meta     = FOLDER_META[doc.document_type] ?? { label: doc.document_type, color: '#E8B923', icon: 'document-outline' };
                        const ext      = doc.name.split('.').pop()?.toUpperCase().slice(0, 4) ?? 'FILE';
                        const extColor = EXT_COLORS[ext] ?? meta.color;
                        const isLast   = i === pageRows.length - 1;
                        // Legacy rows have no uploaded_by_role; those were client uploads.
                        const isInternal = doc.uploaded_by_role === 'staff' || doc.uploaded_by_role === 'admin';
                        return (
                          <View key={i}>
                            <View style={s.recentRow}>
                              {/* File extension badge */}
                              <View style={[s.extBox, { backgroundColor: extColor + '18' }]}>
                                <Text style={[s.extText, { color: extColor }]}>{ext}</Text>
                              </View>

                              {/* File info */}
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={s.recentName} numberOfLines={1}>{doc.name}</Text>
                                <View style={s.recentMetaRow}>
                                  <Ionicons name="person-outline" size={10} color="#94A3B8" />
                                  {/* The client's name, as the spec asks —
                                      the address only for strays with no
                                      profile to name them. */}
                                  <Text style={s.recentEmail} numberOfLines={1}>{labelFor(doc.email)}</Text>
                                </View>
                                {/* Folder chip, and who put the file there */}
                                <View style={s.recentMetaRow}>
                                  <View style={[s.folderChip, { backgroundColor: meta.color + '15', borderColor: meta.color + '40' }]}>
                                    <Text style={[s.folderChipText, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
                                  </View>
                                  <View style={[s.originChip, isInternal ? s.originInternal : s.originClient]}>
                                    <Text style={[s.originText, isInternal ? s.originTextInternal : s.originTextClient]}>
                                      {isInternal ? 'INTERNAL UPLOAD' : 'CLIENT UPLOAD'}
                                    </Text>
                                  </View>
                                </View>
                              </View>

                              {/* Right — date + menu */}
                              <View style={s.recentRight}>
                                <Text style={s.recentDate}>{fmtDate(doc.created_at)}</Text>
                                <Text style={s.recentTime}>{fmtTime(doc.created_at)}</Text>
                                <TouchableOpacity style={s.moreBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={() => setMenuDoc(doc)}>
                                  <Ionicons name="ellipsis-vertical" size={15} color="#94A3B8" />
                                </TouchableOpacity>
                              </View>
                            </View>
                            {!isLast && <View style={s.divider} />}
                          </View>
                        );
                      })}

                      {/* Pager — only once there is more than one page */}
                      {pageCount > 1 && (
                        <View style={s.pager}>
                          <TouchableOpacity
                            style={[s.pagerBtn, safePage === 0 && s.pagerBtnOff]}
                            onPress={() => step(-1)}
                            disabled={safePage === 0}
                          >
                            <Ionicons name="chevron-back" size={14} color={safePage === 0 ? '#C9BDB0' : '#3A3131'} />
                            <Text style={[s.pagerText, safePage === 0 && s.pagerTextOff]}>Back</Text>
                          </TouchableOpacity>

                          <Text style={s.pagerCount}>{safePage + 1} / {pageCount}</Text>

                          <TouchableOpacity
                            style={[s.pagerBtn, safePage >= pageCount - 1 && s.pagerBtnOff]}
                            onPress={() => step(1)}
                            disabled={safePage >= pageCount - 1}
                          >
                            <Text style={[s.pagerText, safePage >= pageCount - 1 && s.pagerTextOff]}>Next</Text>
                            <Ionicons name="chevron-forward" size={14} color={safePage >= pageCount - 1 ? '#C9BDB0' : '#3A3131'} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
                );
              })}
              </>
            )}
          </View>

          {/* Bottom breathing room */}
          <View style={{ height: 12 }} />
        </ScrollView>
      )}

      {/* ── Document action menu ── */}
      <Modal visible={!!menuDoc} transparent animationType="slide" onRequestClose={() => setMenuDoc(null)}>
        <Pressable style={[s.menuOverlay, sheet.overlay]} onPress={() => setMenuDoc(null)}>
          <Pressable style={[s.menuSheet, sheet.sheet]} onPress={() => {}}>
            <View style={s.menuHandle} />
            <Text style={s.menuFileName} numberOfLines={1}>{menuDoc?.name}</Text>
            <Text style={s.menuEmail}>{menuDoc?.email}</Text>

            <View style={s.menuDivider} />

            <TouchableOpacity style={s.menuItem} onPress={() => {
              if (menuDoc?.document_url) {
                Platform.OS === 'web'
                  ? window.open(menuDoc.document_url, '_blank')
                  : Linking.openURL(menuDoc.document_url);
              }
              setMenuDoc(null);
            }}>
              <View style={[s.menuItemIcon, { backgroundColor: 'rgba(232,185,35,0.12)' }]}>
                <Ionicons name="eye-outline" size={18} color="#E8B923" />
              </View>
              <Text style={s.menuItemText}>View Document</Text>
              <Ionicons name="chevron-forward" size={16} color="#A8998A" />
            </TouchableOpacity>

            {/* "Download" and "Go to Documents" used to sit here. The first
                had the same handler as View Document, word for word; the
                second did what the screen's own View All link does, without
                even carrying the document along. */}

            <View style={s.menuDivider} />

            <TouchableOpacity style={s.menuItem} onPress={() => setMenuDoc(null)}>
              <Text style={[s.menuItemText, { color: '#A8998A', flex: 1, textAlign: 'center' }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  // ── Root ──────────────────────────────────────────────
  root:   { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#64748B', fontSize: 14, fontWeight: '500' },

  // ── Hero header ───────────────────────────────────────
  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.04,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greeting: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  adminName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 3,
    letterSpacing: -0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
  },
  pulseContainer: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E8B923',
    position: 'absolute',
  },
  pulseRing: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#E8B923',
    position: 'absolute',
  },
  statusText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Admin badge — just the image, no background
  adminBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminBadgeInner: {
    backgroundColor: 'rgba(232,185,35,0.12)',
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  adminBadgeLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 2,
  },

  // Decorative circles in header
  decorCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(232,185,35,0.06)',
    top: -60,
    right: -40,
    pointerEvents: 'none',
  } as any,
  decorCircle2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(232,185,35,0.05)',
    bottom: -30,
    left: 60,
    pointerEvents: 'none',
  } as any,

  // ── Scroll ────────────────────────────────────────────
  scroll: {
    padding: 16,
    gap: 10,
  },

  // ── Section header row ────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -4,
  },
  sectionLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionActionText: {
    color: '#E8B923',
    fontSize: 12,
    fontWeight: '600',
  },
  viewAllArrow: {
    color: '#E8B923',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 16,
  },

  // ── 3-card fixed row (no scroll) ─────────────────────
  cardRow: {
    flexDirection: 'row',
    gap: 10,
  },

  // ── The two narrow tiles beside the category cards ────
  // The tiles stack to the same height as a card beside them.
  sideCol: {
    gap: 8,
    height: 132,
    justifyContent: 'space-between',
  },
  sideCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderColor: '#1C1713',
    borderWidth: 2,
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sideValue: {
    color: '#2C2320',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sideLabel: {
    flex: 1,
    color: '#6B5E52',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 12,
  },

  // ── Shared white card ─────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 6,
    overflow: 'hidden',
  },

  // ── Category card (segregated folder breakdown) ───────
  catCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 6,
    overflow: 'hidden',
  },
  // Desktop: lay the category cards out as a 3-column grid.
  catGrid:        { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  catCardDesktop: { flexBasis: '31.5%', flexGrow: 1, marginHorizontal: 6 },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  catBadge: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  catTitle: { color: '#111827', fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  catSub:   { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginTop: 1 },
  catTotalPill: {
    flexDirection: 'row', alignItems: 'baseline', gap: 3,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  catTotalNum:   { fontSize: 15, fontWeight: '800' },
  catTotalLabel: { fontSize: 10, fontWeight: '700' },
  catDivider: { height: 1, backgroundColor: '#F1F5F9' },

  // ── Shared divider ────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 16,
  },

  // ── Folder row ────────────────────────────────────────
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  // Indented subfolder row (Monthly Reporting children)
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 42, paddingRight: 16, paddingVertical: 10,
    gap: 10,
    backgroundColor: '#FAFAF8',
  },
  // Deeper level — required items inside Required Info
  subSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 64, paddingRight: 16, paddingVertical: 9,
    gap: 10,
    backgroundColor: '#F4F4F0',
  },
  subDot:   { width: 7, height: 7, borderRadius: 4 },
  subLabel: { flex: 1, flexShrink: 1, color: '#374151', fontSize: 12.5, fontWeight: '500' },
  folderIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,          // take available width; full label shows (wraps if long)
    flexShrink: 1,
  },
  barTrack: {
    width: 90,        // fixed-width bar so the label gets the flexible space
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 10,
  },
  folderCount: {
    fontSize: 13,
    fontWeight: '700',
    width: 22,
    textAlign: 'right',
  },

  // ── Recent upload row ─────────────────────────────────
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 10,
  },
  extBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  extText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  recentName: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  recentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  recentEmail: {
    color: '#94A3B8',
    fontSize: 11,
    flex: 1,
  },
  folderChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  folderChipText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Category total cards ──────────────────────────────
  // Cards keep their own size; the row spreads them out rather than stretching
  // any one of them to fill the space.
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 12,
  },
  // Squarer than wide, as the mock draws them — a fixed height with the figure
  // sitting high and space left under it, rather than a letterbox strip.
  // Roughly square, as the mock draws them. A fixed width rather than a share
  // of the row, or three cards stretch into letterbox strips on a wide screen.
  progressCard: {
    width: 285,
    height: 132,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#1C1713',
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 6,
    padding: 12,
    gap: 6,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F0E8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginHorizontal: -4,
    marginTop: -4,
  },
  progressHeadText: {
    color: '#A8998A',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  progressHeadIcon: {
    width: 20, height: 20, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  progressTitle: {
    color: '#3A3131',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    lineHeight: 13,
  },
  // Big figure, with the denominator smaller beside it — as the mock reads.
  progressFigure: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  progressValue: {
    color: '#1C1713',
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 46,
  },
  progressStartedLabel: {
    color: '#A8998A',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressOf: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  progressOfLabel: {
    color: '#A8998A',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Recent uploads, two columns ───────────────────────
  uploadsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  uploadsHeading: {
    color: '#A8998A',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // ── Clients-by-service chart ──────────────────────────
  chartCard: {
    // Narrower than an upload column, as the mock has it.
    flex: 0.8,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#1C1713',
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 6,
    padding: 14,
    gap: 12,
  },
  chartTitle: {
    color: '#1C1713',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  chartPlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    minHeight: 330,
    gap: 10,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    gap: 4,
  },
  chartValue: {
    color: '#6B5E52',
    fontSize: 11,
    fontWeight: '700',
  },
  // The track is what gives each bar its full height to grow inside.
  chartBarTrack: {
    flex: 1,
    width: '70%',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  chartBarOn: {
    opacity: 0.82,
  },
  // Sits above the bar it belongs to, centred on the column.
  chartTip: {
    position: 'absolute',
    bottom: '100%',
    alignSelf: 'center',
    marginBottom: 6,
    backgroundColor: '#1C1713',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 10,
  },
  chartTipTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  chartTipValue: {
    color: '#E8E0D0',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  chartAxis: {
    color: '#6B5E52',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  uploadCols: {
    flexDirection: 'row',
    gap: 12,
    // Stretch, so the chart and both columns end level rather than each
    // stopping wherever its own content runs out.
    alignItems: 'stretch',
  },
  uploadCol: {
    flex: 1,
    minWidth: 0,
    gap: 8,
    // The list inside grows to fill, so the pager sits at the bottom of the
    // column rather than floating just under the last row.
    justifyContent: 'flex-start',
  },
  uploadColTitle: {
    color: '#6B5E52',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  // ── Pager under each upload column ────────────────────
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F2EDE3',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: '#F5F0E8',
  },
  pagerBtnOff: { backgroundColor: 'transparent' },
  pagerText: {
    color: '#3A3131',
    fontSize: 11,
    fontWeight: '700',
  },
  pagerTextOff: { color: '#C9BDB0' },
  pagerCount: {
    color: '#A8998A',
    fontSize: 11,
    fontWeight: '600',
  },

  // Fills the column so an empty side still ends level with the full one.
  uploadColEmpty: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E0D0',
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 6,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadColEmptyText: {
    color: '#A8998A',
    fontSize: 12,
  },

  // Who put the file in the folder: the client, or one of us.
  originChip: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  originInternal: { backgroundColor: '#E8B923' },
  originClient:   { backgroundColor: '#DBEAFE' },
  originText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  originTextInternal: { color: '#3A3131' },
  originTextClient:   { color: '#1E40AF' },
  recentRight: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  recentDate: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  recentTime: {
    color: '#94A3B8',
    fontSize: 10,
  },
  moreBtn: {
    marginTop: 4,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#F8FAFC',
  },

  // ── Empty state ───────────────────────────────────────
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 220,
    lineHeight: 20,
  },

  // ── Action menu ───────────────────────────────────────
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28,23,19,0.5)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    gap: 4,
  },
  menuHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E8E0D0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  menuFileName: {
    color: '#1C1713',
    fontSize: 15,
    fontWeight: '700',
  },
  tagFileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 4 },
  tagFileIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(181,144,91,0.12)', alignItems: 'center', justifyContent: 'center' },
  tagFileName: { color: '#111827', fontSize: 13.5, fontWeight: '600' },
  tagFileMeta: { color: '#94A3B8', fontSize: 11, marginTop: 1 },
  tagFileStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagFileStatusText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  menuEmail: {
    color: '#A8998A',
    fontSize: 12,
    marginBottom: 4,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F2EDE3',
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 4,
  },
  menuItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    color: '#1C1713',
    fontSize: 15,
    fontWeight: '500',
  },

  // Period picker dropdown
  periodDropdown: {
    position: 'absolute',
    top: 180,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E0D0',
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
    minWidth: 160,
    overflow: 'hidden',
  },
  periodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F2EDE3',
  },
  periodOptionActive: {
    backgroundColor: '#FEF9E7',
  },
  periodOptionText: {
    fontSize: 14,
    color: '#1C1713',
    fontWeight: '500',
  },
});
