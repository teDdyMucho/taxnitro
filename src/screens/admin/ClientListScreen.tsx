import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
  Modal, Pressable, ScrollView, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useSheetStyles } from '../../hooks/useSheetStyles';
import {
  getAllClients, Profile, ClientService, AccountStatus, STATUS_LOOK, statusOf,
} from '../../db/profiles';
import {
  getFulfilledRequirements,
  itemsForClient, reqKey, monthOf, formatMonthLabel, serviceLabel,
  BankAccount, normalizeBankAccounts,
} from '../../db/requirements';
import { ClientManageModal } from '../../components/ClientManageModal';
import { joinName } from '../../lib/personName';
import { useResponsive } from '../../hooks/useResponsive';
import {
  PROGRESS_COLOR, PROGRESS_LABEL, effectiveProgress, type WorkProgress,
} from '../../lib/serviceProgress';

/**
 * How far along a label is, for sorting. Not Started first — what needs
 * picking up is what someone sorting by progress is looking for — then In
 * Progress, then done (Completed for TAX and YER, Current for BK and CFO).
 */
const PROGRESS_RANK: Record<WorkProgress, number> = {
  not_started: 0, in_progress: 1, completed: 2, current: 2,
};
import {
  BankAccountsField, cleanBankAccounts, hasIncompleteBankAccount,
} from '../../components/BankAccountsField';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLANS = ['Free', 'Basic', 'Pro', 'Enterprise'] as const;

// The client-type services and their display labels, in the spec's order.
const ALL_SERVICES: ClientService[] = ['TAX', 'YER', 'BK', 'CFO'];
const SERVICE_LABEL: Record<ClientService, string> = {
  BK:  'Bookkeeping',
  TAX: 'TAX',
  YER: 'YER',
  CFO: 'CFO',
};

// Filter-button colours, matching the blocks down the side of the design.
// YER is the dark brown block, so its text has to be light.
const SERVICE_FILTER_COLORS: Record<ClientService, { bg: string; text: string }> = {
  TAX: { bg: '#D8CCB4', text: '#1C1713' },
  YER: { bg: '#4A3E3E', text: '#FFFFFF' },
  BK:  { bg: '#A8A29A', text: '#1C1713' },
  CFO: { bg: '#C9A75C', text: '#1C1713' },
};

const PLAN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Free:       { bg: '#F3F4F6', text: '#6B7280',  border: '#E5E7EB' },
  Basic:      { bg: '#EFF6FF', text: '#2563EB',  border: '#BFDBFE' },
  Pro:        { bg: '#FEF3C7', text: '#B5905B',  border: '#FDE68A' },
  Enterprise: { bg: '#F5F3FF', text: '#7C3AED',  border: '#DDD6FE' },
};

const AVATAR_GRADIENTS: [string, string][] = [
  ['#E8B923', '#B5905B'],
  ['#B5905B', '#8B6914'],
  ['#3A3131', '#4A3E3E'],
  ['#2C2320', '#3A3131'],
  ['#B5905B', '#E8B923'],
  ['#8B6914', '#B5905B'],
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
  const sheet = useSheetStyles('md');
  // First and last name — Camaree, app notes 6a. full_name is written as the
  // two joined, so every screen that shows it carries on unchanged.
  // Phone: the two name boxes stack rather than share one cramped line.
  const { isPhone: namesStack } = useResponsive();
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const fullName = joinName(firstName, lastName);
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [plan, setPlan]             = useState<string>('Free');
  const [services, setServices]     = useState<ClientService[]>(['BK']);   // BK / CFO / both
  const [hasQbo, setHasQbo]         = useState(false);                      // already have QBO access?
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);      // one required slot each
  const [step, setStep]             = useState<'form' | 'success' | 'error'>('form');
  const [loading, setLoading]       = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');

  const toggleService = (svc: ClientService) => {
    setServices(prev =>
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    );
  };

  const reset = () => {
    setFirstName(''); setLastName(''); setCompanyName(''); setEmail(''); setPassword(''); setPlan('Free');
    setServices(['BK']); setHasQbo(false); setBankAccounts([]);
    setStep('form'); setErrorMsg(''); setShowPass(false);
  };

  // A half-filled bank row would be silently dropped on save — block instead.
  const bankIncomplete = hasIncompleteBankAccount(bankAccounts);
  // Per the spec, a BK, CFO or YER client is a business, so their company
  // name is part of what is required to create the contact. TAX-only clients
  // are people and need none.
  const needsCompany = services.some(s => s === 'BK' || s === 'CFO' || s === 'YER');
  const canSubmit =
    !!fullName.trim() && !!email.trim() && password.length >= 8 &&
    services.length > 0 && !bankIncomplete && !loading &&
    (!needsCompany || !!companyName.trim());

  const handleClose = () => { reset(); onClose(); };
  const handleDone  = () => { reset(); onDone(); };

  const handleSubmit = async () => {
    if (!canSubmit) return;
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
            // Sent only when filled in, as company_name is below, so creating a
            // client still works on a database that has not yet run
            // profiles_first_last_name.sql.
            ...(firstName.trim() ? { first_name: firstName.trim() } : {}),
            ...(lastName.trim() ? { last_name: lastName.trim() } : {}),
            // Only sent when filled in, so creating a TAX-only client still
            // works on a database that has not run the company migration.
            ...(companyName.trim() ? { company_name: companyName.trim() } : {}),
            client_id: generateClientId(),
            plan,
            role: 'client',
            is_active: true,
            services,                    // BK / CFO / both — drives what they see
            has_qbo_access: hasQbo,      // hides "Prior Month Bookkeeping / QBO Access" when true
            bank_accounts: cleanBankAccounts(bankAccounts),  // one Bank Statements slot each
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
      <Pressable style={[ac.overlay, sheet.overlay]} onPress={handleClose}>
        <Pressable style={[ac.sheet, sheet.sheet]} onPress={() => {}}>
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

              {/* Fields scroll; the title and action buttons stay pinned. */}
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
              {/* First and last name, side by side — the list sorts by the last */}
              <View style={{ flexDirection: namesStack ? 'column' : 'row', gap: namesStack ? 16 : 10 }}>
                <View style={[ac.fieldGroup, { flex: 1 }]}>
                  <Text style={ac.label}>First Name</Text>
                  <View style={ac.inputRow}>
                    <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                    <TextInput style={[ac.input, { outlineWidth: 0 } as any]} placeholder="e.g. Jane" placeholderTextColor={Colors.textMuted} value={firstName} onChangeText={setFirstName} />
                  </View>
                </View>
                <View style={[ac.fieldGroup, { flex: 1 }]}>
                  <Text style={ac.label}>Last Name</Text>
                  <View style={ac.inputRow}>
                    <TextInput style={[ac.input, { outlineWidth: 0 } as any]} placeholder="e.g. Smith" placeholderTextColor={Colors.textMuted} value={lastName} onChangeText={setLastName} />
                  </View>
                </View>
              </View>

              {/* Company — required for business clients (BK, CFO, YER);
                  a TAX-only client is a person, so it stays optional. */}
              <View style={ac.fieldGroup}>
                <Text style={ac.label}>Company Name{needsCompany ? '' : ' (optional)'}</Text>
                <View style={ac.inputRow}>
                  <Ionicons name="business-outline" size={16} color={Colors.textMuted} />
                  <TextInput style={[ac.input, { outlineWidth: 0 } as any]} placeholder="e.g. Sparkle Bar LLC" placeholderTextColor={Colors.textMuted} value={companyName} onChangeText={setCompanyName} />
                </View>
              </View>

              {/* Email */}
              <View style={ac.fieldGroup}>
                <Text style={ac.label}>Email Address</Text>
                <View style={ac.inputRow}>
                  <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                  <TextInput style={[ac.input, { outlineWidth: 0 } as any]} placeholder="client@example.com" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
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
                  <TextInput style={[ac.input, { outlineWidth: 0 } as any]} placeholder="Min. 8 characters" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry={!showPass} autoCapitalize="none" />
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

              {/* Services (BK / TAX / CFO — any combination) */}
              <View style={ac.fieldGroup}>
                <Text style={ac.label}>Client Type</Text>
                <Text style={ac.helpText}>Which services does this client have? Select one or more.</Text>
                <View style={ac.planRow}>
                  {ALL_SERVICES.map(svc => {
                    const active = services.includes(svc);
                    return (
                      <TouchableOpacity
                        key={svc}
                        style={[ac.svcBtn, active && ac.svcBtnActive]}
                        onPress={() => toggleService(svc)}
                        activeOpacity={0.75}
                      >
                        <Ionicons
                          name={active ? 'checkbox' : 'square-outline'}
                          size={16}
                          color={active ? '#E8B923' : Colors.textMuted}
                        />
                        <Text style={[ac.svcBtnText, active && { color: '#3A3131', fontWeight: '700' }]}>
                          {SERVICE_LABEL[svc]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Bank accounts — one required "Bank Statements" slot per account */}
              <BankAccountsField value={bankAccounts} onChange={setBankAccounts} />

              {/* QBO access (only relevant when CFO is selected) */}
              {services.includes('CFO') && (
                <View style={ac.fieldGroup}>
                  <Text style={ac.label}>Do we already have QBO access?</Text>
                  <Text style={ac.helpText}>If yes, "Prior Month Bookkeeping / QBO Access" won't be requested.</Text>
                  <View style={ac.planRow}>
                    <TouchableOpacity
                      style={[ac.svcBtn, hasQbo && ac.svcBtnActive]}
                      onPress={() => setHasQbo(true)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={hasQbo ? 'radio-button-on' : 'radio-button-off'} size={16} color={hasQbo ? '#E8B923' : Colors.textMuted} />
                      <Text style={[ac.svcBtnText, hasQbo && { color: '#3A3131', fontWeight: '700' }]}>Yes, we have it</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[ac.svcBtn, !hasQbo && ac.svcBtnActive]}
                      onPress={() => setHasQbo(false)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={!hasQbo ? 'radio-button-on' : 'radio-button-off'} size={16} color={!hasQbo ? '#E8B923' : Colors.textMuted} />
                      <Text style={[ac.svcBtnText, !hasQbo && { color: '#3A3131', fontWeight: '700' }]}>No, request it</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              </ScrollView>

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
                  style={[ac.primaryBtn, { flex: 2 }, !canSubmit && ac.primaryBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
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
    // The form scrolls inside — cap the sheet so a long list of bank accounts
    // can't push the action buttons off-screen on a phone.
    maxHeight: '92%',
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
  helpText: { color: Colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: -2, marginBottom: 2 },
  svcBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.bgMid,
    borderWidth: 1, borderColor: Colors.border,
  },
  svcBtnActive: { backgroundColor: 'rgba(232,185,35,0.12)', borderColor: 'rgba(232,185,35,0.5)' },
  svcBtnText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
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

// The manage tray moved to components/ClientManageModal so a client's own
// folders screen can open it too, without leaving that screen.

// ── Progress Detail Modal ─────────────────────────────────────────────────────
// Phone-friendly bottom sheet: overall progress bar + per-item checklist for the
// month, plus a shortcut to the client's full uploaded-documents list.

function ProgressDetailModal({ client, onClose, onViewDocs }: {
  client: Profile;
  onClose: () => void;
  onViewDocs: (client: Profile) => void;
}) {
  const [fulfilled, setFulfilled] = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const month = monthOf();

  useEffect(() => {
    let alive = true;
    getFulfilledRequirements(client.email, month).then(reqs => {
      if (!alive) return;
      setFulfilled(new Set(reqs.map(r => reqKey(r.service, r.requirement_key))));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [client.email]);

  // Only the items that apply to THIS client (services + QBO access + one row
  // per configured bank account).
  const clientItems = itemsForClient(client.services, client.has_qbo_access, normalizeBankAccounts(client.bank_accounts));
  const total = clientItems.length;
  const done  = clientItems.filter(i => fulfilled.has(reqKey(i.service, i.key))).length;
  const pct   = total > 0 ? (done / total) * 100 : 0;
  const color = pct >= 100 ? '#16A34A' : pct >= 50 ? '#E8B923' : '#B5905B';
  const grad  = avatarGradient(client.full_name);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pd.overlay} onPress={onClose}>
        <Pressable style={pd.sheet} onPress={() => {}}>

          {/* Header: who, and the month it covers */}
          <View style={pd.top}>
            <LinearGradient colors={grad} style={pd.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={pd.avatarText}>{mkInitials(client.full_name)}</Text>
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={pd.name} numberOfLines={1}>{client.full_name || 'Client'}</Text>
              <Text style={pd.email} numberOfLines={1}>{client.email}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={pd.x} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* The figure, boxed like the cards on the dashboard: a tinted head
              strip naming the period, the number large underneath. */}
          <View style={pd.scoreCard}>
            <View style={pd.scoreHead}>
              <Text style={pd.scoreHeadText}>
                REQUIRED DOCUMENTS · {formatMonthLabel(month).toUpperCase()}
              </Text>
            </View>
            <View style={pd.scoreBody}>
              <View style={pd.scoreFigure}>
                <Text style={pd.scoreValue}>{done}</Text>
                <View>
                  <Text style={[pd.scoreOf, { color }]}>/{total}</Text>
                  <Text style={pd.scoreOfLabel}>ACCEPTED</Text>
                </View>
              </View>
              <Text style={[pd.scorePct, { color }]}>{Math.round(pct)}%</Text>
            </View>
            <View style={pd.track}>
              <View style={[pd.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
            </View>
          </View>

          {/* Checklist — one tile per item, so what is missing reads at a
              glance rather than as a list of identical rows. */}
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 28 }} />
          ) : (
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {(['BK', 'CFO'] as const).map(svc => {
                const svcItems = clientItems.filter(i => i.service === svc);
                if (svcItems.length === 0) return null;
                return (
                  <View key={svc} style={pd.group}>
                    <Text style={pd.groupLabel}>{serviceLabel(svc)}</Text>
                    <View style={pd.tileWrap}>
                      {svcItems.map(item => {
                        const ok = fulfilled.has(reqKey(item.service, item.key));
                        return (
                          <View key={item.key} style={[pd.tile, ok && pd.tileOk]}>
                            <Ionicons
                              name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                              size={17}
                              color={ok ? '#16A34A' : Colors.textMuted}
                            />
                            <Text
                              style={[pd.tileText, ok && { color: Colors.textPrimary, fontWeight: '700' }]}
                              numberOfLines={2}
                            >
                              {item.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={pd.docsBtn} onPress={() => onViewDocs(client)} activeOpacity={0.85}>
            <Ionicons name="folder-open-outline" size={16} color="#3A3131" />
            <Text style={pd.docsBtnText}>View uploaded documents</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Same palette as the rest of the admin screens — the brand golds and browns,
// the black card edge — in a centred card rather than a bottom sheet.
const pd = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28,23,19,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: Colors.bgCard,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#1C1713',
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    elevation: 14,
  },

  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontSize: 16, fontWeight: '800' },
  name:  { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  email: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  x: { padding: 4 },

  // The figure, boxed the way the dashboard cards are.
  scoreCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  scoreHead: {
    backgroundColor: '#F5F0E8',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  scoreHeadText: {
    color: '#A8998A',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  scoreBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  scoreFigure: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  scoreValue: {
    color: '#1C1713',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.5,
    lineHeight: 40,
  },
  scoreOf: { fontSize: 18, fontWeight: '700', lineHeight: 20 },
  scoreOfLabel: { color: '#A8998A', fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },
  scorePct: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },

  track: { height: 6, backgroundColor: Colors.bgMid },
  fill:  { height: '100%' },

  group: { marginTop: 10 },
  groupLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  // Two per row, so a missing item is a gap you can see rather than a line
  // among identical lines.
  tileWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  tileOk: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  tileText: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 15 },

  docsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E8B923',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 4,
  },
  docsBtnText: { color: '#3A3131', fontSize: 14, fontWeight: '800' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

/** Which part of a client is being opened. */
export type ClientSection = 'documents' | 'cfo';

interface Props {
  onSelectClient: (client: Profile, section?: ClientSection) => void;
}

export function ClientListScreen({ onSelectClient }: Props) {
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [clients, setClients]       = useState<Profile[]>([]);
  const [query, setQuery]           = useState('');
  // Which service the list is narrowed to, or null for all of them.
  const [svcFilter, setSvcFilter]   = useState<ClientService | null>(null);
  // Camaree, app notes 3c: "Allow for sorting by progress label."
  const [sortBy, setSortBy]         = useState<'name' | 'progress'>('name');
  // The counts above the list double as a filter on where the subscription
  // stands.
  type StatKey = 'all' | AccountStatus;
  const [statFilter, setStatFilter] = useState<StatKey>('all');
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [managing, setManaging]     = useState<Profile | null>(null);
  const [progressClient, setProgressClient] = useState<Profile | null>(null);
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
    if (isRefresh) setRefreshing(true);
    // No setLoading(true) — show existing content immediately
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }, 8000);
    try {
      // Just the clients. The per-requirement counts used to be fetched
      // alongside, feeding a progress bar the cards no longer draw — a
      // request per load whose answer nothing read.
      const data = await getAllClients();
      if (mountedRef.current) setClients(data);
    }
    catch (e) { console.error(e); }
    finally { clearTimeout(safetyTimer); if (mountedRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => { if (!authLoading) load(); }, [authLoading]);

  const matchesStat = (c: Profile, key: StatKey) =>
    key === 'all' || statusOf(c) === key;

  // Search and the service filter narrow the same list, in that order.
  // A client with no services recorded is treated as BK, which is what the
  // rest of the app assumes too.
  // What a card sorts under: the company where there is one, the person
  // otherwise — the spec has BK, CFO and YER clients filed by business.
  // Camaree, app notes 6a: "sorting should go by Last Name (if entered)". The
  // last name where there is one; otherwise what it sorted by before — the
  // company, then the person's full name.
  const sortName = (c: Profile) =>
    (c.last_name?.trim() || c.company_name?.trim() || c.full_name || '').toLowerCase();

  /** The furthest-behind label among the services in view, as a rank. */
  const progressRank = (c: Profile) => {
    const inView = svcFilter
      ? [svcFilter]
      : ((c.services?.length ? c.services : ['BK']) as ClientService[]);
    return Math.min(...inView.map(svc => PROGRESS_RANK[effectiveProgress(c.service_progress, svc)]));
  };

  const filtered = clients
    .filter(c =>
      !query.trim() ||
      c.full_name?.toLowerCase().includes(query.toLowerCase()) ||
      c.company_name?.toLowerCase().includes(query.toLowerCase()) ||
      c.email?.toLowerCase().includes(query.toLowerCase())
    )
    .filter(c => !svcFilter || (c.services?.length ? c.services : ['BK']).includes(svcFilter))
    .filter(c => matchesStat(c, statFilter))
    // Alphabetical, as the spec asks. getAllClients orders by personal name,
    // which is the wrong key for a business client.
    //
    // By progress, a label belongs to a service, so it is read against one:
    // the service being filtered on, or with no filter the client's least
    // advanced service — the one still needing work. Name breaks the ties.
    .sort((a, b) =>
      (sortBy === 'progress' ? progressRank(a) - progressRank(b) : 0)
      || sortName(a).localeCompare(sortName(b)));

  const activeCount = clients.filter(c => statusOf(c) === 'active').length;
  const pausedCount = clients.filter(c => statusOf(c) === 'paused').length;
  const closedCount = clients.filter(c => statusOf(c) === 'closed').length;

  const renderItem = ({ item }: { item: Profile }) => {
    const grad = avatarGradient(item.company_name?.trim() || item.full_name);
    // The spec's naming: a TAX client is a person; BK, CFO and YER clients
    // are businesses, with the person shown as well for TAX and YER clients
    // and for anyone whose company is simply not recorded yet.
    const company   = item.company_name?.trim() || '';
    const services  = (item.services?.length ? item.services : ['BK']) as ClientService[];
    const showPerson = !company || services.includes('TAX') || services.includes('YER');

    return (
      // The card goes straight to their folders — that is what staff open a
      // client for. The month's progress is behind the icon beside it.
      <TouchableOpacity style={s.card} onPress={() => onSelectClient(item)} activeOpacity={0.85}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={s.avatar} />
        ) : (
          <LinearGradient colors={grad} style={s.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={s.avatarText}>{mkInitials(company || item.full_name)}</Text>
          </LinearGradient>
        )}

        <View style={s.cardBody}>
          {!!company && <Text style={s.name} numberOfLines={1}>{company}</Text>}
          {showPerson && (
            <Text style={company ? s.personUnderCompany : s.name} numberOfLines={1}>
              {item.full_name || 'Unnamed Client'}
            </Text>
          )}

          <View style={s.metaRow}>
            {(item.services?.length ? item.services : ['BK'] as ClientService[]).map(svc => {
              // Each service carries its work label beside it, with a dot in
              // the label's colour, so a list sorted by progress shows why.
              const st = effectiveProgress(item.service_progress, svc);
              return (
                <View key={svc} style={[s.svcTag, s.svcTagRow, { backgroundColor: SERVICE_FILTER_COLORS[svc].bg }]}>
                  <View style={[s.progDot, { backgroundColor: PROGRESS_COLOR[st] }]} />
                  {/* The colour pair travels together — dark text on YER's dark
                      brown block would vanish. */}
                  <Text style={[s.svcTagText, { color: SERVICE_FILTER_COLORS[svc].text }]}>
                    {svc} · {PROGRESS_LABEL[st]}
                  </Text>
                </View>
              );
            })}
            {(() => {
              const st = statusOf(item);
              const look = STATUS_LOOK[st];
              return (
                <View style={[s.statusChip, { backgroundColor: look.bg }]}>
                  <Text style={[s.statusChipText, { color: look.text }]}>{look.label}</Text>
                </View>
              );
            })()}
          </View>
        </View>

        {/* This month's required uploads, and the manage tray. The card
            itself opens their folders. */}
        <View style={s.rowActions}>
          <TouchableOpacity
            style={s.docBtn}
            onPress={() => setProgressClient(item)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.75}
          >
            <Ionicons name="checkbox-outline" size={15} color="#E8B923" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => setManaging(item)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.75}
          >
            <Ionicons name="settings-outline" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerOverlay} pointerEvents="none" />
        <View style={s.decorCircle1} pointerEvents="none" />
        <View style={s.decorCircle2} pointerEvents="none" />
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

      {/* ── Stats row, which is also the status filter ── */}
      <View style={s.statsRow}>
        {([
          { key: 'all'    as const, label: 'Total',  value: clients.length, color: Colors.textPrimary },
          { key: 'active' as const, label: 'Active', value: activeCount,    color: Colors.viewed },
          { key: 'paused' as const, label: 'Paused', value: pausedCount,    color: Colors.primary },
          { key: 'closed' as const, label: 'Closed', value: closedCount,    color: Colors.error },
        ]).map(stat => {
          const on = statFilter === stat.key;
          return (
            <TouchableOpacity
              key={stat.key}
              // Pressing the one already showing goes back to all of them,
              // so there is always a way out of a filter.
              onPress={() => setStatFilter(on && stat.key !== 'all' ? 'all' : stat.key)}
              style={[s.statCard, on && s.statCardOn]}
              activeOpacity={0.85}
            >
              <Text style={[s.statNum, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[s.statLabel, on && s.statLabelOn]}>{stat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>


      {/* ── Search ── */}
      <View style={s.searchCard}>
        <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
        <TextInput
          style={[s.searchInput, { outlineWidth: 0 } as any]}
          placeholder="Search by client name, business name or email…"
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
        <View style={s.sectionRow}>
          <Text style={s.sectionLabel}>
            {query || svcFilter || statFilter !== 'all'
              ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
              : 'All Clients'}
          </Text>
          {/* Sort — by name, or by where the work stands */}
          <View style={s.sortToggle}>
            {(['name', 'progress'] as const).map(k => (
              <TouchableOpacity
                key={k}
                onPress={() => setSortBy(k)}
                style={[s.sortBtn, sortBy === k && s.sortBtnOn]}
                activeOpacity={0.8}
              >
                <Text style={[s.sortBtnText, sortBy === k && s.sortBtnTextOn]}>
                  {k === 'name' ? 'Name' : 'Progress'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Service filter down the side, clients beside it ── */}
      <View style={s.body}>
        <View style={s.svcRail}>
          {ALL_SERVICES.map(svc => {
            const on = svcFilter === svc;
            const c  = SERVICE_FILTER_COLORS[svc];
            return (
              <TouchableOpacity
                key={svc}
                // Tapping the service already showing clears it, so there is
                // always a way back to the full list.
                onPress={() => setSvcFilter(on ? null : svc)}
                style={[s.svcBtn, { backgroundColor: c.bg }, on && s.svcBtnOn]}
                activeOpacity={0.85}
              >
                <Text style={[s.svcBtnText, { color: c.text }]}>{svc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

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
          numColumns={4}
          columnWrapperStyle={s.gridRow}
          style={{ flex: 1 }}
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
      </View>

      {/* ── Manage modal ── */}
      {managing && (
        <ClientManageModal
          client={managing}
          onClose={() => setManaging(null)}
          onSave={updated => {
            setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
            setManaging(null);
            showToast('Client updated');
          }}
          onOpenCfo={() => { const c = managing; setManaging(null); if (c) onSelectClient(c, 'cfo'); }}
        />
      )}

      {/* ── Progress detail modal ── */}
      {progressClient && (
        <ProgressDetailModal
          client={progressClient}
          onClose={() => setProgressClient(null)}
          onViewDocs={c => { setProgressClient(null); onSelectClient(c); }}
        />
      )}

      {/* ── Add Client modal ── */}
      <AddClientModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          setAddOpen(false);
          // The flow creates the account outright with a password — no invite
          // link is involved, and the old toast said one had been made.
          showToast('Client account created');
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
  headerOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.04 },
  decorCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,185,35,0.06)', top: -60, right: -40 } as any,
  decorCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(232,185,35,0.05)', bottom: -30, left: 60 } as any,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    overflow: 'hidden',
    position: 'relative',
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
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 9,
  },
  statNum:   { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
  // Account status on a card.
  statusChip: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  // The chosen count is outlined, so it is clear it is filtering the list.
  statCardOn: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  statLabelOn: { color: Colors.textPrimary },
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
    // Centred and capped, rather than stretched the full width.
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
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
  listContent: { padding: 16, gap: 12, paddingTop: 8 },
  // Service rail on the left, client grid filling the rest.
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  svcRail: {
    width: 170,
    gap: 10,
    paddingLeft: 16,
    paddingTop: 8,
  },
  svcBtn: {
    height: 68,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 9,
  },
  // The chosen one is outlined, so the block still reads as its own service
  // rather than being recoloured.
  svcBtnOn: {
    borderColor: '#1C1713',
  },
  svcBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Spread the row so the last card reaches the right edge, with the leftover
  // width falling between the cards rather than piling up on one side.
  gridRow: { gap: 12, justifyContent: 'space-between' },

  /* Service tag on a client card */
  svcTag: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  svcTagRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  progDot: { width: 6, height: 6, borderRadius: 3 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortToggle: { flexDirection: 'row', gap: 4, marginRight: 16 },
  sortBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  sortBtnOn: { backgroundColor: 'rgba(232,185,35,0.15)', borderColor: 'rgba(232,185,35,0.6)' },
  sortBtnText: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  sortBtnTextOn: { color: Colors.textPrimary },
  svcTagText: {
    color: '#1C1713',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  activeChip: {
    backgroundColor: '#DCFCE7',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  activeText: {
    color: '#15803D',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* ── Client card ── */
  card: {
    flex: 1,
    minWidth: 0,
    // Keeps a card from stretching wide on a large screen; the row spreads
    // the leftover space between them instead.
    maxWidth: 330,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    // Taller than a row — a card, as the design draws it.
    minHeight: 92,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 9,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,   // fully circular
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  cardBody:   { flex: 1, minWidth: 0, gap: 2 },
  name:  { color: Colors.textPrimary, fontSize: 12, fontWeight: '700', lineHeight: 15 },
  // The person, shown small under the business they belong to.
  personUnderCompany: { color: Colors.textSecondary, fontSize: 10.5, fontWeight: '600', lineHeight: 13 },
  email: { color: Colors.textMuted,  fontSize: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 4 },

  /* Required-docs mini progress */
  reqRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  reqTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Colors.bgMid, overflow: 'hidden' },
  reqFill:  { height: '100%', borderRadius: 3 },
  reqLabel: { fontSize: 11, fontWeight: '800', minWidth: 30, textAlign: 'right' },
  viewDocsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    alignSelf: 'flex-start', backgroundColor: 'rgba(232,185,35,0.10)',
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.3)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  viewDocsText: { color: '#B5905B', fontSize: 12, fontWeight: '700' },

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
  // Stacked, not side by side — two buttons in a row would crowd the card at
  // four columns wide.
  rowActions: { gap: 6, flexShrink: 0 },
  docBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(232,185,35,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
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
