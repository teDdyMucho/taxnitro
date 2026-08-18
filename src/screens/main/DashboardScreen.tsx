import { nativeDriver } from '../../constants/platform';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getDocumentsByEmail, FOLDER_TABLES } from '../../db/documents';
import {
  itemsForClient, reqKey, getFulfilledRequirements,
  monthOf, formatMonthLabel, serviceLabel,
} from '../../db/requirements';
import { getCustomRequests, CustomRequest } from '../../db/customRequests';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── types ─────────────────────────────────────────────────────────────────────

interface Stats {
  total: number;
  viewed: number;
  newThisWeek: number;
}

interface ChartPoint {
  month: string;
  docs: number;
}

interface ActivityItem {
  id: string;
  name: string;
  file_name: string | null;
  document_type: string | null;
  status: string;
  created_at: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

function last6Months(): ChartPoint[] {
  const result: ChartPoint[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ month: d.toLocaleDateString('en-US', { month: 'short' }), docs: 0 });
  }
  return result;
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── activity config ───────────────────────────────────────────────────────────

const activityIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  new: 'cloud-upload',
  not_viewed: 'eye-off',
  viewed: 'eye',
};

const activityColors: Record<string, string> = {
  new: Colors.primary,
  not_viewed: Colors.notViewed,
  viewed: Colors.viewed,
};

const activityLabel: Record<string, string> = {
  new: 'New document uploaded',
  not_viewed: 'Awaiting review',
  viewed: 'Document reviewed',
};

// ── OverviewCard ──────────────────────────────────────────────────────────────

function OverviewCard({
  icon,
  label,
  value,
  subtitle,
  accentColor,
  delay,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  subtitle: string;
  accentColor: string;
  delay: number;
  loading: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 480, delay, useNativeDriver: nativeDriver }),
      Animated.spring(translateY, { toValue: 0, damping: 16, stiffness: 110, delay, useNativeDriver: nativeDriver }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[overviewCardStyles.card, { opacity, transform: [{ translateY }], borderTopColor: accentColor }]}>
      <LinearGradient
        colors={[accentColor + '22', accentColor + '08']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={overviewCardStyles.iconWrap}
      >
        <Ionicons name={icon} size={20} color={accentColor} />
      </LinearGradient>
      {loading ? (
        <ActivityIndicator color={accentColor} style={{ marginVertical: 8 }} />
      ) : (
        <Text style={[overviewCardStyles.value, { color: accentColor }]}>{value}</Text>
      )}
      <Text style={overviewCardStyles.label}>{label}</Text>
      <Text style={overviewCardStyles.subtitle}>{subtitle}</Text>
    </Animated.View>
  );
}

const overviewCardStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 18,
    padding: 14,
    borderTopWidth: 3,
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    gap: 4,
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  value: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 32 },
  label: { color: Colors.textPrimary, fontSize: 11, fontWeight: '700', marginTop: 2 },
  subtitle: { color: Colors.textMuted, fontSize: 10, marginTop: 1 },
});

// ── MiniChart ─────────────────────────────────────────────────────────────────

function MiniChart({ data, loading }: { data: ChartPoint[]; loading: boolean }) {
  if (loading) {
    return (
      <View style={chartStyles.container}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (data.every(d => d.docs === 0)) {
    return (
      <View style={[chartStyles.container, chartStyles.empty]}>
        <Ionicons name="bar-chart-outline" size={32} color={Colors.textMuted} />
        <Text style={chartStyles.emptyText}>No uploads yet</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map(d => d.docs), 1);

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.bars}>
        {data.map((item) => {
          const heightPct = (item.docs / maxVal) * 100;
          const isHighest = item.docs === maxVal && item.docs > 0;
          return (
            <View key={item.month} style={chartStyles.barWrapper}>
              <View style={chartStyles.barColumn}>
                {isHighest && (
                  <View style={chartStyles.barTooltip}>
                    <Text style={chartStyles.barTooltipText}>{item.docs}</Text>
                  </View>
                )}
                <View
                  style={[
                    chartStyles.bar,
                    {
                      height: `${Math.max(heightPct, 8)}%` as any,
                      backgroundColor: isHighest ? Colors.primary : Colors.bgMid,
                    },
                  ]}
                />
              </View>
              <Text style={[chartStyles.barMonth, isHighest && { color: Colors.primary, fontWeight: '700' }]}>
                {item.month}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { height: 120, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8 },
  emptyText: { color: Colors.textMuted, fontSize: 13 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 6 },
  barWrapper: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barColumn: { width: '100%', alignItems: 'center', flex: 1, justifyContent: 'flex-end', position: 'relative' },
  barTooltip: {
    position: 'absolute',
    top: -20,
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  barTooltipText: { color: Colors.white, fontSize: 9, fontWeight: '700' },
  bar: { width: '75%', borderRadius: 5, minHeight: 8 },
  barMonth: { color: Colors.textMuted, fontSize: 10, marginTop: 6, fontWeight: '500' },
});

// ── main screen ───────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [stats, setStats] = useState<Stats>({ total: 0, viewed: 0, newThisWeek: 0 });
  const [chartData, setChartData] = useState<ChartPoint[]>(last6Months());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fulfilled, setFulfilled] = useState<Set<string>>(new Set()); // admin-approved (green)
  const [pending, setPending]     = useState<Set<string>>(new Set()); // client-uploaded, awaiting approval (yellow)
  const [rejected, setRejected]   = useState<Set<string>>(new Set()); // admin-declined (red)
  const [customReqs, setCustomReqs] = useState<CustomRequest[]>([]);  // one-off staff requests
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 600, useNativeDriver: nativeDriver }),
      Animated.spring(headerY, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: nativeDriver }),
    ]).start();
  }, []);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);

    const userEmail = user.email;
    const [docs, profileRes, reqs, custom] = await Promise.all([
      getDocumentsByEmail(userEmail),
      supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle(),
      getFulfilledRequirements(userEmail, monthOf()),
      getCustomRequests(userEmail, monthOf()),
    ]);

    if (!mountedRef.current) return;

    if (profileRes.data?.avatar_url) setAvatarUrl(profileRes.data.avatar_url);
    setCustomReqs(custom);

    // Required uploads this month — split by status:
    //   approved → green (admin accepted + tagged)
    //   pending  → yellow (client uploaded, awaiting admin approval)
    //   rejected → red   (admin declined — "Declined")
    setFulfilled(new Set(reqs.filter(r => r.status === 'approved').map(r => reqKey(r.service, r.requirement_key))));
    setPending(new Set(reqs.filter(r => r.status === 'pending').map(r => reqKey(r.service, r.requirement_key))));
    setRejected(new Set(reqs.filter(r => r.status === 'rejected').map(r => reqKey(r.service, r.requirement_key))));

    // Stats
    const weekAgoTime = oneWeekAgo.getTime();
    setStats({
      total: docs.length,
      viewed: docs.filter(d => d.status === 'viewed').length,
      newThisWeek: docs.filter(d => new Date(d.created_at).getTime() >= weekAgoTime).length,
    });

    // Chart — count docs per month for last 6 months
    const points = last6Months();
    docs.forEach(doc => {
      const date = new Date(doc.created_at);
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short' });
      const point = points.find(p => p.month === monthLabel);
      if (point && date >= sixMonthsAgo) point.docs++;
    });
    setChartData(points);

    // Recent activity — 5 most recent
    setActivity(docs.slice(0, 5).map(d => ({
      id: d.id,
      name: d.file_name || d.name || 'Document',
      file_name: d.file_name,
      document_type: d.document_type,
      status: d.status,
      created_at: d.created_at,
    })));
  }, [user?.id]);

  // Fire only after auth is fully resolved and user is available
  useEffect(() => {
    if (!authLoading && user?.email) {
      // No setLoading(true) — show existing content immediately
      const safetyTimer = setTimeout(() => {
        if (mountedRef.current) { setLoading(false); setRefreshing(false); }
      }, 8000);
      fetchData().finally(() => { clearTimeout(safetyTimer); if (mountedRef.current) setLoading(false); });
    }
  }, [authLoading, user?.email]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Real-time — watch all 8 folder tables and refetch on any change
  useEffect(() => {
    if (!user?.email) return;
    const email = user.email;

    const channels = FOLDER_TABLES.map(table =>
      supabase.channel(`dash:${table}:${email}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter: `email=eq.${email}` },
          () => fetchData())
        .subscribe()
    );

    // Watch requirement tags so the upload progress bar moves when admin accepts
    channels.push(
      supabase.channel(`dash:document_requirements:${email}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'document_requirements', filter: `client_email=eq.${email}` },
          () => fetchData())
        .subscribe()
    );

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [user?.email, fetchData]);

  // ── Required-upload progress (only items that apply to THIS client) ──
  // Scoped by the client's services (BK/CFO) and QBO access.
  const clientItems = itemsForClient(user?.services, user?.hasQboAccess, user?.bankAccounts);
  const reqDone   = clientItems.filter(i => fulfilled.has(reqKey(i.service, i.key))).length;
  const reqTotal  = clientItems.length;
  const reqPct    = reqTotal > 0 ? (reqDone / reqTotal) * 100 : 0;
  const reqColor  = reqPct >= 100 ? Colors.viewed : reqPct >= 50 ? Colors.primary : Colors.accentGold;

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const userInitials = user?.name ? initials(user.name) : '?';

  const headerPaddingTop = Platform.OS === 'web' ? 20 : insets.top + 20;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 40 : insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#3A3131', '#4A3E3E', '#3A3131']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: headerPaddingTop }]}
        >
          <View style={styles.headerOverlay} pointerEvents="none" />
          <View style={styles.decorCircle1} pointerEvents="none" />
          <View style={styles.decorCircle2} pointerEvents="none" />
          <Animated.View style={{ opacity: headerOpacity, transform: [{ translateY: headerY }] }}>
            <View style={styles.heroTop}>
              <View style={styles.heroGreetingBlock}>
                <Text style={styles.heroName}>{user?.name ?? firstName}</Text>
              </View>

              {/* Avatar */}
              <TouchableOpacity activeOpacity={0.8} style={styles.avatarWrap}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <LinearGradient
                    colors={['#E8B923', '#B5905B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarCircle}
                  >
                    <Text style={styles.avatarInitials}>{userInitials}</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* ── BODY ────────────────────────────────────────────────────────── */}
        <View style={styles.body}>

          {/* ── OVERVIEW CARDS ────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <OverviewCard
              icon="documents-outline"
              label="Total Docs"
              value={stats.total}
              subtitle="all time"
              accentColor={Colors.accent}
              delay={80}
              loading={loading}
            />
            <OverviewCard
              icon="eye-outline"
              label="Viewed"
              value={stats.viewed}
              subtitle="reviewed"
              accentColor={Colors.primary}
              delay={160}
              loading={loading}
            />
            <OverviewCard
              icon="notifications-outline"
              label="New"
              value={stats.newThisWeek}
              subtitle="this week"
              accentColor={Colors.accentGold}
              delay={240}
              loading={loading}
            />
          </View>

          {/* ── REQUIRED DOCUMENTS PROGRESS ───────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Required Documents</Text>
                <Text style={styles.cardSubtitle}>Accepted this month · {formatMonthLabel(monthOf())}</Text>
              </View>
              <Text style={[styles.progressPct, { color: reqColor }]}>
                {Math.round(reqPct)}%
              </Text>
            </View>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${reqPct}%` as any, backgroundColor: reqColor },
                ]}
              />
            </View>

            {/* Count summary */}
            <Text style={styles.reqSummary}>
              {reqDone} of {reqTotal} required items accepted
            </Text>

            {/* Checklist grouped by service — only the client's applicable items */}
            {(['BK', 'CFO'] as const).map(svc => {
              const items = clientItems.filter(i => i.service === svc);
              if (items.length === 0) return null;
              return (
                <View key={svc} style={styles.reqGroup}>
                  <Text style={styles.reqGroupLabel}>{serviceLabel(svc)}</Text>
                  {items.map(item => {
                    const k          = reqKey(item.service, item.key);
                    const isApproved = fulfilled.has(k);
                    const isRejected = !isApproved && rejected.has(k);
                    const isPending  = !isApproved && !isRejected && pending.has(k);
                    // Radio: grey (not uploaded) → yellow (pending) → red (declined) → green (approved)
                    const iconName   = isApproved ? 'checkmark-circle' : isRejected ? 'close-circle' : isPending ? 'time' : 'ellipse-outline';
                    const iconColor  = isApproved ? Colors.viewed : isRejected ? Colors.error : isPending ? Colors.accentGold : Colors.textMuted;
                    return (
                      <View key={item.key} style={styles.reqItemRow}>
                        <Ionicons name={iconName} size={17} color={iconColor} />
                        <Text
                          style={[styles.reqItemText, (isApproved || isPending || isRejected) && { color: Colors.textPrimary, fontWeight: '600' }]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                        {isApproved && <Text style={styles.reqItemDone}>Accepted</Text>}
                        {isRejected && <Text style={[styles.reqItemDone, { color: Colors.error }]}>Declined</Text>}
                        {isPending  && <Text style={[styles.reqItemDone, { color: Colors.accentGold }]}>Pending</Text>}
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {/* Custom one-off requests from staff */}
            {customReqs.length > 0 && (
              <View style={styles.reqGroup}>
                <Text style={styles.reqGroupLabel}>Special Requests</Text>
                {customReqs.map(req => {
                  const isApproved = req.status === 'approved';
                  const isRejected = req.status === 'rejected';
                  const isUploaded = req.status === 'uploaded';
                  const iconName   = isApproved ? 'checkmark-circle' : isRejected ? 'close-circle' : isUploaded ? 'time' : 'ellipse-outline';
                  const iconColor  = isApproved ? Colors.viewed : isRejected ? Colors.error : isUploaded ? Colors.accentGold : Colors.textMuted;
                  return (
                    <View key={req.id} style={styles.reqItemRow}>
                      <Ionicons name={iconName} size={17} color={iconColor} />
                      <Text style={[styles.reqItemText, req.status !== 'pending' && { color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
                        {req.title}
                      </Text>
                      {isApproved && <Text style={styles.reqItemDone}>Accepted</Text>}
                      {isRejected && <Text style={[styles.reqItemDone, { color: Colors.error }]}>Declined</Text>}
                      {isUploaded && <Text style={[styles.reqItemDone, { color: Colors.accentGold }]}>In review</Text>}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── DOCUMENTS UPLOADED CHART ──────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>Documents Uploaded</Text>
              <Text style={styles.cardSubtitle}>Last 6 months</Text>
            </View>
            <MiniChart data={chartData} loading={loading} />
          </View>

          {/* ── RECENT ACTIVITY ───────────────────────────────────────────── */}
          <View style={[styles.card, styles.cardNoPad]}>
            <View style={[styles.cardRow, styles.cardInnerPad]}>
              <Text style={styles.cardTitle}>Recent Activity</Text>
            </View>

            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 28 }} />
            ) : activity.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={34} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No activity yet</Text>
                <Text style={styles.emptySubtitle}>Uploaded documents will appear here</Text>
              </View>
            ) : (
              activity.map((item, index) => {
                const color = activityColors[item.status] ?? Colors.primary;
                const icon = activityIcons[item.status] ?? 'document';
                const label = activityLabel[item.status] ?? 'New document uploaded';
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.activityRow,
                      index < activity.length - 1 && styles.activityDivider,
                    ]}
                  >
                    <View style={[styles.activityIconCircle, { backgroundColor: `${color}18` }]}>
                      <Ionicons name={icon} size={16} color={color} />
                    </View>
                    <View style={styles.activityContent}>
                      <Text style={styles.activityLabel}>{label}</Text>
                      <Text style={styles.activityName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.activityMeta}>
                        {item.document_type ?? 'Document'} · {timeAgo(item.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  scroll: { flex: 1 },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  headerOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.04 },
  decorCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,185,35,0.06)', top: -60, right: -40 } as any,
  decorCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(232,185,35,0.05)', bottom: -30, left: 60 } as any,
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroGreetingBlock: { flex: 1, marginRight: 12 },
  heroGreeting: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  heroName: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  // ── Avatar ────────────────────────────────────────────────────────────────
  avatarWrap: {
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarInitials: {
    color: '#3A3131',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 16,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 4,
  },

  // ── Overview scroll ───────────────────────────────────────────────────────
  overviewScroll: {
    paddingRight: 8,
  },

  // ── White card ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  cardNoPad: { padding: 0 },
  cardInnerPad: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
  },

  // ── Progress ──────────────────────────────────────────────────────────────
  progressPct: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.bgMid,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },

  // ── Required documents checklist ─────────────────────────────────────────
  reqSummary: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  reqGroup: {
    marginTop: 8,
  },
  reqGroupLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  reqItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  reqItemText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  reqItemDone: {
    color: Colors.viewed,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  progressLegend: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  legendSep: {
    width: 1,
    height: 14,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },

  // ── Activity ──────────────────────────────────────────────────────────────
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  activityDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  activityIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: { flex: 1 },
  activityLabel: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  activityName: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 3,
  },
  activityMeta: {
    color: Colors.textMuted,
    fontSize: 11,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
