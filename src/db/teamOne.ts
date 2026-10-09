import { supabase } from '../lib/supabase';
import type { ClientService } from '../context/AuthContext';
import type { Profile } from './profiles';
import { uploadDocumentToStorage, createDocumentRecord } from './documents';
import { emailAboutUploads } from '../lib/uploadEmail';

// Team One — Camaree's "special user" on the staff side.
//
// Access (database/team_one_access.sql): staff "select and deselect Team One
// Access to different clients and their respective folders over time", per
// service, on the client's Update Profile tray.
//
// Updates and review (database/team_one_updates.sql): Team One reports an
// estimated completion date per service, and for BK and CFO a query sheet link,
// a P&L and a balance sheet. Staff mark each link or file Approved, Denied or
// Escalate. Approving files it into the client's account and tells them;
// denying sends it back to Team One; escalating sends it to Daja, who can send
// it back for revision or leave the client a note.
//
// The database enforces all of it. This module reads and writes it.

/** The services Team One can be given, in the order the tabs show them. */
export const TEAM_ONE_SERVICES: ClientService[] = ['TAX', 'YER', 'BK', 'CFO'];

/** The services Team One reports on — Camaree's list: TAX, BK or CFO. */
export type UpdateService = 'TAX' | 'BK' | 'CFO';
export const UPDATE_SERVICES: UpdateService[] = ['TAX', 'BK', 'CFO'];
/** Those that come with a query sheet, a P&L and a balance sheet. */
export const hasStatements = (svc: UpdateService): svc is 'BK' | 'CFO' => svc === 'BK' || svc === 'CFO';

/** Daja, who escalations go to. */
export const ESCALATION_EMAIL = 'info@financetherapygroup.com';

export type TeamOneKind = 'query_sheet' | 'pnl' | 'balance';
export type TeamOneStatus = 'pending' | 'approved' | 'denied' | 'escalated' | 'revise' | 'noted';

export const KIND_LABEL: Record<TeamOneKind, string> = {
  query_sheet: 'Query Sheet',
  pnl:         'P&L',
  balance:     'Balance Sheet',
};

export const STATUS_LABEL: Record<TeamOneStatus, string> = {
  pending:   'Waiting for review',
  approved:  'Approved',
  denied:    'Denied',
  escalated: 'Escalated to Daja',
  revise:    'Revise',
  noted:     'Note sent to client',
};

export interface TeamOneUpdate {
  id: string;
  client_email: string;
  service: UpdateService;
  /** 'YYYY-MM-DD'. */
  est_completion: string;
  submitted_by: string | null;
  created_at: string;
}

export interface TeamOneItem {
  id: string;
  update_id: string;
  client_email: string;
  service: 'BK' | 'CFO';
  kind: TeamOneKind;
  url: string;
  file_name: string | null;
  status: TeamOneStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  filed_table: string | null;
  filed_document_id: string | null;
  created_at: string;
  /** The update it came in with, for its estimated completion date. */
  team_one_updates?: Pick<TeamOneUpdate, 'est_completion' | 'submitted_by' | 'created_at'> | null;
}

/** Stored lowercased, so a profile kept as CATRICEOLOGY@GMAIL.COM still matches. */
const key = (email: string) => email.trim().toLowerCase();

// ── Access ───────────────────────────────────────────────────────────────────

/**
 * The services this client is assigned to Team One for. Empty when they are
 * not assigned — and when the table is not there yet, so a database that has
 * not run the migration reads as "nobody assigned" rather than an error.
 */
export async function getTeamOneServices(clientEmail: string | null | undefined): Promise<ClientService[]> {
  if (!clientEmail) return [];
  const { data, error } = await supabase
    .from('team_one_assignments')
    .select('services')
    .eq('client_email', key(clientEmail))
    .maybeSingle();
  if (error) { console.warn('getTeamOneServices:', error.message); return []; }
  return ((data?.services ?? []) as ClientService[]).filter(s => TEAM_ONE_SERVICES.includes(s));
}

/** Set them. An empty list takes Team One off this client. */
export async function setTeamOneServices(
  clientEmail: string,
  services: ClientService[],
  assignedBy: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from('team_one_assignments')
    .upsert(
      { client_email: key(clientEmail), services: TEAM_ONE_SERVICES.filter(s => services.includes(s)), assigned_by: assignedBy },
      { onConflict: 'client_email' },
    );
  if (error) { console.error('setTeamOneServices:', error.message); return false; }
  return true;
}

// ── Team One submits ─────────────────────────────────────────────────────────

export interface PickedDoc { uri: string; name: string; mimeType: string }

export interface UpdateEntry {
  service: UpdateService;
  /** 'YYYY-MM-DD'. */
  estCompletion: string;
  querySheetUrl?: string;
  pnl?: PickedDoc | null;
  balance?: PickedDoc | null;
}

/**
 * Send Team One's update for one client: an update per service, and an item
 * per link or file. Files go to documents/team_one/<client email>/, the one
 * place in storage Team One may write. Returns what could not be sent.
 */
export async function submitTeamOneUpdate(
  clientEmail: string,
  entries: UpdateEntry[],
  submittedBy: string | null,
): Promise<{ ok: boolean; failed: string[] }> {
  const email = key(clientEmail);
  const failed: string[] = [];

  for (const e of entries) {
    const { data: up, error } = await supabase
      .from('team_one_updates')
      .insert({ client_email: email, service: e.service, est_completion: e.estCompletion, submitted_by: submittedBy })
      .select('id')
      .single();
    if (error || !up) {
      console.error('submitTeamOneUpdate:', error?.message);
      failed.push(`${e.service} update`);
      continue;
    }
    if (!hasStatements(e.service)) continue;

    const items: Omit<TeamOneItem, 'id' | 'status' | 'review_note' | 'reviewed_by' | 'reviewed_at' | 'filed_table' | 'filed_document_id' | 'created_at'>[] = [];
    const base = { update_id: up.id as string, client_email: email, service: e.service };
    if (e.querySheetUrl?.trim()) {
      items.push({ ...base, kind: 'query_sheet', url: e.querySheetUrl.trim(), file_name: null });
    }
    for (const [kind, doc] of [['pnl', e.pnl], ['balance', e.balance]] as const) {
      if (!doc) continue;
      // documents/team_one/<client email>/<time>_<name> — see the storage policy.
      const url = await uploadDocumentToStorage('team_one', email, doc.uri, doc.name, doc.mimeType);
      if (!url) { failed.push(`${e.service} ${KIND_LABEL[kind]}`); continue; }
      items.push({ ...base, kind, url, file_name: doc.name });
    }
    if (items.length) {
      const { error: itemErr } = await supabase.from('team_one_items').insert(items);
      if (itemErr) {
        console.error('submitTeamOneUpdate items:', itemErr.message);
        failed.push(`${e.service} links and files`);
      }
    }
  }
  return { ok: failed.length === 0, failed };
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Items, newest first — all of them for staff, Team One's own for Team One. */
export async function listTeamOneItems(statuses?: TeamOneStatus[]): Promise<TeamOneItem[]> {
  let q = supabase
    .from('team_one_items')
    .select('*, team_one_updates(est_completion, submitted_by, created_at)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (statuses?.length) q = q.in('status', statuses);
  const { data, error } = await q;
  if (error) { console.warn('listTeamOneItems:', error.message); return []; }
  return (data ?? []) as TeamOneItem[];
}

/** Every update, newest first, for the completion dates — TAX has nothing else. */
export async function listTeamOneUpdates(): Promise<TeamOneUpdate[]> {
  const { data, error } = await supabase
    .from('team_one_updates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) { console.warn('listTeamOneUpdates:', error.message); return []; }
  return (data ?? []) as TeamOneUpdate[];
}

/** How many items wait on these statuses — the badge on the menu. */
export async function countTeamOneItems(statuses: TeamOneStatus[]): Promise<number> {
  const { count, error } = await supabase
    .from('team_one_items')
    .select('id', { count: 'exact', head: true })
    .in('status', statuses);
  if (error) return 0;
  return count ?? 0;
}

// ── Staff review ─────────────────────────────────────────────────────────────

interface Reviewer { email: string | null; name?: string | null; role?: string | null }

async function setStatus(id: string, status: TeamOneStatus, note: string | null, me: Reviewer, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase
    .from('team_one_items')
    .update({ status, review_note: note, reviewed_by: me.email, reviewed_at: new Date().toISOString(), ...extra })
    .eq('id', id)
    .select('id');
  if (error) { console.error('team one review:', error.message); return false; }
  return !!data?.length;
}

/** Back to Team One, with what to fix. */
export const denyItem = (id: string, note: string, me: Reviewer) => setStatus(id, 'denied', note.trim() || null, me);
/** To Daja. */
export const escalateItem = (id: string, note: string, me: Reviewer) => setStatus(id, 'escalated', note.trim() || null, me);
/** Daja sends it back to Team One. */
export const reviseItem = (id: string, note: string, me: Reviewer) => setStatus(id, 'revise', note.trim() || null, me);

/** What the client sees the item called once it is filed. */
export function filedName(item: TeamOneItem): string {
  if (item.kind === 'query_sheet') {
    const when = item.team_one_updates?.est_completion ?? item.created_at.slice(0, 10);
    return `${item.service} Query Sheet — ${when}`;
  }
  return item.file_name || `${item.service} ${KIND_LABEL[item.kind]}`;
}

/**
 * Approve: file it into the folder chosen, as an FTG upload, and tell the
 * client — in the app, and by email once the upload-email flow is on.
 */
export async function approveItem(item: TeamOneItem, table: string, client: Profile, me: Reviewer): Promise<boolean> {
  const name = filedName(item);
  const doc = await createDocumentRecord({
    userId: client.id,
    email: client.email,
    name,
    documentUrl: item.url,
    documentType: table,
    uploadedByRole: me.role === 'admin' ? 'admin' : 'staff',
    uploadedBy: me.email ?? 'staff',
  });
  if (!doc) return false;
  const ok = await setStatus(item.id, 'approved', null, me, { filed_table: table, filed_document_id: doc.id });
  if (!ok) return false;
  await supabase.rpc('notify_client', {
    p_email: client.email,
    p_title: 'New document from FTG',
    p_message: `${name} has been added to your account.`,
  });
  void emailAboutUploads({
    event: 'internal_upload',
    clientEmail: client.email,
    clientName: client.full_name,
    uploadedBy: me.email,
    files: [{ name, table }],
  });
  return true;
}

/**
 * Daja's other answer to an escalation: a note the client can read, which
 * tells them it is there.
 */
export async function noteToClient(item: TeamOneItem, body: string, client: Profile, me: Reviewer): Promise<boolean> {
  const text = body.trim();
  if (!text) return false;
  const { error } = await supabase.from('client_shared_notes').insert({
    client_email: key(client.email),
    body: text,
    author_email: me.email,
    author_name: me.name ?? null,
    source: 'escalation',
  });
  if (error) { console.error('noteToClient:', error.message); return false; }
  const ok = await setStatus(item.id, 'noted', text, me);
  await supabase.rpc('notify_client', {
    p_email: client.email,
    p_title: 'A note from FTG',
    p_message: text.length > 140 ? `${text.slice(0, 137)}…` : text,
  });
  return ok;
}
