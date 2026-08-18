import { supabase } from '../lib/supabase';
import type { UserRole } from './profiles';

// Staff invited before they have an account. See database/pending_staff.sql:
// the signup trigger reads these, so the role is already set when they first
// sign in and nobody has to be promoted afterwards.

export interface PendingStaff {
  email: string;
  role: 'admin' | 'staff';
  invited_by: string | null;
  invited_at: string;
}

/** Auth treats emails case-insensitively, so invites are stored lowercased. */
const key = (email: string) => email.trim().toLowerCase();

export async function listPendingStaff(): Promise<PendingStaff[]> {
  const { data, error } = await supabase
    .from('pending_staff')
    .select('*')
    .order('invited_at', { ascending: false });
  if (error) { console.error('listPendingStaff:', error.message); return []; }
  return (data ?? []) as PendingStaff[];
}

/**
 * Invite an email that has no account yet. Re-inviting the same address
 * replaces the previous invite rather than failing, so changing your mind
 * about the role is just inviting again.
 */
export async function invitePendingStaff(
  email: string,
  role: 'admin' | 'staff',
  invitedBy: string | null,
): Promise<PendingStaff | null> {
  const e = key(email);
  if (!e) return null;
  const { data, error } = await supabase
    .from('pending_staff')
    .upsert({ email: e, role, invited_by: invitedBy }, { onConflict: 'email' })
    .select('*')
    .single();
  if (error) { console.error('invitePendingStaff:', error.message); return null; }
  return data as PendingStaff;
}

export async function cancelPendingStaff(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('pending_staff')
    .delete()
    .eq('email', key(email))
    .select('email');
  if (error) { console.error('cancelPendingStaff:', error.message); return false; }
  return !!data && data.length > 0;
}

export type { UserRole };
