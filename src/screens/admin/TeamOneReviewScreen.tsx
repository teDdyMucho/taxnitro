import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Modal, Pressable,
  ActivityIndicator, RefreshControl, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useSheetStyles } from '../../hooks/useSheetStyles';
import { getAllClients, Profile } from '../../db/profiles';
import { moveDestinations } from '../../lib/folderCatalog';
import {
  listTeamOneItems, listTeamOneUpdates, approveItem, denyItem, escalateItem, reviseItem, noteToClient,
  filedName, KIND_LABEL, STATUS_LABEL, ESCALATION_EMAIL,
  type TeamOneItem, type TeamOneUpdate, type TeamOneStatus,
} from '../../db/teamOne';

// Team One's links and files, and what FTG decided about each.
//
// Staff (the Team One tab): Camaree — "The alerts should show up requiring a
// team member on the FTG side to mark the Link, or uploads as: Approved,
// Denied, Escalate." What is waiting is the alert; the menu carries its count.
// Escalated items are Daja's: she sends them back for revision, or leaves the
// client a note. Admins can act on them too, so nothing waits on one person.
//
// Team One (My Updates): the same items, read only — what needs fixing, what is
// waiting, what is done.

type Mode = 'staff' | 'team';
type TabKey = 'waiting' | 'escalated' | 'fix' | 'done';

const TABS: Record<Mode, { key: TabKey; label: string; statuses: TeamOneStatus[] }[]> = {
  staff: [
    { key: 'waiting',   label: 'Waiting',   statuses: ['pending'] },
    { key: 'escalated', label: 'Escalated', statuses: ['escalated'] },
    { key: 'done',      label: 'Done',      statuses: ['approved', 'denied', 'revise', 'noted'] },
  ],
  team: [
    { key: 'fix',     label: 'Needs fixing', statuses: ['denied', 'revise'] },
    { key: 'waiting', label: 'Waiting',      statuses: ['pending', 'escalated'] },
    { key: 'done',    label: 'Done',         statuses: ['approved', 'noted'] },
  ],
};

const STATUS_COLOR: Record<TeamOneStatus, { bg: string; text: string }> = {
  pending:   { bg: '#FEF3C7', text: '#B45309' },
  escalated: { bg: '#EDE9FE', text: '#6D28D9' },
  approved:  { bg: '#DCFCE7', text: '#15803D' },
  noted:     { bg: '#DCFCE7', text: '#15803D' },
  denied:    { bg: '#FEE2E2', text: '#B91C1C' },
  revise:    { bg: '#FEE2E2', text: '#B91C1C' },
};

const KIND_ICON = { query_sheet: 'link-outline', pnl: 'document-text-outline', balance: 'document-text-outline' } as const;

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Where an approved item is offered to go first. */
function suggestedFolder(item: TeamOneItem): string {
  const svc = item.service.toLowerCase();
  return item.kind === 'query_sheet' ? `${svc}_mr_required_info` : `${svc}_mr_client_review`;
}

type NoteAction = 'deny' | 'escalate' | 'revise' | 'note';
const NOTE_COPY: Record<NoteAction, { title: string; hint: string; button: string; required: boolean }> = {
  deny:     { title: 'Deny', hint: 'Tell Team One what to fix.', button: 'Send back to Team One', required: true },
  escalate: { title: 'Escalate to Daja', hint: 'Anything Daja should know (optional).', button: 'Escalate', required: false },
  revise:   { title: 'Revise', hint: 'Tell Team One what to change.', button: 'Send back to Team One', required: true },
  note:     { title: 'Note for the client', hint: 'The client reads this and is told it is there.', button: 'Send to client', required: true },
};

export function TeamOneReviewScreen({ mode, onChanged }: { mode: Mode; onChanged?: () => void }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems]       = useState<TeamOneItem[]>([]);
  const [updates, setUpdates]   = useState<TeamOneUpdate[]>([]);
  const [clients, setClients]   = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]           = useState<TabKey>(mode === 'staff' ? 'waiting' : 'fix');
  const [approveFor, setApproveFor] = useState<TeamOneItem | null>(null);
  const [noteFor, setNoteFor]   = useState<{ item: TeamOneItem; action: NoteAction } | null>(null);
  const [toast, setToast]       = useState<string | null>(null);

  const me = { email: user?.email ?? null, name: user?.name ?? null, role: user?.role ?? null };
  const canDecideEscalated = mode === 'staff'
    && (user?.role === 'admin' || (user?.email ?? '').toLowerCase() === ESCALATION_EMAIL);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    const [it, up, cl] = await Promise.all([listTeamOneItems(), listTeamOneUpdates(), getAllClients()]);
    setItems(it);
    setUpdates(up);
    setClients(new Map(cl.map(c => [c.email.toLowerCase(), c])));
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const afterChange = async (msg: string) => { showToast(msg); await load(); onChanged?.(); };

  const tabs = TABS[mode];
  const statusesOf = (k: TabKey) => tabs.find(t => t.key === k)?.statuses ?? [];
  const countOf = (k: TabKey) => items.filter(i => statusesOf(k).includes(i.status)).length;
  const shown = items.filter(i => statusesOf(tab).includes(i.status));

  // One group per client, in the order their newest item came in.
  const groups = useMemo(() => {
    const m = new Map<string, TeamOneItem[]>();
    shown.forEach(i => m.set(i.client_email, [...(m.get(i.client_email) ?? []), i]));
    return [...m.entries()];
  }, [shown]);

  // The latest completion date per client and service.
  const dates = useMemo(() => {
    const seen = new Set<string>();
    return updates.filter(u => {
      const k = `${u.client_email}|${u.service}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [updates]);

  const nameOf = (email: string) => {
    const c = clients.get(email);
    return c?.company_name || c?.full_name || email;
  };

  const open = (url: string) => {
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else Linking.openURL(url);
  };

  const card = (item: TeamOneItem) => {
    const look = STATUS_COLOR[item.status];
    const due = item.team_one_updates?.est_completion;
    return (
      <View key={item.id} style={s.card}>
        <View style={s.cardHead}>
          <Ionicons name={KIND_ICON[item.kind]} size={16} color={Colors.primaryDark} />
          <Text style={s.kind}>{KIND_LABEL[item.kind]}</Text>
          <View style={s.svc}><Text style={s.svcText}>{item.service}</Text></View>
          <View style={{ flex: 1 }} />
          <View style={[s.status, { backgroundColor: look.bg }]}>
            <Text style={[s.statusText, { color: look.text }]}>{STATUS_LABEL[item.status]}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => open(item.url)} activeOpacity={0.7}>
          <Text style={s.link} numberOfLines={1}>{item.file_name || item.url}</Text>
        </TouchableOpacity>
        <Text style={s.meta}>
          Due {fmtDay(due)} · Sent {fmtDay(item.created_at)}
          {mode === 'staff' && item.team_one_updates?.submitted_by ? ` by ${item.team_one_updates.submitted_by}` : ''}
        </Text>
        {item.review_note ? <Text style={s.reviewNote}>“{item.review_note}”</Text> : null}
        {item.status === 'approved' && item.filed_table ? (
          <Text style={s.meta}>Filed as “{filedName(item)}”</Text>
        ) : null}

        {mode === 'staff' && item.status === 'pending' && (
          <View style={s.actions}>
            <TouchableOpacity style={[s.act, s.actApprove]} onPress={() => setApproveFor(item)} activeOpacity={0.8}>
              <Ionicons name="checkmark" size={14} color="#15803D" /><Text style={[s.actText, { color: '#15803D' }]}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.act, s.actDeny]} onPress={() => setNoteFor({ item, action: 'deny' })} activeOpacity={0.8}>
              <Ionicons name="close" size={14} color="#B91C1C" /><Text style={[s.actText, { color: '#B91C1C' }]}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.act, s.actEscalate]} onPress={() => setNoteFor({ item, action: 'escalate' })} activeOpacity={0.8}>
              <Ionicons name="arrow-up" size={14} color="#6D28D9" /><Text style={[s.actText, { color: '#6D28D9' }]}>Escalate</Text>
            </TouchableOpacity>
          </View>
        )}
        {mode === 'staff' && item.status === 'escalated' && (
          canDecideEscalated ? (
            <View style={s.actions}>
              <TouchableOpacity style={[s.act, s.actDeny]} onPress={() => setNoteFor({ item, action: 'revise' })} activeOpacity={0.8}>
                <Ionicons name="return-down-back" size={14} color="#B91C1C" /><Text style={[s.actText, { color: '#B91C1C' }]}>Revise</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.act, s.actApprove]} onPress={() => setNoteFor({ item, action: 'note' })} activeOpacity={0.8}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#15803D" /><Text style={[s.actText, { color: '#15803D' }]}>Note to client</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={s.meta}>Waiting on Daja.</Text>
          )
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.title}>{mode === 'staff' ? 'Team One' : 'My Updates'}</Text>
        <Text style={s.sub}>
          {mode === 'staff'
            ? 'Links and files from Team One, waiting on a decision.'
            : 'What you sent, and what FTG decided.'}
        </Text>
      </LinearGradient>

      <View style={s.tabBar}>
        {tabs.map(t => {
          const on = tab === t.key;
          const n = countOf(t.key);
          return (
            <TouchableOpacity key={t.key} style={[s.tab, on && s.tabOn]} onPress={() => setTab(t.key)} activeOpacity={0.8}>
              <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{t.label}</Text>
              <View style={[s.count, on && s.countOn]}><Text style={[s.countText, on && s.countTextOn]}>{n}</Text></View>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        >
          {groups.length === 0 ? (
            <Text style={s.empty}>Nothing here.</Text>
          ) : groups.map(([email, list]) => (
            <View key={email} style={{ gap: 8 }}>
              <Text style={s.client}>{nameOf(email)}</Text>
              {list.map(card)}
            </View>
          ))}

          {dates.length > 0 && (
            <View style={s.dates}>
              <Text style={s.datesTitle}>Estimated completion</Text>
              {dates.map(u => (
                <View key={u.id} style={s.dateRow}>
                  <Text style={s.dateClient} numberOfLines={1}>{nameOf(u.client_email)}</Text>
                  <View style={s.svc}><Text style={s.svcText}>{u.service}</Text></View>
                  <Text style={s.dateDue}>{fmtDay(u.est_completion)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {approveFor && (
        <ApproveSheet
          item={approveFor}
          client={clients.get(approveFor.client_email) ?? null}
          onClose={() => setApproveFor(null)}
          onApprove={async table => {
            const client = clients.get(approveFor.client_email);
            if (!client) return false;
            const ok = await approveItem(approveFor, table, client, me);
            if (ok) { setApproveFor(null); await afterChange('Approved and filed. The client has been told.'); }
            return ok;
          }}
        />
      )}

      {noteFor && (
        <NoteSheet
          action={noteFor.action}
          onClose={() => setNoteFor(null)}
          onSend={async text => {
            const { item, action } = noteFor;
            const client = clients.get(item.client_email);
            const ok =
              action === 'deny'     ? await denyItem(item.id, text, me) :
              action === 'escalate' ? await escalateItem(item.id, text, me) :
              action === 'revise'   ? await reviseItem(item.id, text, me) :
              client                ? await noteToClient(item, text, client, me) : false;
            if (ok) {
              setNoteFor(null);
              await afterChange(
                action === 'escalate' ? 'Escalated to Daja.'
                  : action === 'note' ? 'Note sent to the client.'
                  : 'Sent back to Team One.');
            }
            return ok;
          }}
        />
      )}

      {toast && (
        <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>
      )}
    </View>
  );
}

// ── Approve: choose the folder ───────────────────────────────────────────────

function ApproveSheet({ item, client, onClose, onApprove }: {
  item: TeamOneItem;
  client: Profile | null;
  onClose: () => void;
  onApprove: (table: string) => Promise<boolean>;
}) {
  const sheet = useSheetStyles('md');
  const groups = moveDestinations('', [item.service]);
  const all = groups.flatMap(g => g.folders);
  const [table, setTable] = useState(all.some(f => f.key === suggestedFolder(item)) ? suggestedFolder(item) : all[0]?.key ?? '');
  const [busy, setBusy]   = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[m.overlay, sheet.overlay]} onPress={busy ? undefined : onClose}>
        <Pressable style={[m.sheet, sheet.sheet]} onPress={() => {}}>
          <View style={m.handle} />
          <Text style={m.title}>Approve {KIND_LABEL[item.kind]}</Text>
          <Text style={m.sub}>
            Files “{filedName(item)}” into {client?.company_name || client?.full_name || item.client_email}'s
            account and tells them it is there.
          </Text>
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 6 }}>
            {all.map(f => {
              const on = table === f.key;
              return (
                <TouchableOpacity key={f.key} style={[m.folder, on && m.folderOn]} onPress={() => setTable(f.key)} activeOpacity={0.8}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={16} color={on ? Colors.primary : Colors.textMuted} />
                  <Text style={[m.folderText, on && { color: Colors.textPrimary, fontWeight: '700' }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!client && <Text style={m.error}>This client's account could not be found.</Text>}
          {failed && <Text style={m.error}>Could not file it. Try again.</Text>}
          <View style={m.row}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose} disabled={busy}><Text style={m.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity
              style={[m.sendBtn, (!client || !table || busy) && { opacity: 0.5 }]}
              disabled={!client || !table || busy}
              onPress={async () => { setBusy(true); setFailed(false); const ok = await onApprove(table); setBusy(false); if (!ok) setFailed(true); }}
            >
              {busy ? <ActivityIndicator color="#3A3131" size="small" /> : <Text style={m.sendText}>Approve & File</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Deny, escalate, revise, or a note for the client ─────────────────────────

function NoteSheet({ action, onClose, onSend }: {
  action: NoteAction;
  onClose: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const sheet = useSheetStyles('md');
  const copy = NOTE_COPY[action];
  const [text, setText]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [failed, setFailed] = useState(false);
  const blocked = (copy.required && !text.trim()) || busy;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[m.overlay, sheet.overlay]} onPress={busy ? undefined : onClose}>
        <Pressable style={[m.sheet, sheet.sheet]} onPress={() => {}}>
          <View style={m.handle} />
          <Text style={m.title}>{copy.title}</Text>
          <Text style={m.sub}>{copy.hint}</Text>
          <TextInput
            style={m.input}
            value={text}
            onChangeText={setText}
            placeholder="Type here…"
            placeholderTextColor={Colors.textMuted}
            multiline
          />
          {failed && <Text style={m.error}>Could not send. Try again.</Text>}
          <View style={m.row}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose} disabled={busy}><Text style={m.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity
              style={[m.sendBtn, blocked && { opacity: 0.5 }]}
              disabled={blocked}
              onPress={async () => { setBusy(true); setFailed(false); const ok = await onSend(text); setBusy(false); if (!ok) setFailed(true); }}
            >
              {busy ? <ActivityIndicator color="#3A3131" size="small" /> : <Text style={m.sendText}>{copy.button}</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  header: { paddingHorizontal: 20, paddingBottom: 18, gap: 4 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  tabBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: Colors.bgMid, borderWidth: 1, borderColor: Colors.border, flexShrink: 1,
  },
  tabOn: { backgroundColor: '#FFFFFF', borderColor: '#B5905B' },
  tabText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  tabTextOn: { color: Colors.textPrimary },
  count: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  countOn: { backgroundColor: '#E8B923' },
  countText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800' },
  countTextOn: { color: '#3A3131' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
  client: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  card: { backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kind: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  svc: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: Colors.bgMid },
  svcText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  status: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '800' },
  link: { color: '#1D4ED8', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  meta: { color: Colors.textMuted, fontSize: 12 },
  reviewNote: { color: Colors.textSecondary, fontSize: 13, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  actApprove: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  actDeny: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  actEscalate: { backgroundColor: '#F5F3FF', borderColor: '#C4B5FD' },
  actText: { fontSize: 12, fontWeight: '800' },
  dates: { backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 8, marginTop: 6 },
  datesTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateClient: { flex: 1, color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  dateDue: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 28, backgroundColor: '#3A3131', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 28, gap: 10, maxHeight: '88%' },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 13 },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgMid },
  folderOn: { borderColor: 'rgba(232,185,35,0.5)', backgroundColor: 'rgba(232,185,35,0.1)' },
  folderText: { color: Colors.textSecondary, fontSize: 14 },
  input: { minHeight: 90, textAlignVertical: 'top', backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
  error: { color: Colors.error, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgMid, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  sendBtn: { flex: 2, backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sendText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
});
