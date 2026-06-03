import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole = 'client' | 'staff' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  clientId?: string;
  plan?: string;
  role: UserRole;
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
  return { id: userId, email, name: 'User', role: 'client' };
}

// Enriches AuthUser with profile data from DB (called in background)
async function fetchProfile(userId: string, email: string): Promise<AuthUser> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, client_id, plan, role')
      .eq('id', userId)
      .single();

    return {
      id: userId,
      email,
      name: data?.full_name ?? 'User',
      clientId: data?.client_id,
      plan: data?.plan ?? 'Free',
      role: (data?.role as UserRole) ?? 'client',
    };
  } catch {
    return sessionUser(userId, email);
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

        // Step 2: Enrich with profile data in background (non-blocking)
        fetchProfile(session.user.id, session.user.email ?? '').then(profile => {
          setUser(profile);
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
          const minimal = sessionUser(session.user.id, session.user.email ?? '');
          setUser(minimal);
          setIsAuthenticated(true);
          // Load full profile in background
          fetchProfile(session.user.id, session.user.email ?? '').then(profile => {
            setUser(profile);
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
