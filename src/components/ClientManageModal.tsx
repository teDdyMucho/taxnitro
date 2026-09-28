import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Modal, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/colors';
import { useSheetStyles } from '../hooks/useSheetStyles';
import {
  updateClientProfile,
  Profile, ClientService, AccountStatus, statusOf, STATUS_LOOK,
} from '../db/profiles';
import { normalizeBankAccounts, BankAccount } from '../db/requirements';
import { dashboardForClient } from '../lib/clientDashboards';
import {
  BankAccountsField, cleanBankAccounts, hasIncompleteBankAccount,
} from './BankAccountsField';

// The tray for editing one client: their name, plan, services, bank accounts,
// account status and password.
//
// It lives here rather than on the clients list because two screens open it —
// the list, and the gear on a client's own folders screen. Kept on the list it
// would have meant leaving the client's screen just to change a setting.

const PLANS = ['Free', 'Basic', 'Pro', 'Enterprise'] as const;

const ALL_SERVICES: ClientService[] = ['BK', 'TAX', 'CFO'];
const SERVICE_LABEL: Record<ClientService, string> = {
  BK:  'Bookkeeping',
  TAX: 'TAX',
  CFO: 'CFO',
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

const PLAN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Free:       { bg: '#F3F4F6', text: '#6B7280',  border: '#E5E7EB' },
  Basic:      { bg: '#EFF6FF', text: '#2563EB',  border: '#BFDBFE' },
  Pro:        { bg: '#FEF3C7', text: '#B5905B',  border: '#FDE68A' },
  Enterprise: { bg: '#F5F3FF', text: '#7C3AED',  border: '#DDD6FE' },
};

// Inlined at bundle time by Metro — must be top-level, not inside a function.
const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? '';

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

export function ClientManageModal({
  client,
  onClose,
  onSave,
  onOpenCfo,
}: {
  client: Profile;
  onClose: () => void;
  onSave: (updated: Profile) => void;
  /**
   * Opens the client's CFO dashboard. Left out by the client's own screen,
   * which already carries a Dashboard button in its header — the card here
   * would be the same thing one tap further away.
   */
  onOpenCfo?: () => void;
}) {
  const sheet = useSheetStyles('md');
  const [name, setName]           = useState(client.full_name ?? '');
  const [plan, setPlan]           = useState(client.plan ?? 'Free');
  const [status, setStatus] = useState<AccountStatus>(statusOf(client));
  const [services, setServices]   = useState<ClientService[]>(
    Array.isArray(client.services) && client.services.length > 0 ? client.services : ['BK']
  );
  const [hasQbo, setHasQbo]       = useState(client.has_qbo_access ?? false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(
    normalizeBankAccounts(client.bank_accounts)
  );
  const [saving, setSaving]       = useState(false);

  const toggleService = (svc: ClientService) => {
    setServices(prev => prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]);
  };
  const [newPassword, setNewPassword]   = useState('');
  const [showNewPass, setShowNewPass]   = useState(false);
  const [pwdSaving, setPwdSaving]       = useState(false);
  const [toastMsg, setToastMsg]         = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  };

  const handleSave = async () => {
    if (services.length === 0) { showToast('Select at least one service (BK or TAX)'); return; }
    // Half-filled bank rows would be silently dropped — say so instead of saving.
    if (hasIncompleteBankAccount(bankAccounts)) {
      showToast('Finish every bank account: bank name + 4 digits');
      return;
    }
    const banks = cleanBankAccounts(bankAccounts);
    setSaving(true);
    // is_active is sent alongside the status so the two agree even where the
    // database trigger that syncs them has not been applied yet.
    const isActive = status === 'active';
    const ok = await updateClientProfile(client.id, {
      full_name: name, plan, is_active: isActive, account_status: status,
      services, has_qbo_access: hasQbo,
      bank_accounts: banks,
    });
    setSaving(false);
    if (ok) {
      showToast('Client updated successfully');
      onSave({ ...client, full_name: name, plan, is_active: isActive, account_status: status, services, has_qbo_access: hasQbo, bank_accounts: banks });
    } else {
      showToast('Failed to update client');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) return;
    setPwdSaving(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${client.id}`, {
        method: 'PUT',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) { showToast('Password changed successfully'); setNewPassword(''); }
      else showToast('Failed to change password');
    } catch { showToast('Failed to change password'); }
    finally { setPwdSaving(false); }
  };

  const grad = avatarGradient(client.full_name);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[mm.overlay, sheet.overlay]} onPress={onClose}>
        <Pressable style={[mm.sheet, sheet.sheet]} onPress={() => {}}>
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
              {(() => {
                const look = STATUS_LOOK[status];
                return (
                  <View style={[mm.statusBadge, { backgroundColor: look.bg }]}>
                    <View style={[mm.statusDot, { backgroundColor: look.text }]} />
                    <Text style={[mm.statusText, { color: look.text }]}>
                      {look.label.charAt(0) + look.label.slice(1).toLowerCase()}
                    </Text>
                  </View>
                );
              })()}
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18 }}>
            {/* Full Name */}
            <View style={mm.field}>
              <Text style={mm.label}>Full Name</Text>
              <View style={mm.inputWrap}>
                <Ionicons name="person-outline" size={15} color={Colors.textMuted} />
                <TextInput
                  style={[mm.input, { outlineWidth: 0 } as any]}
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

            {/* Client Type (services) */}
            <View style={mm.field}>
              <Text style={mm.label}>Client Type</Text>
              <View style={mm.planRow}>
                {ALL_SERVICES.map(svc => {
                  const isOn = services.includes(svc);
                  return (
                    <TouchableOpacity
                      key={svc}
                      style={[mm.svcBtn, isOn && mm.svcBtnActive]}
                      onPress={() => toggleService(svc)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={isOn ? 'checkbox' : 'square-outline'} size={16} color={isOn ? '#E8B923' : Colors.textMuted} />
                      <Text style={[mm.svcText, isOn && { color: Colors.textPrimary, fontWeight: '700' }]}>
                        {SERVICE_LABEL[svc]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Bank accounts — one required "Bank Statements" slot per account */}
            <BankAccountsField value={bankAccounts} onChange={setBankAccounts} />

            {/* QBO access — only relevant when CFO is on */}
            {services.includes('CFO') && (
              <View style={mm.field}>
                <Text style={mm.label}>QBO Access</Text>
                <View style={mm.toggleRow}>
                  <TouchableOpacity style={[mm.toggleBtn, hasQbo && mm.toggleBtnActive]} onPress={() => setHasQbo(true)} activeOpacity={0.75}>
                    <Ionicons name={hasQbo ? 'radio-button-on' : 'radio-button-off'} size={16} color={hasQbo ? '#22C55E' : Colors.textMuted} />
                    <Text style={[mm.toggleText, hasQbo && { color: '#22C55E' }]}>We have it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[mm.toggleBtn, !hasQbo && mm.toggleBtnActive]} onPress={() => setHasQbo(false)} activeOpacity={0.75}>
                    <Ionicons name={!hasQbo ? 'radio-button-on' : 'radio-button-off'} size={16} color={!hasQbo ? '#22C55E' : Colors.textMuted} />
                    <Text style={[mm.toggleText, !hasQbo && { color: '#22C55E' }]}>Request it</Text>
                  </TouchableOpacity>
                </View>
                <Text style={mm.qboHint}>When "We have it" is set, the "Prior Month Bookkeeping / QBO Access" item is not requested.</Text>
              </View>
            )}

            {/* Status */}
            <View style={mm.field}>
              <Text style={mm.label}>Account Status</Text>
              {/* Three states, because a pause and a cancellation are not the
                  same thing: paused clients come back, closed ones do not. */}
              <View style={mm.toggleRow}>
                {([
                  { key: 'active' as const, label: 'Active', icon: 'checkmark-circle-outline' as const, tint: '#22C55E' },
                  { key: 'paused' as const, label: 'Paused', icon: 'pause-circle-outline'    as const, tint: Colors.primary },
                  { key: 'closed' as const, label: 'Closed', icon: 'ban-outline'             as const, tint: Colors.error },
                ]).map(opt => {
                  const on = status === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[mm.toggleBtn, on && { borderColor: opt.tint, backgroundColor: opt.tint + '18' }]}
                      onPress={() => setStatus(opt.key)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={opt.icon} size={16} color={on ? opt.tint : Colors.textMuted} />
                      <Text style={[mm.toggleText, on && { color: opt.tint }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Change Password */}
            <View style={mm.field}>
              <Text style={mm.label}>Change Password</Text>
              <View style={mm.inputWrap}>
                <Ionicons name="lock-closed-outline" size={15} color={Colors.textMuted} />
                <TextInput
                  style={[mm.input, { outlineWidth: 0 } as any]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password (min. 8 chars)..."
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showNewPass}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowNewPass(p => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={showNewPass ? 'eye-off-outline' : 'eye-outline'} size={15} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[mm.pwdBtn, (newPassword.length < 8 || pwdSaving) && { opacity: 0.5 }]}
                onPress={handleChangePassword}
                disabled={newPassword.length < 8 || pwdSaving}
                activeOpacity={0.8}
              >
                {pwdSaving
                  ? <ActivityIndicator color="#3A3131" size="small" />
                  : <><Ionicons name="shield-checkmark-outline" size={15} color="#3A3131" />
                    <Text style={mm.pwdBtnText}>Update Password</Text></>
                }
              </TouchableOpacity>
            </View>

            {/* Quick Actions — only the CFO suite is left here, so the whole
                section goes when there is nothing to show. Documents and
                Business Details both led to the same screen the card itself
                opens, so they were doing nothing this tray needed. */}
            {!!onOpenCfo && ((client.services ?? []).includes('CFO') || !!dashboardForClient(client)) && (
            <View style={mm.field}>
              <Text style={mm.label}>Quick Actions</Text>
              <View style={mm.actionGrid}>
                <TouchableOpacity
                  style={[mm.actionCard, !dashboardForClient(client) && { opacity: 0.55 }]}
                  onPress={() => dashboardForClient(client) && onOpenCfo?.()}
                  disabled={!dashboardForClient(client)}
                  activeOpacity={0.75}
                >
                  <View style={[mm.actionIcon, { backgroundColor: 'rgba(232,185,35,0.12)' }]}>
                    <Ionicons name="stats-chart-outline" size={20} color="#E8B923" />
                  </View>
                  <Text style={mm.actionLabel}>CFO Suite</Text>
                  {!dashboardForClient(client) && (
                    <Text style={mm.actionNote}>Not built yet</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            )}

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
              {/* "Current Plan" used to sit here — the value from before your
                  edits, directly under the picker that changes it. */}
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
  svcBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.bgMid,
    borderWidth: 1, borderColor: Colors.border,
  },
  svcBtnActive: { backgroundColor: 'rgba(232,185,35,0.12)', borderColor: 'rgba(232,185,35,0.5)' },
  svcText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  qboHint: { color: Colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },
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
  actionNote: { color: '#A8998A', fontSize: 10, marginTop: 2, textAlign: 'center' },
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
  pwdBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#E8B923', borderRadius: 12, paddingVertical: 12, marginTop: 8,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  pwdBtnText: { color: '#3A3131', fontWeight: '700', fontSize: 14 },
});
