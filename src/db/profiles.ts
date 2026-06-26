import { supabase } from '../lib/supabase';

export type UserRole = 'client' | 'staff' | 'admin';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  client_id: string;
  plan: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) { console.error('getProfile:', error.message); return null; }
  return data;
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

export async function updateClientProfile(userId: string, updates: Partial<Pick<Profile, 'full_name' | 'plan' | 'is_active'>>): Promise<boolean> {
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
  return (data ?? []) as Profile[];
}

export async function getAllStaff(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'staff')
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
