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
import { Card } from '../../components/Card';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getDocumentsByEmail, FOLDER_TABLES } from '../../db/documents';

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
  if (h < 12) return 'Good morning 👋';
  if (h < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
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

// ── sub-components ────────────────────────────────────────────────────────────

function KPICard({ title, value, icon, color, bgColor, delay, subtitle, loading }: {
  title: string; value: number; icon: keyof typeof Ionicons.glyphMap;
  color: string; bgColor: string; delay: number; subtitle?: string; loading: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, delay, useNativeDriver: nativeDriver }),
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 100, delay, useNativeDriver: nativeDriver }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.kpiCard, { opacity, transform: [{ translateY }] }]}>
      <LinearGradient colors={[Colors.bgCard, Colors.bgElevated]} style={styles.kpiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={[styles.kpiIcon, { backgroundColor: bgColor }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        {loading
          ? <ActivityIndicator color={color} style={{ marginVertical: 6 }} />
          : <Text style={[styles.kpiValue, { color }]}>{value}</Text>
        }
        <Text style={styles.kpiTitle}>{title}</Text>
        {subtitle && <Text style={styles.kpiSubtitle}>{subtitle}</Text>}
      </LinearGradient>
    </Animated.View>
  );
}

function MiniChart({ data, loading }: { data: ChartPoint[]; loading: boolean }) {
  if (loading) {
    return <View style={styles.chartContainer}><ActivityIndicator color={Colors.primary} style={{ flex: 1 }} /></View>;
  }
  if (data.every(d => d.docs === 0)) {
    return (
      <View style={[styles.chartContainer, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: Colors.textMuted, fontSize: 13 }}>No uploads yet</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map(d => d.docs), 1);

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartBars}>
        {data.map((item, index) => {
          const heightPct = (item.docs / maxVal) * 100;
          const isHighest = item.docs === maxVal && item.docs > 0;
          return (
            <View key={item.month} style={styles.barWrapper}>
              <View style={styles.barColumn}>
                {isHighest && (
                  <View style={styles.barLabel}>
                    <Text style={styles.barLabelText}>{item.docs}</Text>
                  </View>
                )}
                <LinearGradient
                  colors={isHighest ? [Colors.primary, Colors.primaryDark] : [Colors.bgElevated, Colors.bgMid]}
                  style={[styles.bar, { height: `${Math.max(heightPct, 6)}%` as any }]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                />
              </View>
              <Text style={[styles.barMonth, isHighest && { color: Colors.primary }]}>{item.month}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

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
  new: 'Uploaded',
  not_viewed: 'Not Viewed',
  viewed: 'Viewed',
};

// ── main screen ───────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [stats, setStats] = useState<Stats>({ total: 0, viewed: 0, newThisWeek: 0 });
  const [chartData, setChartData] = useState<ChartPoint[]>(last6Months());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);

    const userEmail = user.email;
    const [docs, profileRes] = await Promise.all([
      getDocumentsByEmail(userEmail),
      supabase.from('profiles').select('avatar_url').eq('id', user.id).single(),
    ]);

    if (profileRes.data?.avatar_url) setAvatarUrl(profileRes.data.avatar_url);

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

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Wait for user to be available before fetching
  useEffect(() => {
    if (user?.id) fetchData().finally(() => setLoading(false));
  }, [user?.id]);

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

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [user?.email, fetchData]);

  const viewedPct = stats.total > 0 ? (stats.viewed / stats.total) * 100 : 0;
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const userInitials = user?.name ? initials(user.name) : '?';

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: Platform.OS === 'web' ? 0 : insets.top, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <LinearGradient colors={[Colors.bgDark, Colors.bgDeep]} style={styles.headerBanner}>
          <Animated.View style={{ opacity: headerOpacity, transform: [{ translateY: headerY }] }}>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.greeting}>{greeting()}</Text>
                <Text style={styles.welcomeName}>Welcome back, {firstName}</Text>
              </View>
              <View style={styles.avatarContainer}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <LinearGradient colors={[Colors.primary, Colors.accent]} style={styles.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={styles.avatarText}>{userInitials}</Text>
                  </LinearGradient>
                )}
                <View style={styles.onlineDot} />
              </View>
            </View>

            <View style={styles.clientCard}>
              <View>
                <Text style={styles.clientIdLabel}>Client ID</Text>
                <Text style={styles.clientIdValue}>{user?.clientId ?? '—'}</Text>
              </View>
              <View style={styles.planBadge}>
                <Text style={styles.planText}>{user?.plan ?? 'Free'}</Text>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>

        <View style={styles.content}>

          {/* KPI Cards */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Overview</Text>
          </View>
          <View style={styles.kpiGrid}>
            <KPICard title="Total Docs" value={stats.total} icon="documents-outline" color={Colors.primary} bgColor="rgba(37,99,235,0.15)" delay={100} loading={loading} />
            <KPICard title="Viewed" value={stats.viewed} icon="eye-outline" color={Colors.viewed} bgColor="rgba(34,197,94,0.15)" delay={200} loading={loading} />
            <KPICard title="New" value={stats.newThisWeek} icon="cloud-upload-outline" color={Colors.newDoc} bgColor="rgba(59,130,246,0.15)" delay={300} subtitle="This week" loading={loading} />
          </View>

          {/* Progress */}
          <Card style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Document Review Progress</Text>
              <Text style={styles.progressPct}>{Math.round(viewedPct)}%</Text>
            </View>
            <View style={styles.progressBar}>
              <LinearGradient
                colors={[Colors.primary, Colors.viewed]}
                style={[styles.progressFill, { width: `${viewedPct}%` }]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
            </View>
            <View style={styles.progressLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.viewed }]} />
                <Text style={styles.legendText}>{stats.viewed} Viewed</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.newDoc }]} />
                <Text style={styles.legendText}>{stats.newThisWeek} New this week</Text>
              </View>
            </View>
          </Card>

          {/* Chart */}
          <Card style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Documents Uploaded</Text>
              <Text style={styles.chartSubtitle}>Last 6 months</Text>
            </View>
            <MiniChart data={chartData} loading={loading} />
          </Card>

          {/* Recent Activity */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
          </View>

          <Card noPadding>
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ padding: 24 }} />
            ) : activity.length === 0 ? (
              <View style={styles.emptyActivity}>
                <Ionicons name="document-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No documents yet</Text>
              </View>
            ) : (
              activity.map((item, index) => (
                <View key={item.id} style={[styles.activityItem, index < activity.length - 1 && styles.activityBorder]}>
                  <View style={[styles.activityIcon, { backgroundColor: `${activityColors[item.status] ?? Colors.primary}18` }]}>
                    <Ionicons name={activityIcons[item.status] ?? 'document'} size={16} color={activityColors[item.status] ?? Colors.primary} />
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityText} numberOfLines={1}>
                      <Text style={styles.activityAction}>{activityLabel[item.status] ?? 'New'}: </Text>
                      {item.name}
                    </Text>
                    <Text style={styles.activityTime}>
                      {item.document_type ?? 'Document'} · {timeAgo(item.created_at)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>

        </View>
      </ScrollView>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  scroll: { flex: 1 },
  headerBanner: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting: { color: Colors.textMuted, fontSize: 13, marginBottom: 4 },
  welcomeName: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 46, height: 46, borderRadius: 14 },
  avatarText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  onlineDot: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.viewed, borderWidth: 2, borderColor: Colors.bgDark },
  clientCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  clientIdLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 3, fontWeight: '500' },
  clientIdValue: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  planBadge: { backgroundColor: 'rgba(37,99,235,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)' },
  planText: { color: Colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  content: { padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kpiCard: { flex: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  kpiGradient: { padding: 12, minHeight: 100 },
  kpiIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, lineHeight: 28 },
  kpiTitle: { color: Colors.textSecondary, fontSize: 11, fontWeight: '500', marginTop: 3 },
  kpiSubtitle: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  progressCard: { marginBottom: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  progressPct: { color: Colors.viewed, fontSize: 14, fontWeight: '700' },
  progressBar: { height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLegend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.textMuted, fontSize: 11 },
  chartCard: { marginBottom: 16 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  chartTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  chartSubtitle: { color: Colors.textMuted, fontSize: 12 },
  chartContainer: { height: 100 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 4 },
  barWrapper: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barColumn: { width: '100%', alignItems: 'center', flex: 1, justifyContent: 'flex-end', position: 'relative' },
  barLabel: { position: 'absolute', top: -18, backgroundColor: Colors.primary, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  barLabelText: { color: Colors.white, fontSize: 9, fontWeight: '700' },
  bar: { width: '80%', borderRadius: 4, minHeight: 6 },
  barMonth: { color: Colors.textMuted, fontSize: 10, marginTop: 6, fontWeight: '500' },
  activityItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  activityIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityInfo: { flex: 1 },
  activityText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  activityAction: { color: Colors.textPrimary, fontWeight: '600' },
  activityTime: { color: Colors.textMuted, fontSize: 11, marginTop: 3 },
  emptyActivity: { alignItems: 'center', padding: 32, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
});
