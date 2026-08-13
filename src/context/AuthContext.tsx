import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BankAccount, normalizeBankAccounts } from '../db/requirements';

export type UserRole = 'client' | 'staff' | 'admin';
export type ClientService = 'BK' | 'TAX' | 'CFO';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  clientId?: string;
  plan?: string;
  role: UserRole;
  services: ClientService[];    // which categories/requirements this client sees
  hasQboAccess: boolean;        // true → hide "Prior Month Bookkeeping / QBO Access"
  bankAccounts: BankAccount[];  // one required Bank Statements slot per account
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (fullName: string, email: string, password: string) => Promise<{ success: boolean; needsConfirmation: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Builds a minimal AuthUser immediately from the session — no DB call needed
function sessionUser(userId: string, email: string): AuthUser {
  return { id: userId, email, name: 'User', role: 'client', services: ['BK'], hasQboAccess: false, bankAccounts: [] };
}

// Enriches AuthUser with profile data from DB (called in background).
//
// Returns null when the profile can't be read — the caller must then KEEP the
// user it already has. Falling through to the defaults below instead would sign
// an admin in as a nameless 'client' and hand them the client portal, which is
// exactly what happens on any query error (bad column, RLS, offline): supabase-js
// resolves with { data: null, error } rather than throwing, so a try/catch does
// not catch it and every `?? fallback` quietly fires at once.
//
// `select('*')` for the same reason: naming columns explicitly means a column
// this build doesn't know about yet — or one whose migration hasn't been run —
// fails the WHOLE query (PostgREST 42703) instead of just being absent.
async function fetchProfile(userId: string, email: string): Promise<AuthUser | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.error('fetchProfile:', error?.message ?? 'no profile row for user');
      return null;
    }

    return {
      id: userId,
      email,
      name: data.full_name ?? 'User',
      clientId: data.client_id,
      plan: data.plan ?? 'Free',
      role: (data.role as UserRole) ?? 'client',
      services: (Array.isArray(data.services) && data.services.length > 0 ? data.services : ['BK']) as ClientService[],
      hasQboAccess: data.has_qbo_access ?? false,
      // Absent until database/profiles_bank_accounts.sql is run → no accounts.
      bankAccounts: normalizeBankAccounts(data.bank_accounts),
    };
  } catch (err: any) {
    console.error('fetchProfile:', err?.message ?? err);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    // Step 1: Fast session check from local storage — no network needed
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Set authenticated immediately with minimal data
        const minimal = sessionUser(session.user.id, session.user.email ?? '');
        setUser(minimal);
        setIsAuthenticated(true);

        // Step 2: Enrich with profile data in background (non-blocking).
        // On failure keep the minimal user rather than overwriting it.
        fetchProfile(session.user.id, session.user.email ?? '').then(profile => {
          if (profile) setUser(profile);
        });
      }
      // Clear loading immediately after session check — don't wait for profile
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });

    // Step 3: Subscribe to future auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setIsAuthenticated(true);
          // Use functional update: if a user already exists (re-fire on web focus/token refresh),
          // keep their current data while silently refreshing the profile so we never
          // briefly reset role to 'client', which would unmount AdminNavigator.
          setUser(prev => {
            fetchProfile(session.user.id, session.user.email ?? '').then(profile => {
              // Never clobber a good user with a failed lookup — that would drop
              // an admin back to the client portal on a transient error.
              if (profile) setUser(profile);
            });
            // Fresh login — show minimal user immediately while profile loads
            if (!prev) return sessionUser(session.user.id, session.user.email ?? '');
            // Already authenticated — preserve current user until profile arrives
            return prev;
          });
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoading(false);
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      const message = authError.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : authError.message;
      setError(message);
      return { success: false, error: message };
    }

    return { success: true };
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    setError(null);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (authError) {
      setError(authError.message);
      return { success: false, needsConfirmation: false, error: authError.message };
    }

    // Create profile manually
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        plan: 'Free',
        role: 'client',
        is_active: true,
      }, { onConflict: 'id' });
    }

    const needsConfirmation = !data.session;
    return { success: true, needsConfirmation };
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setIsAuthenticated(false);
    await supabase.auth.signOut();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const forgotPassword = useCallback(async (email: string) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'financetherapygroup://reset-password',
    });
    if (err) return { success: false, error: err.message };
    return { success: true };
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, error, user, login, register, logout, clearError, forgotPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
