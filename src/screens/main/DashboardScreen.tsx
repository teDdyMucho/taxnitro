import { nativeDriver } from '../../constants/platform';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
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
import { useResponsive } from '../../hooks/useResponsive';
import { supabase } from '../../lib/supabase';
import { getDocumentsByEmail, FOLDER_TABLES, type Document } from '../../db/documents';
import {
  itemsForClient, reqKey, getFulfilledRequirements,
  monthOf, formatMonthLabel, folderTableLabel, serviceLabel,
} from '../../db/requirements';
import { getCustomRequests, CustomRequest } from '../../db/customRequests';
import { isQuestionnaireDone } from '../../db/questionnaire';
import { listSharedNotes } from '../../db/sharedNotes';
import type { ClientNote } from '../../db/clientNotes';

// The client's dashboard — Camaree: "Their dashboard should be 3 columns of
// different types of notifications":
//
//   What's New?      file uploads, new doc comments, etc.
//   What's Missing?  docs not approved, required docs still pending, the
//                    monthly questionnaire
//   What's Next      upcoming monthly tasks, profile note comments
//
// Everything here is read from where it already lives: their documents, this
// month's required items, FTG's replies on their files, and the notes FTG
// leaves them (written on the staff side, on the client's profile). Three
// columns side by side from tablet width up; one above the other on a phone.

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

/** 'YYYY-MM' of the month after this one. */
function monthAfter(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'November' for '2026-11'. */
const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long' });

const excerpt = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const DAY = 86_400_000;
const NEW_FOR      = 30 * DAY;  // What's New looks back this far
const ACCEPTED_FOR = 14 * DAY;  // ...and this far for uploads FTG accepted
const REVIEW_FOR   = 60 * DAY;  // uploads still with FTG, counted under What's Next

// The folders FTG puts reports in for the client to look over and approve.
// Every file FTG uploads starts out awaiting the client's approval, but only
// these are ones the client is actually asked to approve; the rest (contracts,
// statements, older documents loaded in bulk) would bury the list.
const REVIEW_TABLES = new Set(['bk_mr_client_review', 'cfo_mr_client_review']);

const isFromFtg = (d: Document) => d.uploaded_by_role === 'staff' || d.uploaded_by_role === 'admin';
const docName = (d: Document) => d.file_name || d.name || 'Document';
const ageOf = (iso: string) => Date.now() - new Date(iso).getTime();

interface Reply {
  id: string;
  file_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface Item {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  sub?: string;
  /** Shown as "2h ago". */
  when?: string;
  /** Not opened yet: marked with a dot. */
  fresh?: boolean;
  /** Show all of `sub`, as for a note FTG wrote them. */
  full?: boolean;
  onPress?: () => void;
}

// ── a column ──────────────────────────────────────────────────────────────────

const SHOWN = 6;

function Column({ title, icon, accent, items, count, empty, loading, phone, header }: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  items: Item[];
  /** The number on the title; every row by default. Hidden at zero. */
  count?: number;
  /** What an empty column says. */
  empty: string;
  loading: boolean;
  phone: boolean;
  /** Something to show above the list, like this month's progress. */
  header?: React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  const n = count ?? items.length;
  return (
    <View style={phone ? c.colPhone : c.col}>
      <View style={c.head}>
        <View style={[c.headIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <Text style={c.title} numberOfLines={1}>{title}</Text>
        {!loading && n > 0 && (
          <View style={[c.count, { backgroundColor: accent }]}>
            <Text style={c.countText}>{n}</Text>
          </View>
        )}
      </View>
      {header}
      {loading ? (
        <ActivityIndicator color={accent} style={{ paddingVertical: 24 }} />
      ) : items.length === 0 ? (
        <View style={c.empty}>
          <Ionicons name="checkmark-done-outline" size={22} color={Colors.textMuted} />
          <Text style={c.emptyText}>{empty}</Text>
        </View>
      ) : (
        <>
          {shown.map(it => (
            <TouchableOpacity
              key={it.key}
              style={c.row}
              onPress={it.onPress}
              disabled={!it.onPress}
              accessibilityRole={it.onPress ? 'button' : undefined}
              activeOpacity={0.75}
            >
              <View style={[c.rowIcon, { backgroundColor: it.color + '18' }]}>
                <Ionicons name={it.icon} size={15} color={it.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={c.rowTitle} numberOfLines={2}>{it.title}</Text>
                {it.sub ? (
                  <Text style={c.rowSub} numberOfLines={it.full ? undefined : 3}>{it.sub}</Text>
                ) : null}
                {/* Under the text rather than beside it: a column is narrow. */}
                {(it.when || it.fresh) ? (
                  <View style={c.meta}>
                    {it.fresh ? <View style={c.newPill}><Text style={c.newText}>NEW</Text></View> : null}
                    {it.when ? <Text style={c.rowWhen}>{timeAgo(it.when)}</Text> : null}
                  </View>
                ) : null}
              </View>
              {it.onPress ? (
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginTop: 8 }} />
              ) : null}
            </TouchableOpacity>
          ))}
          {items.length > SHOWN && (
            <TouchableOpacity onPress={() => setAll(v => !v)} activeOpacity={0.7}>
              <Text style={[c.more, { color: accent }]}>
                {all ? 'Show less' : `Show ${items.length - SHOWN} more`}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export function DashboardScreen({ onGo, onUpload, onOpenQuestionnaire, questionnaireDone }: {
  /** Switch tab. Without it, rows do not lead anywhere. */
  onGo?: (tab: 'Documents') => void;
  /** Start an upload: the app's own flow, questionnaire first if it is due. */
  onUpload?: () => void;
  onOpenQuestionnaire?: () => void;
  /** What the app already knows about this month's questionnaire (null while
   *  unknown). Left out, the screen reads it itself. */
  questionnaireDone?: boolean | null;
} = {}) {
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  const { width } = useResponsive();
  // Three columns need room; below tablet width they stack.
  const phone = width < 768;

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [docs, setDocs]           = useState<Document[]>([]);
  const [replies, setReplies]     = useState<Reply[]>([]);
  const [notes, setNotes]         = useState<ClientNote[]>([]);
  const [ownQDone, setOwnQDone]   = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fulfilled, setFulfilled] = useState<Set<string>>(new Set()); // admin-approved
  const [pending, setPending]     = useState<Set<string>>(new Set()); // uploaded, awaiting FTG
  const [rejected, setRejected]   = useState<Set<string>>(new Set()); // declined by FTG
  const [customReqs, setCustomReqs] = useState<CustomRequest[]>([]); // one-off staff requests
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

  const month = monthOf();
  const nextMonth = monthAfter(month);
  // Bookkeeping and CFO clients answer the monthly questionnaire; tax-only do not.
  const asksQuestionnaire = (user?.services ?? []).some(sv => sv === 'BK' || sv === 'CFO');
  // Whether the app hands the questionnaire state in — the same on every render.
  const readsOwnQ = questionnaireDone === undefined;

  const fetchData = useCallback(async () => {
    if (!user?.id || !user.email) return;
    const email = user.email;

    const [allDocs, profileRes, reqs, custom, convRes, shared, qDone] = await Promise.all([
      getDocumentsByEmail(email),
      supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle(),
      getFulfilledRequirements(email, month),
      getCustomRequests(email, month),
      // What FTG has written on their files lately.
      supabase
        .from('file_conversations')
        .select('id, file_id, message, is_read, created_at')
        .eq('file_owner_id', user.id)
        .in('sender_role', ['staff', 'admin'])
        .gte('created_at', new Date(Date.now() - NEW_FOR).toISOString())
        .order('created_at', { ascending: false })
        .limit(200),
      listSharedNotes(email),
      asksQuestionnaire && readsOwnQ ? isQuestionnaireDone(email, month) : Promise.resolve(null),
    ]);

    if (!mountedRef.current) return;

    if (profileRes.data?.avatar_url) setAvatarUrl(profileRes.data.avatar_url);
    setDocs(allDocs);
    setCustomReqs(custom);
    setReplies((convRes.data ?? []) as Reply[]);
    setNotes(shared);
    setOwnQDone(qDone);
    setFulfilled(new Set(reqs.filter(r => r.status === 'approved').map(r => reqKey(r.service, r.requirement_key))));
    setPending(new Set(reqs.filter(r => r.status === 'pending').map(r => reqKey(r.service, r.requirement_key))));
    setRejected(new Set(reqs.filter(r => r.status === 'rejected').map(r => reqKey(r.service, r.requirement_key))));
  }, [user?.id, user?.email, month, asksQuestionnaire, readsOwnQ]);

  // Fire only after auth is fully resolved and user is available
  useEffect(() => {
    if (!authLoading && user?.email) {
      const safetyTimer = setTimeout(() => {
        if (mountedRef.current) { setLoading(false); setRefreshing(false); }
      }, 8000);
      fetchData().finally(() => { clearTimeout(safetyTimer); if (mountedRef.current) setLoading(false); });
    }
  }, [authLoading, user?.email, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Real-time: the folder tables, the month's requirement tags and FTG's
  // replies; any change reads everything again. A note from FTG comes with a
  // notification, and shows on the next visit or pull to refresh.
  useEffect(() => {
    if (!user?.email || !user?.id) return;
    const email = user.email;
    const channels = FOLDER_TABLES.map(table =>
      supabase.channel(`dash:${table}:${email}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter: `email=eq.${email}` },
          () => fetchData())
        .subscribe()
    );
    channels.push(
      supabase.channel(`dash:document_requirements:${email}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'document_requirements', filter: `client_email=eq.${email}` },
          () => fetchData())
        .subscribe(),
      supabase.channel(`dash:file_conversations:${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'file_conversations', filter: `file_owner_id=eq.${user.id}` },
          () => fetchData())
        .subscribe(),
    );
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [user?.email, user?.id, fetchData]);

  // ── The three columns ──────────────────────────────────────────────────────
  const clientItems = itemsForClient(user?.services, user?.hasQboAccess, user?.bankAccounts);
  // A client with both Bookkeeping and CFO is asked for the same statements
  // twice, once for each; say which is which.
  const bothSuites = new Set(clientItems.map(i => i.service)).size > 1;
  const suiteOf = (service: Parameters<typeof serviceLabel>[0]) => (bothSuites ? `${serviceLabel(service)} · ` : '');
  const qDone = readsOwnQ ? ownQDone : questionnaireDone;
  const goDocs = onGo ? () => onGo('Documents') : undefined;
  const upload = onUpload ?? goDocs;
  const nameOfFile = new Map(docs.map(d => [d.id, docName(d)]));

  // What's New: what FTG sent them, what FTG wrote on their files, and the
  // uploads FTG accepted. Newest first.
  const repliesByFile = new Map<string, Reply[]>();
  replies.forEach(r => repliesByFile.set(r.file_id, [...(repliesByFile.get(r.file_id) ?? []), r]));
  const accepted = docs
    .filter(d => !isFromFtg(d) && d.approval_status === 'approved' && d.approved_at && ageOf(d.approved_at) < ACCEPTED_FOR)
    .sort((a, b) => b.approved_at!.localeCompare(a.approved_at!));
  const whatsNew: Item[] = [
    ...docs
      .filter(d => isFromFtg(d) && ageOf(d.created_at) < NEW_FOR)
      .map<Item>(d => ({
        key: `doc:${d.id}`, icon: 'document-text-outline', color: Colors.primaryDark,
        title: docName(d), sub: `New from FTG · ${folderTableLabel(d.document_type)}`,
        when: d.created_at, fresh: d.status !== 'viewed', onPress: goDocs,
      })),
    ...[...repliesByFile.entries()].map<Item>(([fileId, list]) => ({
      key: `reply:${fileId}`, icon: 'chatbubble-outline', color: '#2563EB',
      title: `FTG replied on ${nameOfFile.get(fileId) ?? 'your file'}`,
      sub: `“${excerpt(list[0].message)}”${list.length > 1 ? ` · ${list.length} messages` : ''}`,
      when: list[0].created_at, fresh: list.some(r => !r.is_read), onPress: goDocs,
    })),
    // A month's statements are accepted together; one line for the lot.
    ...(accepted.length === 0 ? [] : [{
      key: 'accepted', icon: 'checkmark-circle-outline' as const, color: Colors.viewed,
      title: accepted.length === 1 ? docName(accepted[0]) : `FTG accepted ${plural(accepted.length, 'upload')}`,
      sub: accepted.length === 1
        ? 'Accepted by FTG'
        : accepted.slice(0, 3).map(docName).join(', ') + (accepted.length > 3 ? ', and more' : ''),
      when: accepted[0].approved_at!, onPress: goDocs,
    }]),
  ].sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));

  // What's Missing: what is waiting on them. The questionnaire first, as this
  // month's uploads wait on it; then what FTG sent back, what FTG asked them to
  // approve, what is still to upload this month, and anything FTG asked for.
  const whatsMissing: Item[] = [];
  if (asksQuestionnaire && qDone === false) {
    whatsMissing.push({
      key: 'questionnaire', icon: 'clipboard-outline', color: Colors.primaryDark,
      title: `${formatMonthLabel(month)} questionnaire`,
      sub: 'A few quick questions before you upload this month',
      onPress: onOpenQuestionnaire,
    });
  }
  const notSent = clientItems.filter(i => {
    const k = reqKey(i.service, i.key);
    return !fulfilled.has(k) && !pending.has(k);
  });
  notSent.filter(i => rejected.has(reqKey(i.service, i.key))).forEach(i => whatsMissing.push({
    key: `declined:${i.service}:${i.key}`, icon: 'refresh-circle-outline', color: Colors.error,
    title: i.label, sub: `${suiteOf(i.service)}Sent back by FTG. Please upload it again`, onPress: upload,
  }));
  customReqs.filter(r => r.status === 'rejected').forEach(r => whatsMissing.push({
    key: `crx:${r.id}`, icon: 'refresh-circle-outline', color: Colors.error,
    title: r.title, sub: 'Sent back by FTG. Please upload it again', onPress: upload,
  }));
  docs
    .filter(d => isFromFtg(d) && d.approval_status === 'pending' && REVIEW_TABLES.has(d.document_type ?? ''))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .forEach(d => whatsMissing.push({
      key: `approve:${d.id}`, icon: 'thumbs-up-outline', color: '#0E7490',
      title: docName(d), sub: 'From FTG. Please review and approve', when: d.created_at, onPress: goDocs,
    }));
  notSent.filter(i => !rejected.has(reqKey(i.service, i.key))).forEach(i => whatsMissing.push({
    key: `need:${i.service}:${i.key}`, icon: 'cloud-upload-outline', color: Colors.accentGold,
    title: i.label, sub: `${suiteOf(i.service)}To upload this month`, onPress: upload,
  }));
  customReqs.filter(r => r.status === 'pending').forEach(r => whatsMissing.push({
    key: `cr:${r.id}`, icon: 'help-circle-outline', color: '#7C3AED',
    title: r.title, sub: r.note ? `Requested by FTG · ${r.note}` : 'Requested by FTG', onPress: upload,
  }));

  // What's Next: what FTG has told them, what FTG is still checking, and next
  // month.
  const inReview = docs.filter(d =>
    !isFromFtg(d) && (d.approval_status ?? 'approved') === 'pending' && ageOf(d.created_at) < REVIEW_FOR);
  const whatsNext: Item[] = notes.map<Item>(n => ({
    key: `note:${n.id}`, icon: 'chatbubble-ellipses-outline', color: Colors.primaryDark,
    title: `Note from ${n.author_name || 'FTG'}`, sub: n.body, full: true, when: n.created_at,
  }));
  if (inReview.length) {
    whatsNext.push({
      key: 'in-review', icon: 'time-outline', color: Colors.accentGold,
      title: `${plural(inReview.length, 'upload')} in review`,
      sub: 'FTG will accept them or tell you what to change', onPress: goDocs,
    });
  }
  if (asksQuestionnaire) {
    whatsNext.push({
      key: 'next-questionnaire', icon: 'calendar-outline', color: '#64748B',
      title: `${formatMonthLabel(nextMonth)} questionnaire`,
      sub: `Opens ${monthName(nextMonth)} 1`,
    });
  }
  if (clientItems.length) {
    whatsNext.push({
      key: 'next-docs', icon: 'calendar-outline', color: '#64748B',
      title: `${plural(clientItems.length, 'document')} to upload in ${monthName(nextMonth)}`,
      sub: clientItems.slice(0, 3).map(i => i.label).join(', ') + (clientItems.length > 3 ? ', and more' : ''),
    });
  }

  // This month's required items, above What's Missing: what they have sent,
  // and how much of it FTG has accepted.
  const reqTotal = clientItems.length;
  const reqSent  = reqTotal - notSent.length;
  const reqOk    = clientItems.filter(i => fulfilled.has(reqKey(i.service, i.key))).length;
  const progress = reqTotal > 0 && !loading ? (
    <View style={c.progress}>
      <View style={c.progressTrack}>
        <View style={[c.progressFill, {
          width: `${(reqSent / reqTotal) * 100}%` as any,
          backgroundColor: reqOk === reqTotal ? Colors.viewed : Colors.primary,
        }]} />
      </View>
      <Text style={c.progressText}>
        {reqSent} of {reqTotal} sent this month{reqOk > 0 ? ` · ${reqOk} accepted` : ''}
      </Text>
    </View>
  ) : null;

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
                <Text style={styles.heroSub}>What's new, what's missing, and what's next</Text>
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

        {/* ── THE THREE COLUMNS ───────────────────────────────────────────── */}
        <View style={phone ? c.columnsPhone : c.columns}>
          <Column
            title="What's New"
            icon="sparkles-outline"
            accent={Colors.primaryDark}
            items={whatsNew}
            count={whatsNew.filter(i => i.fresh).length}
            empty="Nothing new in the last 30 days."
            loading={loading}
            phone={phone}
          />
          <Column
            title="What's Missing"
            icon="alert-circle-outline"
            accent={Colors.error}
            items={whatsMissing}
            empty="Nothing is waiting on you. You're all caught up."
            loading={loading}
            phone={phone}
            header={progress}
          />
          <Column
            title="What's Next"
            icon="calendar-outline"
            accent="#2563EB"
            items={whatsNext}
            empty="Nothing scheduled yet. Notes from FTG will show up here."
            loading={loading}
            phone={phone}
          />
        </View>
      </ScrollView>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const card = {
  backgroundColor: Colors.bgCard, borderRadius: 18, padding: 16, gap: 4,
  borderWidth: 1, borderColor: Colors.border,
  shadowColor: '#3A3131', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
};

const c = StyleSheet.create({
  // Side by side, each column as tall as its own list.
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 20, paddingTop: 24 },
  // A phone: one above the other. No flex on the column here; in a column
  // layout it would start each one at zero height.
  columnsPhone: { gap: 14, paddingHorizontal: 16, paddingTop: 20 },
  col: { ...card, flex: 1, minWidth: 0 },
  colPhone: { ...card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  headIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  count: { minWidth: 24, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  countText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  rowSub: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  newPill: { backgroundColor: Colors.primary, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  newText: { color: '#3A3131', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  rowWhen: { color: Colors.textMuted, fontSize: 11 },
  more: { fontSize: 12, fontWeight: '800', paddingTop: 10, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 22, paddingHorizontal: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  progress: { gap: 6, marginBottom: 8 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.bgMid, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { color: Colors.textMuted, fontSize: 11.5, fontWeight: '600' },
});

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
  heroName: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 4,
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
});
