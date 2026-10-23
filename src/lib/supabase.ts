import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// On web, use localStorage. On native, use SecureStore.
const storage = Platform.OS === 'web'
  ? {
      getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
      removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
    }
  : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

// A password-reset link lands back here with a session in the address
// (#access_token=…&type=recovery), or with why it did not work
// (#error=…&error_description=…). supabase-js reads the address and tidies it
// away as it starts, so look first.
const arrivedAt = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.hash}&${window.location.search}`
  : '';
/** Opened from a password-reset email: ask for a new password before anything else. */
export const openedFromResetLink = /type=recovery/.test(arrivedAt);
/** ...and it was an invite (admin-users, invite_client): greet them as new. */
export const openedFromInvite = openedFromResetLink && /[?&]welcome=1\b/.test(arrivedAt);
/** The reset link did not work (expired, or used already), in Supabase's words. */
export const resetLinkError: string | null = (() => {
  const m = /error_description=([^&]*)/.exec(arrivedAt);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
})();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
