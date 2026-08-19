import { supabase } from '../lib/supabase';
import { BankAccount, normalizeBankAccounts } from './requirements';

export type UserRole = 'client' | 'staff' | 'admin';
export type ClientService = 'BK' | 'TAX' | 'CFO';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  client_id: string;
  plan: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  services: ClientService[];      // which categories/requirements the client sees
  has_qbo_access: boolean;        // true → hide "Prior Month Bookkeeping / QBO Access"
  bank_accounts: BankAccount[];   // one required Bank Statements slot per account
  created_at: string;
  updated_at: string;
}

/** Normalise a profile row so services/qbo/bank accounts always have sane values. */
export function normalizeProfile(p: any): Profile {
  return {
    ...p,
    services: Array.isArray(p?.services) && p.services.length > 0 ? p.services : ['BK'],
    has_qbo_access: p?.has_qbo_access ?? false,
    bank_accounts: normalizeBankAccounts(p?.bank_accounts),
  } as Profile;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    // maybeSingle: no row is an answer, not a failure. See AuthContext.
    .maybeSingle();

  if (error) { console.error('getProfile:', error.message); return null; }
  return data ? normalizeProfile(data) : null;
}

export async function updateProfile(userId: string, updates: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'plan'>>) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) { console.error('updateProfile:', error.message); return null; }
  return data;
}

/**
 * Drop accounts a client has told us are closed, so they stop being asked for
 * next month. Their id is never reused, so the requirement rows already filed
 * against a closed account keep pointing at the right thing.
 *
 * Reads the current list first rather than writing a computed one, so two
 * changes in the same month cannot overwrite each other.
 */
export async function removeBankAccounts(userId: string, ids: string[]): Promise<BankAccount[] | null> {
  if (!userId || ids.length === 0) return null;
  const { data: current, error: readErr } = await supabase
    .from('profiles')
    .select('bank_accounts')
    .eq('id', userId)
    .maybeSingle();
  if (readErr) { console.error('removeBankAccounts (read):', readErr.message); return null; }

  const kept = normalizeBankAccounts(current?.bank_accounts).filter(a => !ids.includes(a.id));
  const { data, error } = await supabase
    .from('profiles')
    .update({ bank_accounts: kept })
    .eq('id', userId)
    .select('bank_accounts')
    .single();
  if (error) { console.error('removeBankAccounts:', error.message); return null; }
  return normalizeBankAccounts(data?.bank_accounts);
}

export async function updateClientProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'full_name' | 'plan' | 'is_active' | 'services' | 'has_qbo_access' | 'bank_accounts'>>,
): Promise<boolean> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) { console.error('updateClientProfile:', error.message); return false; }
  return true;
}

export async function sendPasswordReset(email: string): Promise<boolean> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) { console.error('sendPasswordReset:', error.message); return false; }
  return true;
}

export async function getAllClients(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .order('full_name', { ascending: true });
  if (error) { console.error('getAllClients:', error.message); return []; }
  return (data ?? []).map(normalizeProfile);
}

export async function getAllStaff(): Promise<Profile[]> {
  // Include admins too — they show in the Staff tab (admins first), but their
  // role is not editable there (see StaffManagementScreen).
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['staff', 'admin'])
    .order('full_name', { ascending: true });
  if (error) { console.error('getAllStaff:', error.message); return []; }
  return (data ?? []) as Profile[];
}

export async function updateStaffRole(userId: string, role: UserRole): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) { console.error('updateStaffRole:', error.message); return false; }
  return true;
}

export async function setStaffActive(userId: string, is_active: boolean): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ is_active }).eq('id', userId);
  if (error) { console.error('setStaffActive:', error.message); return false; }
  return true;
}

// ── Deleting a staff member ──────────────────────────────────────────────────
// The workflow tables reference profiles(id) with NO `on delete` clause, so
// Postgres defaults to NO ACTION: a profile still named by a workflow, note,
// query item, message or drive link CANNOT be deleted, and the attempt fails
// with a foreign-key error. Rather than surface that raw, the references are
// counted first so the UI can say what is holding the account and offer
// deactivation instead.

export interface StaffReferences {
  /** Workflows where they are the processor, reviewer or creator. */
  workflows: number;
  /** Notes, query items, checklist ticks, messages and drive links they authored. */
  activity: number;
  total: number;
}

export async function countStaffReferences(userId: string): Promise<StaffReferences> {
  const head = { count: 'exact' as const, head: true };

  const [wf, notes, queries, checks, msgs, links] = await Promise.all([
    supabase.from('workflow_instances').select('id', head)
      .or(`assigned_processor.eq.${userId},assigned_reviewer.eq.${userId},created_by.eq.${userId}`),
    supabase.from('workflow_notes').select('id', head)
      .or(`created_by.eq.${userId},resolved_by.eq.${userId}`),
    supabase.from('workflow_query_items').select('id', head)
      .or(`flagged_by.eq.${userId},resolved_by.eq.${userId}`),
    supabase.from('workflow_checklist_items').select('id', head).eq('checked_by', userId),
    supabase.from('workflow_messages').select('id', head).eq('sender_id', userId),
    supabase.from('workflow_drive_links').select('id', head).eq('saved_by', userId),
  ]);

  const workflows = wf.count ?? 0;
  const activity =
    (notes.count ?? 0) + (queries.count ?? 0) + (checks.count ?? 0) +
    (msgs.count ?? 0) + (links.count ?? 0);

  return { workflows, activity, total: workflows + activity };
}

/**
 * Permanently remove a staff member.
 *
 * Deletes the auth user, which cascades to their profile. Needs the service
 * role — the anon key cannot touch the admin API — and will fail if anything
 * still references them, so call countStaffReferences first.
 */
export async function deleteStaffMember(userId: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return { ok: false, error: 'Service role key not configured.' };

  try {
    const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { ok: true };

    const body = await res.text();
    console.error('deleteStaffMember:', body);
    // A foreign-key violation here means something still points at them.
    if (/foreign key|violates/i.test(body)) {
      return { ok: false, error: 'This member is still linked to workflow records and cannot be deleted.' };
    }
    return { ok: false, error: 'Could not delete this member.' };
  } catch (e: any) {
    console.error('deleteStaffMember:', e?.message ?? e);
    return { ok: false, error: 'Network error. Please try again.' };
  }
}
