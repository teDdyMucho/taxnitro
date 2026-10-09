import { supabase } from './supabase';

// Creating a client's login, changing a client's password and removing a staff
// member, through the admin-users Edge Function (supabase/functions/admin-users).
//
// These used the service-role key straight from the app. That key ends up in
// the web bundle, where anyone can read it and with it every client's files —
// so they go through the function, which holds the key on Supabase's side and
// checks the caller is staff first.

interface Result<T> { data: T | null; error: string | null }

async function call<T>(body: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // The function answers with { error } and a status; surface its words.
    let message = error.message;
    try {
      const j = await (error as any).context?.json?.();
      if (j?.error) message = j.error;
    } catch { /* not JSON — keep the plain message */ }
    return { data: null, error: message };
  }
  if (data?.error) return { data: null, error: data.error };
  return { data: data as T, error: null };
}

/** A client's login and profile. The profile is written even if the login already had one. */
export function createClientAccount(args: {
  email: string;
  password: string;
  fullName: string;
  profile: Record<string, unknown>;
}) {
  return call<{ id: string; profileError: string | null }>({
    action: 'create_client',
    email: args.email,
    password: args.password,
    full_name: args.fullName,
    profile: args.profile,
  });
}

/** A client's password. Staff and admin passwords are not changed here. */
export function setClientPassword(userId: string, password: string) {
  return call<{ ok: true }>({ action: 'set_password', user_id: userId, password });
}

/** Remove a staff or Team One login. Admin only; admins are not removable. */
export function deleteStaffAccount(userId: string) {
  return call<{ ok: true }>({ action: 'delete_staff', user_id: userId });
}
