import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { View, Platform, AppState } from 'react-native';
import { supabase, openedFromResetLink, resetLinkError } from '../lib/supabase';
import { BankAccount, normalizeBankAccounts } from '../db/requirements';
import { useIdleLogout, IDLE_TIMEOUT_MS, IDLE_GRACE_MS } from '../hooks/useIdleLogout';

// team_one: an outside team that sees only the clients assigned to it
// (database/team_one_access.sql).
export type UserRole = 'client' | 'staff' | 'admin' | 'team_one';
export type ClientService = 'BK' | 'TAX' | 'CFO' | 'YER';

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
  /** Off when switched off on the Staff page (or a client Paused or Closed). */
  isActive?: boolean;
}

/** Why the last session ended — drives the notice shown on the signed-out screen. */
export type SignOutReason = 'idle' | 'deactivated' | null;

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: AuthUser | null;
  /** Set when the session was ended for the user rather than by them. */
  signOutReason: SignOutReason;
  clearSignOutReason: () => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (fullName: string, email: string, password: string) => Promise<{ success: boolean; needsConfirmation: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  /** Re-read the profile after something changed it — closing a bank account, say. */
  refreshProfile: () => Promise<void>;
  /** "Still there?" is being asked, and the session ends at this time unless answered. */
  idlePromptUntil: number | null;
  /** "Yes, keep me signed in." */
  stayIn: () => void;
  /** Signed in by a password-reset link: a new password is needed before anything else. */
  recovering: boolean;
  /** Save the new password chosen after a reset link. */
  finishRecovery: (password: string) => Promise<{ success: boolean; error?: string }>;
  /** A reset link that did not work, to explain on the sign-in page. */
  resetLinkProblem: string | null;
  clearResetLinkProblem: () => void;
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
//
// `maybeSingle()` rather than `single()`: an account with no profiles row is a
// real state — a row deleted while its auth user stayed behind — and single()
// reports it as "Cannot coerce the result to a single JSON object", which reads
// like a broken query rather than a missing row. Telling the two apart is the
// difference between fixing the data and hunting a bug that is not there.
async function fetchProfile(userId: string, email: string): Promise<AuthUser | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('fetchProfile: could not read profiles —', error.message);
      return null;
    }
    if (!data) {
      console.error(
        `fetchProfile: no profiles row for auth user ${userId} (${email}). ` +
        'The account exists in Auth but has no profile, so the app is keeping ' +
        'the minimal signed-in user. Add the row, or delete the auth user.',
      );
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
      isActive: data.is_active !== false,
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
  const [signOutReason, setSignOutReason] = useState<SignOutReason>(null);
  const [recovering, setRecovering] = useState(openedFromResetLink);
  const [resetLinkProblem, setResetLinkProblem] = useState<string | null>(resetLinkError);

  // A staff, admin or Team One login switched off on the Staff page is signed
  // straight back out. Deactivate used to be only a flag, and the person kept
  // full access (database/staff_active_only.sql). Clients are left alone: a
  // Paused or Closed client signs in as before.
  const acceptProfile = useCallback((profile: AuthUser | null) => {
    if (!profile) return;
    if (profile.role !== 'client' && profile.isActive === false) {
      setUser(null);
      setIsAuthenticated(false);
      setSignOutReason('deactivated');
      supabase.auth.signOut();
      return;
    }
    setUser(profile);
  }, []);

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
        fetchProfile(session.user.id, session.user.email ?? '').then(acceptProfile);
      }
      // Clear loading immediately after session check — don't wait for profile
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });

    // Step 3: Subscribe to future auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // A reset link signs the person in; the new password comes first.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
        if (session?.user) {
          setIsAuthenticated(true);
          // Use functional update: if a user already exists (re-fire on web focus/token refresh),
          // keep their current data while silently refreshing the profile so we never
          // briefly reset role to 'client', which would unmount AdminNavigator.
          setUser(prev => {
            // Never clobber a good user with a failed lookup — that would drop
            // an admin back to the client portal on a transient error.
            fetchProfile(session.user.id, session.user.email ?? '').then(acceptProfile);
            // Fresh login — show minimal user immediately while profile loads
            if (!prev) return sessionUser(session.user.id, session.user.email ?? '');
            // Already authenticated — preserve current user until profile arrives
            return prev;
          });
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        setRecovering(false);
      }
      setIsLoading(false);
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setSignOutReason(null);   // a fresh sign-in clears the last session's notice
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
    setSignOutReason(null);   // signing out by hand needs no explanation
    setUser(null);
    setIsAuthenticated(false);
    await supabase.auth.signOut();
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearSignOutReason = useCallback(() => setSignOutReason(null), []);

  // ── Idle sign-out ──────────────────────────────────────────────────────────
  // Applies to every role. Financial documents sit behind this session, so a
  // screen left unattended must not stay signed in.
  //
  // Daja: ask "Still there?" first rather than signing straight out. The
  // session ends only if nobody answers in time.
  const signOutIdle = useCallback(async () => {
    setUser(null);
    setIsAuthenticated(false);
    setSignOutReason('idle');   // the signed-out screen explains what happened
    await supabase.auth.signOut();
  }, []);

  const [idlePromptUntil, setIdlePromptUntil] = useState<number | null>(null);
  const handleIdle = useCallback(() => {
    setIdlePromptUntil(Date.now() + IDLE_GRACE_MS);
  }, []);

  const { notifyActivity, rearm } = useIdleLogout({
    enabled: isAuthenticated,
    onIdle: handleIdle,
    timeoutMs: IDLE_TIMEOUT_MS,
  });

  const stayIn = useCallback(() => {
    setIdlePromptUntil(null);
    rearm();
  }, [rearm]);

  // While the question is up: end the session when its time runs out. Checked
  // on a clock, and again the moment the tab or app comes back, because a
  // backgrounded page's timers run late or not at all.
  useEffect(() => {
    if (!isAuthenticated) { setIdlePromptUntil(null); return; }
    if (idlePromptUntil == null) return;
    const check = () => {
      if (Date.now() >= idlePromptUntil) { setIdlePromptUntil(null); signOutIdle(); }
    };
    const timer = setInterval(check, 1000);
    const onVisible = () => { if (typeof document === 'undefined' || !document.hidden) check(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => {
      clearInterval(timer);
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      sub.remove();
    };
  }, [isAuthenticated, idlePromptUntil, signOutIdle]);

  // The link used to point at financetherapygroup://reset-password, an app
  // address nothing answered, so it led nowhere. It now comes back to this web
  // app, which asks for the new password. The address must be among the
  // Redirect URLs in Supabase → Authentication → URL Configuration, or
  // Supabase sends people to the Site URL instead.
  const forgotPassword = useCallback(async (email: string) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/`
        : 'financetherapygroup://reset-password',
    });
    if (err) return { success: false, error: err.message };
    return { success: true };
  }, []);

  const finishRecovery = useCallback(async (password: string) => {
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) return { success: false, error: err.message };
    setRecovering(false);
    return { success: true };
  }, []);
  const clearResetLinkProblem = useCallback(() => setResetLinkProblem(null), []);

  // Same rule as everywhere else here: on failure keep the user we have rather
  // than replacing them with defaults.
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const profile = await fetchProfile(session.user.id, session.user.email ?? '');
    acceptProfile(profile);
  }, [acceptProfile]);

  return (
    <AuthContext.Provider value={{
      isAuthenticated, isLoading, error, user, signOutReason, clearSignOutReason,
      login, register, logout, clearError, forgotPassword, refreshProfile,
      idlePromptUntil, stayIn,
      recovering, finishRecovery, resetLinkProblem, clearResetLinkProblem,
    }}>
      {/* Web tracks input through DOM listeners. React Native has no global
          input event, so touches are captured here and passed along — the
          capture handler returns false, so it never swallows the gesture. */}
      {Platform.OS === 'web' ? children : (
        <View
          style={{ flex: 1 }}
          onStartShouldSetResponderCapture={() => { notifyActivity(); return false; }}
          onMoveShouldSetResponderCapture={() => { notifyActivity(); return false; }}
        >
          {children}
        </View>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
