import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Alert,
  Modal, Pressable, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import {
  getAllClients, updateClientProfile, sendPasswordReset, Profile,
} from '../../db/profiles';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLANS = ['Free', 'Basic', 'Pro', 'Enterprise'] as const;

const PLAN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Free:       { bg: '#F3F4F6', text: '#6B7280',  border: '#E5E7EB' },
  Basic:      { bg: '#EFF6FF', text: '#2563EB',  border: '#BFDBFE' },
  Pro:        { bg: '#FEF3C7', text: '#B5905B',  border: '#FDE68A' },
  Enterprise: { bg: '#F5F3FF', text: '#7C3AED',  border: '#DDD6FE' },
};

const AVATAR_GRADIENTS: [string, string][] = [
  ['#E8B923', '#B5905B'],
  ['#10B981', '#059669'],
  ['#3B82F6', '#1D4ED8'],
  ['#8B5CF6', '#7C3AED'],
  ['#EC4899', '#DB2777'],
  ['#06B6D4', '#0891B2'],
];

function avatarGradient(name: string): [string, string] {
  const code = (name ?? '?').charCodeAt(0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[code];
}

function mkInitials(name: string) {
  return (name ?? '?').split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={toast.wrap}>
      <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
      <Text style={toast.text}>{message}</Text>
    </View>
  );
}

const toast = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: 28, left: 24, right: 24, zIndex: 9999,
    backgroundColor: '#3A3131', borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 14,
    shadowColor: '#3A3131', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
  },
  text: { color: Colors.white, fontSize: 14, fontWeight: '600', flex: 1 },
});

// ── Add Client Modal ──────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase';

// Inlined at bundle time by Metro — must be top-level, not inside a function
const SUPABASE_URL         = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY     = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? '';

function generateClientId(): string {
  return 'TN-' + Math.random().toString(16).slice(2, 10).toUpperCase();
}

function generatePassword(): string {
  const upper  = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$!';
  const all = upper + lower + digits + special;
  let pwd = upper[Math.floor(Math.random() * upper.length)]
          + lower[Math.floor(Math.random() * lower.length)]
          + digits[Math.floor(Math.random() * digits.length)]
          + special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < 10; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

function AddClientModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [fullName, setFullName]     = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [plan, setPlan]             = useState<string>('Free');
  const [step, setStep]             = useState<'form' | 'success' | 'error'>('form');
  const [loading, setLoading]       = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');

  const reset = () => {
    setFullName(''); setEmail(''); setPassword(''); setPlan('Free');
    setStep('form'); setErrorMsg(''); setShowPass(false);
  };

  const handleClose = () => { reset(); onClose(); };
  const handleDone  = () => { reset(); onDone(); };

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 8) return;
    setLoading(true);
    setErrorMsg('');
    try {
      if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY === 'your_service_role_key_here') {
        setErrorMsg('Service role key not configured. Add EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY to your .env file.');
        return;
      }

      // Use Supabase Admin API — bypasses email verification and signup restrictions
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email:         email.trim(),
          password:      password.trim(),
          email_confirm: true,           // auto-confirm, no verification email
          user_metadata: { full_name: fullName.trim() },
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json?.message ?? json?.msg ?? 'Failed to create account.');
        return;
      }

      const userId = json?.id;

      // Save profile using service role key (bypasses RLS)
      if (userId) {
        const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
          method: 'POST',
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            id: userId,
            email: email.trim(),
            full_name: fullName.trim(),
            client_id: generateClientId(),
            plan,
            role: 'client',
            is_active: true,
          }),
        });
        if (!profileRes.ok) {
          const profileErr = await profileRes.text();
          console.error('Profile insert error:', profileErr);
        }
      }

      setStep('success');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={ac.overlay} onPress={handleClose}>
        <Pressable style={ac.sheet} onPress={() => {}}>
          {/* Handle bar */}
          <View style={ac.handle} />

          {step === 'success' ? (
            /* ── Success ── */
            <>
              <View style={ac.successIconWrap}>
                <LinearGradient colors={['#E8B923', '#B5905B']} style={ac.successIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Ionicons name="checkmark" size={32} color="#3A3131" />
                </LinearGradient>
              </View>
              <Text style={ac.title}>Client Created!</Text>
              <Text style={ac.subtitle}>Share these credentials with your client to log in.</Text>

              <View style={ac.credBox}>
                <View style={ac.credRow}>
                  <Text style={ac.credLabel}>Email</Text>
                  <Text style={ac.credValue}>{email}</Text>
                </View>
                <View style={ac.credDivider} />
                <View style={ac.credRow}>
                  <Text style={ac.credLabel}>Password</Text>
                  <Text style={ac.credValue}>{password}</Text>
                </View>
              </View>

              <View style={ac.infoBox}>
                <Ionicons name="shield-checkmark-outline" size={15} color="#E8B923" style={{ marginTop: 1 }} />
                <Text style={ac.infoText}>Account created successfully. The client can log in immediately with the credentials above.</Text>
              </View>

              <TouchableOpacity style={ac.primaryBtn} onPress={handleDone}>
                <Text style={ac.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ── Form ── */
            <>
              <Text style={ac.title}>Add New Client</Text>
              <Text style={ac.subtitle}>Create a client account directly — no email verification needed.</Text>

              {/* Full Name */}
              <View style={ac.fieldGroup}>
                <Text style={ac.label}>Full Name</Text>
                <View style={ac.inputRow}>
                  <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                  <TextInput style={ac.input} placeholder="e.g. Jane Smith" placeholderTextColor={Colors.textMuted} value={fullName} onChangeText={setFullName} />
                </View>
              </View>

              {/* Email */}
              <View style={ac.fieldGroup}>
                <Text style={ac.label}>Email Address</Text>
                <View style={ac.inputRow}>
                  <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                  <TextInput style={ac.input} placeholder="client@example.com" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>

              {/* Password */}
              <View style={ac.fieldGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={ac.label}>Password</Text>
                  <TouchableOpacity onPress={() => setPassword(generatePassword())} style={ac.genBtn}>
                    <Ionicons name="shuffle-outline" size={13} color="#E8B923" />
                    <Text style={ac.genBtnText}>Generate</Text>
                  </TouchableOpacity>
                </View>
                <View style={ac.inputRow}>
                  <Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted} />
                  <TextInput style={ac.input} placeholder="Min. 8 characters" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry={!showPass} autoCapitalize="none" />
                  <TouchableOpacity onPress={() => setShowPass(p => !p)}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Plan */}
              <View style={ac.fieldGroup}>
                <Text style={ac.label}>Plan</Text>
                <View style={ac.planRow}>
                  {PLANS.map(p => {
                    const active = plan === p;
                    const pc = PLAN_COLORS[p];
                    return (
                      <TouchableOpacity key={p} style={[ac.planBtn, active && { backgroundColor: pc.bg, borderColor: pc.border }]} onPress={() => setPlan(p)} activeOpacity={0.75}>
                        <Text style={[ac.planBtnText, active && { color: pc.text, fontWeight: '700' }]}>{p}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Error */}
              {!!errorMsg && (
                <View style={ac.errorBox}>
                  <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                  <Text style={ac.errorText}>{errorMsg}</Text>
                </View>
              )}

              {/* Actions */}
              <View style={ac.actionRow}>
                <TouchableOpacity style={ac.cancelBtn} onPress={handleClose} activeOpacity={0.75}>
                  <Text style={ac.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ac.primaryBtn, { flex: 2 }, (!fullName.trim() || !email.trim() || password.length < 8 || loading) && ac.primaryBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!fullName.trim() || !email.trim() || password.length < 8 || loading}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color="#3A3131" size="small" />
                    : <><Ionicons name="person-add-outline" size={15} color="#3A3131" />
                  <Text style={ac.primaryBtnText}>Create Client</Text></>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ac = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 28,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  successIconWrap: { alignItems: 'center', marginTop: 8, marginBottom: 4 },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary + '14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  linkText: { flex: 1, color: Colors.primary, fontSize: 13, fontWeight: '600' },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoText: { flex: 1, color: '#1D4ED8', fontSize: 12, lineHeight: 18 },
  fieldGroup: { gap: 7 },
  label: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  planRow: { flexDirection: 'row', gap: 7 },
  planBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: Colors.bgMid,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  planBtnText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.bgMid,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#E8B923',
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  primaryBtnText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },

  // Password generate button
  genBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(232,185,35,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(232,185,35,0.3)' },
  genBtnText: { color: '#E8B923', fontSize: 11, fontWeight: '700' },

  // Credentials display
  credBox: { width: '100%', backgroundColor: '#FAFAF8', borderRadius: 12, borderWidth: 1, borderColor: '#E8E0D0', overflow: 'hidden' },
  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  credDivider: { height: 1, backgroundColor: '#E8E0D0' },
  credLabel: { color: '#A8998A', fontSize: 12, fontWeight: '600' },
  credValue: { color: '#1C1713', fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' },

  // Error
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA', width: '100%' },
  errorText: { flex: 1, color: '#DC2626', fontSize: 12, lineHeight: 17 },
});

// ── Manage Client Modal ───────────────────────────────────────────────────────

function ManageModal({
  client,
  onClose,
  onSave,
  onViewDocs,
}: {
  client: Profile;
  onClose: () => void;
  onSave: (updated: Profile) => void;
  onViewDocs: (client: Profile) => void;
}) {
  const [name, setName]           = useState(client.full_name ?? '');
  const [plan, setPlan]           = useState(client.plan ?? 'Free');
  const [active, setActive]       = useState(client.is_active ?? true);
  const [saving, setSaving]       = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [toastMsg, setToastMsg]   = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateClientProfile(client.id, { full_name: name, plan, is_active: active });
    setSaving(false);
    if (ok) {
      showToast('Client updated successfully');
      onSave({ ...client, full_name: name, plan, is_active: active });
    } else {
      showToast('Failed to update client');
    }
  };

  const handleReset = async () => {
    const ok = await sendPasswordReset(client.email);
    if (ok) { setResetSent(true); showToast('Password reset email sent'); }
    else showToast('Failed to send reset email');
  };

  const grad = avatarGradient(client.full_name);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={mm.overlay} onPress={onClose}>
        <Pressable style={mm.sheet} onPress={() => {}}>
          {/* Handle bar */}
          <View style={mm.handle} />

          {/* Avatar + identity */}
          <View style={mm.top}>
            <LinearGradient
              colors={grad}
              style={mm.avatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={mm.avatarText}>{mkInitials(client.full_name)}</Text>
            </LinearGradient>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={mm.clientName}>{client.full_name || 'Unnamed'}</Text>
              <Text style={mm.clientEmail}>{client.email}</Text>
              <View style={[mm.statusBadge, active ? mm.statusBadgeActive : mm.statusBadgeInactive]}>
                <View style={[mm.statusDot, { backgroundColor: active ? '#22C55E' : Colors.error }]} />
                <Text style={[mm.statusText, { color: active ? '#22C55E' : Colors.error }]}>
                  {active ? 'Active' : 'Deactivated'}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18 }}>
            {/* Full Name */}
            <View style={mm.field}>
              <Text style={mm.label}>Full Name</Text>
              <View style={mm.inputWrap}>
                <Ionicons name="person-outline" size={15} color={Colors.textMuted} />
                <TextInput
                  style={mm.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name..."
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            {/* Plan */}
            <View style={mm.field}>
              <Text style={mm.label}>Plan</Text>
              <View style={mm.planRow}>
                {PLANS.map(p => {
                  const isActive = plan === p;
                  const pc = PLAN_COLORS[p];
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[mm.planBtn, isActive && { backgroundColor: pc.bg, borderColor: pc.border }]}
                      onPress={() => setPlan(p)}
                      activeOpacity={0.75}
                    >
                      <Text style={[mm.planText, isActive && { color: pc.text, fontWeight: '700' }]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Status */}
            <View style={mm.field}>
              <Text style={mm.label}>Account Status</Text>
              <View style={mm.toggleRow}>
                <TouchableOpacity
                  style={[mm.toggleBtn, active && mm.toggleBtnActive]}
                  onPress={() => setActive(true)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={active ? '#22C55E' : Colors.textMuted} />
                  <Text style={[mm.toggleText, active && { color: '#22C55E' }]}>Active</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[mm.toggleBtn, !active && mm.toggleBtnDanger]}
                  onPress={() => setActive(false)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="ban-outline" size={16} color={!active ? Colors.error : Colors.textMuted} />
                  <Text style={[mm.toggleText, !active && { color: Colors.error }]}>Deactivated</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={mm.field}>
              <Text style={mm.label}>Quick Actions</Text>
              <View style={mm.actionGrid}>
                <TouchableOpacity style={mm.actionCard} onPress={() => onViewDocs(client)} activeOpacity={0.75}>
                  <View style={[mm.actionIcon, { backgroundColor: '#DBEAFE' }]}>
                    <Ionicons name="documents-outline" size={20} color="#2563EB" />
                  </View>
                  <Text style={mm.actionLabel}>View Documents</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={mm.actionCard}
                  onPress={handleReset}
                  disabled={resetSent}
                  activeOpacity={0.75}
                >
                  <View style={[mm.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons
                      name={resetSent ? 'checkmark-circle-outline' : 'key-outline'}
                      size={20}
                      color="#D97706"
                    />
                  </View>
                  <Text style={mm.actionLabel}>{resetSent ? 'Email Sent' : 'Reset Password'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Info card */}
            <View style={mm.infoCard}>
              <View style={mm.infoRow}>
                <Text style={mm.infoLabel}>Member Since</Text>
                <Text style={mm.infoValue}>
                  {new Date(client.created_at).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </Text>
              </View>
              <View style={[mm.infoRow, mm.infoRowBorder]}>
                <Text style={mm.infoLabel}>Client ID</Text>
                <Text style={mm.infoValue} numberOfLines={1}>{client.id.slice(0, 16)}…</Text>
              </View>
              <View style={mm.infoRow}>
                <Text style={mm.infoLabel}>Current Plan</Text>
                <Text style={[mm.infoValue, { color: PLAN_COLORS[client.plan]?.text ?? Colors.textPrimary }]}>
                  {client.plan}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={mm.footer}>
            <TouchableOpacity style={mm.cancelBtn} onPress={onClose} activeOpacity={0.75}>
              <Text style={mm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mm.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={mm.saveText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>

          <Toast message={toastMsg} visible={toastVisible} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const mm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 28,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 18,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 22,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  avatar: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontSize: 22, fontWeight: '800' },
  clientName: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  clientEmail: { color: Colors.textMuted, fontSize: 12 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusBadgeActive:   { backgroundColor: '#22C55E18', borderColor: '#22C55E50' },
  statusBadgeInactive: { backgroundColor: Colors.error + '18', borderColor: Colors.error + '50' },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  field: { gap: 9 },
  label: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  planRow: { flexDirection: 'row', gap: 8 },
  planBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: Colors.bgMid,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  planText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgMid,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtnActive: { backgroundColor: '#22C55E18', borderColor: '#22C55E50' },
  toggleBtnDanger: { backgroundColor: Colors.error + '18', borderColor: Colors.error + '50' },
  toggleText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  actionGrid: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.bgMid,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  infoCard: {
    backgroundColor: Colors.bgMid,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  infoRowBorder: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  infoLabel: { color: Colors.textMuted, fontSize: 12 },
  infoValue: { color: Colors.textPrimary, fontSize: 12, fontWeight: '700', maxWidth: 180 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 22 },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.bgMid,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  saveBtn: {
    flex: 2,
    backgroundColor: '#E8B923',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  saveText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

interface Props {
  onSelectClient: (client: Profile) => void;
}

export function ClientListScreen({ onSelectClient }: Props) {
  const insets = useSafeAreaInsets();
  const [clients, setClients]       = useState<Profile[]>([]);
  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [managing, setManaging]     = useState<Profile | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [toastMsg, setToastMsg]     = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2600);
  };

  const { isLoading: authLoading } = useAuth();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, 12000);
    try { setClients(await getAllClients()); }
    catch (e) { console.error(e); }
    finally { clearTimeout(safetyTimer); setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (!authLoading) load(); }, [authLoading]);

  const filtered = query.trim()
    ? clients.filter(c =>
        c.full_name?.toLowerCase().includes(query.toLowerCase()) ||
        c.email?.toLowerCase().includes(query.toLowerCase())
      )
    : clients;

  const activeCount   = clients.filter(c => c.is_active).length;
  const inactiveCount = clients.length - activeCount;

  const renderItem = ({ item }: { item: Profile }) => {
    const grad = avatarGradient(item.full_name);
    const pc   = PLAN_COLORS[item.plan] ?? PLAN_COLORS.Free;

    return (
      <View style={s.card}>
        {/* Left: circular gradient avatar */}
        <LinearGradient
          colors={grad}
          style={s.avatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={s.avatarText}>{mkInitials(item.full_name)}</Text>
        </LinearGradient>

        {/* Center: info */}
        <View style={s.cardBody}>
          <Text style={s.name} numberOfLines={1}>{item.full_name || 'Unnamed Client'}</Text>
          <Text style={s.email} numberOfLines={1}>{item.email}</Text>
          <View style={s.metaRow}>
            {/* Plan chip */}
            <View style={[s.planChip, { backgroundColor: pc.bg, borderColor: pc.border }]}>
              <Text style={[s.planChipText, { color: pc.text }]}>{item.plan ?? 'Free'}</Text>
            </View>
            {!item.is_active && (
              <View style={s.inactiveChip}>
                <View style={s.inactiveDot} />
                <Text style={s.inactiveText}>Inactive</Text>
              </View>
            )}
          </View>
        </View>

        {/* Right: icon action buttons */}
        <View style={s.rowActions}>
          <TouchableOpacity
            style={s.docBtn}
            onPress={() => onSelectClient(item)}
            activeOpacity={0.75}
          >
            <Ionicons name="documents-outline" size={16} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => setManaging(item)}
            activeOpacity={0.75}
          >
            <Ionicons name="settings-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Clients</Text>
          <Text style={s.sub}>
            {clients.length} account{clients.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => setAddOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={s.addBtnText}>＋ Add Client</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Stats row ── */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statNum}>{clients.length}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: Colors.primary }]}>{activeCount}</Text>
          <Text style={s.statLabel}>Active</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: Colors.error }]}>{inactiveCount}</Text>
          <Text style={s.statLabel}>Inactive</Text>
        </View>
      </View>

      {/* ── Search ── */}
      <View style={s.searchCard}>
        <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name or email…"
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {!!query && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Section label ── */}
      {!loading && filtered.length > 0 && (
        <Text style={s.sectionLabel}>
          {query
            ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
            : 'All Clients'}
        </Text>
      )}

      {/* ── List ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="people-outline" size={34} color={Colors.textMuted} />
              </View>
              <Text style={s.emptyTitle}>{query ? 'No results found' : 'No clients yet'}</Text>
              <Text style={s.emptySub}>
                {query
                  ? 'Try a different search term.'
                  : 'Add your first client using the button above.'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Manage modal ── */}
      {managing && (
        <ManageModal
          client={managing}
          onClose={() => setManaging(null)}
          onSave={updated => {
            setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
            setManaging(null);
            showToast('Client updated');
          }}
          onViewDocs={c => { setManaging(null); onSelectClient(c); }}
        />
      )}

      {/* ── Add Client modal ── */}
      <AddClientModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          setAddOpen(false);
          showToast('Invite link generated — share it with your client');
          load(true);
        }}
      />

      {/* ── Global toast ── */}
      <Toast message={toastMsg} visible={toastVisible} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: '#2C2320',
  },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  sub:   { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  addBtn: {
    backgroundColor: '#E8B923',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 5,
  },
  addBtnText: { color: '#3A3131', fontSize: 14, fontWeight: '700' },

  /* ── Stats row ── */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statNum:   { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  /* ── Search ── */
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },

  /* ── Section label ── */
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 4,
  },

  /* ── List ── */
  listContent: { padding: 16, gap: 10, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* ── Client card ── */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    gap: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,   // fully circular
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 18, fontWeight: '800' },
  cardBody:   { flex: 1, gap: 2 },
  name:  { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  email: { color: Colors.textMuted,  fontSize: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },

  /* Plan chip */
  planChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  planChipText: { fontSize: 10, fontWeight: '700' },

  /* Inactive chip */
  inactiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.error + '14',
    borderColor: Colors.error + '44',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  inactiveDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.error },
  inactiveText: { color: Colors.error, fontSize: 10, fontWeight: '700' },

  /* Row action buttons */
  rowActions: { flexDirection: 'row', gap: 8 },
  docBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Empty state */
  emptyWrap: { alignItems: 'center', marginTop: 70, gap: 14 },
  emptyIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: Colors.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  emptySub:   { color: Colors.textMuted,  fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 20 },
});
