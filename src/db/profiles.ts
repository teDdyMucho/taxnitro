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
    .single();

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
