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
  tax_required_documents: { label: 'Required Documents', color: '#E8B923', icon: 'cloud-upload-outline'   },
  tax_contracts:          { label: 'Tax Contracts',   color: '#B5905B', icon: 'document-text-outline'     },
  tax_invoices:           { label: 'Tax Invoices',    color: '#E8B923', icon: 'receipt-outline'            },
  tax_return_information: { label: 'Returns',         color: '#B5905B', icon: 'information-circle-outline' },
  tax_additional_docs:    { label: 'Additional Tax Docs', color: '#E8B923', icon: 'folder-outline'        },
  bk_required_documents:  { label: 'Required Documents', color: '#E8B923', icon: 'cloud-upload-outline'   },
  bk_contracts:           { label: 'BK Contracts',    color: '#2C2320', icon: 'document-text-outline'     },
  bk_invoices:            { label: 'BK Invoices',     color: '#E8B923', icon: 'receipt-outline'            },
  bk_for_client_review:   { label: 'Client Review',   color: '#B5905B', icon: 'eye-outline'               },
  bk_final_pnl:           { label: 'Final P&L',       color: '#2C2320', icon: 'bar-chart-outline'         },
  bk_mr_required_info:    { label: 'Monthly Reporting (Required Info)',     color: '#E8B923', icon: 'cloud-upload-outline' },
  bk_mr_client_review:    { label: 'Monthly Reporting (For Client Review)', color: '#B5905B', icon: 'eye-outline'          },
  bk_mr_final_statements: { label: 'Monthly Reporting (Final Statements)',  color: '#E8B923', icon: 'ribbon-outline'       },
  cfo_contracts:          { label: 'CFO Contracts',   color: '#B5905B', icon: 'document-text-outline'     },
  cfo_invoices:           { label: 'CFO Invoices',    color: '#E8B923', icon: 'receipt-outline'           },
  cfo_additional_docs:    { label: 'Additional CFO Docs', color: '#B5905B', icon: 'folder-outline'        },
  cfo_mr_required_info:   { label: 'Monthly Reporting (Required Info)',     color: '#E8B923', icon: 'cloud-upload-outline' },
  cfo_mr_client_review:   { label: 'Monthly Reporting (For Client Review)', color: '#B5905B', icon: 'eye-outline'          },
  cfo_mr_final_statements:{ label: 'Monthly Reporting (Final Statements)',  color: '#E8B923', icon: 'ribbon-outline'       },
};

// Group folder tables into the three categories for the segregated breakdown.
type CategoryKey = 'TAX' | 'BK' | 'CFO';
const CATEGORIES: { key: CategoryKey; title: string; color: string; icon: string; match: (t: string) => boolean }[] = [
  { key: 'TAX', title: 'Tax Documents & Returns', color: '#00B16A', icon: 'reader-outline',   match: t => t.startsWith('tax_') },
  { key: 'BK',  title: 'Bookkeeping & Financials', color: '#008C5A', icon: 'calculator-outline', match: t => t.startsWith('bk_') },
  { key: 'CFO', title: 'CFO Advisory',             color: '#B5905B', icon: 'trending-up-outline', match: t => t.startsWith('cfo_') },
];

function categoryOf(table: string): CategoryKey {
  return (CATEGORIES.find(c => c.match(table))?.key ?? 'TAX');
}

// File extension colors (FTG palette)
const EXT_COLORS: Record<string, string> = {
  PDF: '#2C2320',
  DOC: '#B5905B', DOCX: '#B5905B',
  XLS: '#E8B923', XLSX: '#E8B923',
  PNG: '#B5905B', JPG: '#B5905B', JPEG: '#B5905B',
  PPT: '#E8B923', PPTX: '#E8B923',
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface Stats {
  totalClients:  number;
  totalStaff:    number;
  totalDocs:     number;
  newDocs:       number;
  docsThisWeek:  number;
  folderCounts:  { table: string; count: number }[];
  recentUploads: { id: string; name: string; email: string; created_at: string; document_type: string; document_url: string }[];
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
  const sheet      = useSheetStyles('sm');
  const { isDesktop } = useResponsive();   // 3-column category grid on desktop
  const insets     = useSafeAreaInsets();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [stats, setStats]           = useState<Stats>({ totalClients: 0, totalStaff: 0, totalDocs: 0, newDocs: 0, docsThisWeek: 0, folderCounts: [], recentUploads: [] });
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuDoc, setMenuDoc]       = useState<RecentDoc | null>(null);
  const [period, setPeriod]         = useState<TimePeriod>('month');
  const [periodOpen, setPeriodOpen] = useState(false);

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
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['staff', 'admin']),
        ...FOLDER_TABLES.map(t => supabase.from(t).select('id, name, email, created_at, status, document_url').order('created_at', { ascending: false })),
      ]);
      const allDocs = tableResults.flatMap((r, i) => (r.data ?? []).map(d => ({ ...d, document_type: FOLDER_TABLES[i] })));
      if (mountedRef.current) setStats({
        totalClients:  clientRes.count ?? 0,
        totalStaff:    staffRes.count ?? 0,
        totalDocs:     allDocs.length,
        newDocs:       allDocs.filter(d => d.status === 'new').length,
        docsThisWeek:  allDocs.filter(d => d.created_at >= weekAgo).length,
        folderCounts:  FOLDER_TABLES.map((table, i) => ({ table, count: tableResults[i].data?.length ?? 0 })),
        recentUploads: [...allDocs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8) as any,
      });
    } catch (e) { console.error(e); }
    finally { clearTimeout(safetyTimer); if (mountedRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => { if (!authLoading && user?.id) load(); }, [authLoading, user?.id]);

  // Filter folder counts by selected period
  const periodStart = useMemo(() => getPeriodStart(period), [period]);
  const filteredFolderCounts = useMemo(() =>
    stats.folderCounts.map(f => ({
      ...f,
      count: stats.recentUploads.filter(d =>
        d.document_type === f.table && d.created_at >= periodStart
      ).length,
    })),
  [stats, periodStart]);

  const maxFolder = Math.max(...filteredFolderCounts.map(f => f.count), 1);

  // Segregate folders by category (TAX / BK / CFO) for the grouped breakdown.
  const groupedFolders = useMemo(() =>
    CATEGORIES.map(cat => {
      const folders = filteredFolderCounts.filter(f => categoryOf(f.table) === cat.key);
      const total   = folders.reduce((acc, f) => acc + f.count, 0);
      return { ...cat, folders, total };
    }).filter(g => g.folders.length > 0),
  [filteredFolderCounts]);

  // ── Overview cards (3 cards per spec) ───────────────────────────────────
  const overviewCards = [
    {
      label: 'Total Clients',
      value: stats.totalClients,
      sub:   '↑ 20% this month',
      icon:  'people-outline'          as const,
      color: '#E8B923',
    },
    {
      label: 'Staff Members',
      value: stats.totalStaff,
      sub:   '↑ 10% this month',
      icon:  'shield-checkmark-outline' as const,
      color: '#B5905B',
    },
    {
      label: 'Total Docs',
      value: stats.totalDocs,
      sub:   '↑ 15% this month',
      icon:  'documents-outline'        as const,
      color: '#2C2320',
    },
  ];

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
          {/* Left — greeting */}
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>Welcome back,</Text>
            <Text style={s.adminName}>Admin</Text>
            <View style={s.statusRow}>
              <PulsingDot />
              <Text style={s.statusText}>All systems operational</Text>
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

          {/* ── Section label: OVERVIEW ── */}
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionLabel}>OVERVIEW</Text>
            <TouchableOpacity style={s.sectionAction}>
              <Ionicons name="trending-up-outline" size={13} color="#E8B923" />
              <Text style={s.sectionActionText}>Analytics</Text>
            </TouchableOpacity>
          </View>

          {/* ── 3 stat cards — fixed row, no scroll ── */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {overviewCards.map((card) => (
              <View key={card.label} style={[s.statCard, { borderTopColor: card.color }]}>
                <LinearGradient
                  colors={[card.color + '22', card.color + '08']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.statIconWrap}
                >
                  <Ionicons name={card.icon} size={20} color={card.color} />
                </LinearGradient>
                <View style={s.statCardInner}>
                  <Text style={[s.statValue, { color: card.color }]}>{card.value}</Text>
                  <Text style={s.statLabel} numberOfLines={2}>{card.label}</Text>
                  <Text style={s.statSub}>{card.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Section label: DOCUMENTS BY FOLDER ── */}
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionLabel}>DOCUMENTS BY FOLDER</Text>
            <TouchableOpacity style={s.sectionAction} onPress={() => setPeriodOpen(true)}>
              <Ionicons name="calendar-outline" size={13} color="#E8B923" />
              <Text style={[s.sectionActionText, { color: '#E8B923' }]}>
                {PERIOD_OPTIONS.find(p => p.key === period)?.label}
              </Text>
              <Ionicons name="chevron-down" size={12} color="#E8B923" />
            </TouchableOpacity>
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

          {/* ── Folder breakdown — one card per category (TAX / BK / CFO) ── */}
          <View style={isDesktop ? s.catGrid : undefined}>
          {groupedFolders.map(group => (
            <View key={group.key} style={[s.catCard, isDesktop && s.catCardDesktop]}>
              {/* Category header */}
              <View style={s.catHeader}>
                <View style={[s.catBadge, { backgroundColor: group.color + '18' }]}>
                  <Ionicons name={group.icon as any} size={15} color={group.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.catTitle}>{group.title}</Text>
                  <Text style={s.catSub}>{group.folders.length} folder{group.folders.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={[s.catTotalPill, { backgroundColor: group.color + '14', borderColor: group.color + '40' }]}>
                  <Text style={[s.catTotalNum, { color: group.color }]}>{group.total}</Text>
                  <Text style={[s.catTotalLabel, { color: group.color }]}>docs</Text>
                </View>
              </View>

              <View style={s.catDivider} />

              {/* Folder rows within this category */}
              {group.folders.map((f, idx) => {
                const meta = FOLDER_META[f.table] ?? { label: f.table, color: group.color, icon: 'folder-outline' };
                const pct  = Math.round((f.count / maxFolder) * 100);
                const isLast = idx === group.folders.length - 1;
                return (
                  <View key={f.table}>
                    <View style={s.folderRow}>
                      <View style={[s.folderIconCircle, { backgroundColor: meta.color + '18' }]}>
                        <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      </View>
                      <Text style={s.folderLabel} numberOfLines={2}>{meta.label}</Text>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${Math.max(pct, f.count > 0 ? 6 : 0)}%` as any, backgroundColor: meta.color }]} />
                      </View>
                      <Text style={[s.folderCount, { color: meta.color }]}>{f.count}</Text>
                    </View>
                    {!isLast && <View style={s.divider} />}
                  </View>
                );
              })}
            </View>
          ))}
          </View>

          {/* ── Section label: RECENT UPLOADS ── */}
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionLabel}>RECENT UPLOADS</Text>
            <TouchableOpacity style={s.sectionAction} onPress={onViewAllDocuments}>
              <Text style={s.sectionActionText}>View All</Text>
              <Text style={s.viewAllArrow}> ›</Text>
            </TouchableOpacity>
          </View>

          {/* ── Recent uploads card ── */}
          {stats.recentUploads.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="cloud-upload-outline" size={32} color="#E8B923" />
              </View>
              <Text style={s.emptyTitle}>No uploads yet</Text>
              <Text style={s.emptyText}>Documents uploaded by clients will appear here.</Text>
            </View>
          ) : (
            <View style={s.card}>
              {stats.recentUploads.map((doc, i) => {
                const meta     = FOLDER_META[doc.document_type] ?? { label: doc.document_type, color: '#E8B923', icon: 'document-outline' };
                const ext      = doc.name.split('.').pop()?.toUpperCase().slice(0, 4) ?? 'FILE';
                const extColor = EXT_COLORS[ext] ?? meta.color;
                const isLast   = i === stats.recentUploads.length - 1;
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
                          <Text style={s.recentEmail} numberOfLines={1}>{doc.email}</Text>
                        </View>
                        {/* Folder chip */}
                        <View style={s.recentMetaRow}>
                          <View style={[s.folderChip, { backgroundColor: meta.color + '15', borderColor: meta.color + '40' }]}>
                            <Text style={[s.folderChipText, { color: meta.color }]}>{meta.label}</Text>
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
            </View>
          )}

          {/* Bottom breathing room */}
          <View style={{ height: 32 }} />
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

            <TouchableOpacity style={s.menuItem} onPress={() => { setMenuDoc(null); onViewAllDocuments?.(); }}>
              <View style={[s.menuItemIcon, { backgroundColor: 'rgba(181,144,91,0.12)' }]}>
                <Ionicons name="documents-outline" size={18} color="#B5905B" />
              </View>
              <Text style={s.menuItemText}>Go to Documents</Text>
              <Ionicons name="chevron-forward" size={16} color="#A8998A" />
            </TouchableOpacity>

            <TouchableOpacity style={s.menuItem} onPress={() => {
              if (menuDoc?.document_url) {
                Platform.OS === 'web'
                  ? window.open(menuDoc.document_url, '_blank')
                  : Linking.openURL(menuDoc.document_url);
              }
              setMenuDoc(null);
            }}>
              <View style={[s.menuItemIcon, { backgroundColor: 'rgba(44,35,32,0.08)' }]}>
                <Ionicons name="download-outline" size={18} color="#2C2320" />
              </View>
              <Text style={s.menuItemText}>Download</Text>
              <Ionicons name="chevron-forward" size={16} color="#A8998A" />
            </TouchableOpacity>

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
    padding: 20,
    gap: 20,
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

  // ── Single stat card ──────────────────────────────────
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderTopWidth: 3,
    borderColor: '#E8E0D0',
    borderWidth: 1,
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    padding: 12,
    gap: 4,
  },
  statIconWrap: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  statCardInner: {
    gap: 2,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    color: '#6B5E52',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  statSub: {
    color: '#A8998A',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
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
    shadowRadius: 12,
    elevation: 3,
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
    shadowRadius: 12,
    elevation: 3,
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  extBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
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
