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

const fetchProfile = async (userId: string, email: string): Promise<AuthUser> => {
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
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let initialised = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.email ?? '');
        setUser(profile);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      // Always clear loading on every auth event, not just the first
      initialised = true;
      setIsLoading(false);
    });

    // Safety net: if onAuthStateChange never fires (e.g. no network), stop loading after 5s
    const timeout = setTimeout(() => {
      if (!initialised) {
        initialised = true;
        setIsLoading(false);
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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

    // onAuthStateChange fires automatically and sets isAuthenticated + clears isLoading
    return { success: true };
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    setError(null);
    setIsLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return { success: false, needsConfirmation: false, error: authError.message };
    }

    // Create profile manually (no trigger needed)
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

    setIsLoading(false);
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
