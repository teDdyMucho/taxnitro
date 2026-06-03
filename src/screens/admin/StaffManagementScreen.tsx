import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { getAllStaff, updateStaffRole, setStaffActive, Profile, UserRole } from '../../db/profiles';
import { supabase } from '../../lib/supabase';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkInitials(n: string) {
  return (n ?? '?').split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);
}

const ROLE_CONFIG = {
  admin: {
    gradient:   ['#E8B923', '#B5905B'] as [string, string],
    pillBg:     '#FEF9E7',
    pillBorder: '#E8B923',
    pillText:   '#2C2320',
    label:      'Admin',
  },
  staff: {
    gradient:   ['#B5905B', '#8B6914'] as [string, string],
    pillBg:     '#F5F0E8',
    pillBorder: '#B5905B',
    pillText:   '#6B4A1A',
    label:      'Staff',
  },
};

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={ts.wrap}>
      <View style={ts.iconWrap}>
        <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
      </View>
      <Text style={ts.text}>{message}</Text>
    </View>
  );
}

const ts = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: 32, left: 20, right: 20, zIndex: 9999,
    backgroundColor: '#3A3131',
    borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 20, elevation: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  iconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#E8B923',
    alignItems: 'center', justifyContent: 'center',
  },
  text: { color: '#F9FAFB', fontSize: 14, fontWeight: '600', flex: 1 },
});

// ── Add Staff Modal ───────────────────────────────────────────────────────────

function AddStaffModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail]     = useState('');
  const [role, setRole]       = useState<'admin' | 'staff'>('staff');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<'success' | 'notfound' | null>(null);
  const [assignedEmail, setAssignedEmail] = useState('');

  const reset = () => {
    setEmail('');
    setRole('staff');
    setResult(null);
    setAssignedEmail('');
  };

  const handleClose = () => { reset(); onClose(); };
  const handleDone  = () => { reset(); onSuccess(); };

  const handleAssign = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('email', email.trim())
        .select('id');

      if (error || !data || data.length === 0) {
        setResult('notfound');
      } else {
        setAssignedEmail(email.trim());
        setResult('success');
      }
    } catch (e) {
      console.error('AddStaffModal:', e);
      setResult('notfound');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={im.overlay} onPress={handleClose}>
        <Pressable style={im.sheet} onPress={() => {}}>

          {/* Handle bar */}
          <View style={im.handle} />

          {result === 'success' ? (
            /* ── Success state ── */
            <View style={im.successContainer}>
              <LinearGradient
                colors={ROLE_CONFIG[role].gradient}
                style={im.successIcon}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Ionicons name="shield-checkmark" size={30} color="#FFFFFF" />
              </LinearGradient>
              <Text style={im.successTitle}>Role Assigned!</Text>
              <Text style={im.successSub}>
                <Text style={{ fontWeight: '800', color: '#111827' }}>{assignedEmail}</Text>
                {' '}is now a{' '}
                <Text style={{ fontWeight: '800', color: ROLE_CONFIG[role].pillText }}>
                  {ROLE_CONFIG[role].label}
                </Text>.
              </Text>
              <TouchableOpacity style={im.primaryBtn} onPress={handleDone} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle" size={17} color="#FFFFFF" />
                <Text style={im.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Form state ── */
            <>
              {/* Modal header */}
              <View style={im.modalHeader}>
                <View style={im.modalIconBg}>
                  <Ionicons name="person-add-outline" size={20} color="#B5905B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={im.modalTitle}>Add Staff Member</Text>
                  <Text style={im.modalSub}>Grant staff access to an existing user</Text>
                </View>
                <TouchableOpacity style={im.closeBtn} onPress={handleClose} activeOpacity={0.7}>
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={im.divider} />

              {/* Email field */}
              <View style={im.fieldGroup}>
                <Text style={im.fieldLabel}>EMAIL ADDRESS</Text>
                <View style={[
                  im.inputRow,
                  result === 'notfound' && im.inputRowError,
                ]}>
                  <Ionicons name="mail-outline" size={16} color="#94A3B8" />
                  <TextInput
                    style={im.input}
                    placeholder="staff@example.com"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={v => { setEmail(v); setResult(null); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {email.length > 0 && (
                    <TouchableOpacity onPress={() => { setEmail(''); setResult(null); }}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
                {result === 'notfound' && (
                  <View style={im.errorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
                    <Text style={im.errorText}>
                      No account found with that email. The user must sign up first.
                    </Text>
                  </View>
                )}
              </View>

              {/* Role selector */}
              <View style={im.fieldGroup}>
                <Text style={im.fieldLabel}>ASSIGN ROLE</Text>
                <View style={im.roleRow}>
                  {(['staff', 'admin'] as ('admin' | 'staff')[]).map(r => {
                    const rrc = ROLE_CONFIG[r];
                    const isActive = role === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[
                          im.roleCard,
                          isActive && {
                            backgroundColor: rrc.pillBg,
                            borderColor: rrc.pillBorder,
                          },
                        ]}
                        onPress={() => setRole(r)}
                        activeOpacity={0.75}
                      >
                        <LinearGradient
                          colors={isActive ? rrc.gradient : ['#E5E7EB', '#D1D5DB']}
                          style={im.roleIconBg}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                          <Ionicons
                            name={r === 'admin' ? 'shield-checkmark-outline' : 'person-outline'}
                            size={15}
                            color="#FFFFFF"
                          />
                        </LinearGradient>
                        <View style={{ flex: 1 }}>
                          <Text style={[
                            im.roleCardTitle,
                            isActive && { color: rrc.pillText, fontWeight: '800' },
                          ]}>
                            {rrc.label}
                          </Text>
                          <Text style={im.roleCardDesc}>
                            {r === 'admin' ? 'Full access' : 'Standard access'}
                          </Text>
                        </View>
                        {isActive && (
                          <View style={[im.roleCheck, { backgroundColor: rrc.pillBorder }]}>
                            <Ionicons name="checkmark" size={11} color={rrc.pillText} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Action buttons */}
              <View style={im.actionRow}>
                <TouchableOpacity style={im.cancelBtn} onPress={handleClose} activeOpacity={0.75}>
                  <Text style={im.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[im.primaryBtn, { flex: 2 }, !email.trim() && im.primaryBtnDisabled]}
                  onPress={handleAssign}
                  disabled={loading || !email.trim()}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <>
                        <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
                        <Text style={im.primaryBtnText}>Assign Role</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const im = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(58,49,49,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#2C2320',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 16,
    gap: 18,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginBottom: 4,
  },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  /* Success */
  successContainer: { alignItems: 'center', gap: 14, paddingVertical: 8 },
  successIcon: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
  },
  successTitle: { color: '#111827', fontSize: 22, fontWeight: '800' },
  successSub: { color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  /* Modal header */
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalIconBg: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { color: '#111827', fontSize: 17, fontWeight: '800' },
  modalSub:   { color: '#94A3B8', fontSize: 12, marginTop: 1 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },

  /* Field */
  fieldGroup: { gap: 9 },
  fieldLabel: {
    color: '#94A3B8', fontSize: 10, fontWeight: '800',
    letterSpacing: 1.4, textTransform: 'uppercase',
  },

  /* Input */
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  inputRowError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  input: { flex: 1, color: '#111827', fontSize: 14, fontWeight: '500' },

  /* Error */
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10,
    borderWidth: 1, borderColor: '#FECACA',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  errorText: { flex: 1, color: '#EF4444', fontSize: 12, lineHeight: 17 },

  /* Role cards */
  roleRow: { flexDirection: 'row', gap: 10 },
  roleCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  roleIconBg: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  roleCardTitle: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  roleCardDesc:  { color: '#94A3B8', fontSize: 10, marginTop: 1 },
  roleCheck: {
    width: 20, height: 20, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },

  /* Actions */
  actionRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  cancelText: { color: '#64748B', fontWeight: '700', fontSize: 14 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#3A3131', fontWeight: '800', fontSize: 15 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function StaffManagementScreen() {
  const insets = useSafeAreaInsets();
  const [staff, setStaff]           = useState<Profile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    try { setStaff(await getAllStaff()); }
    catch (e) { console.error('StaffManagement load:', e); }
    finally { clearTimeout(safetyTimer); setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (!authLoading) load(); }, [authLoading]);

  const toggleRole = async (member: Profile) => {
    const newRole: UserRole = member.role === 'admin' ? 'staff' : 'admin';
    const ok = await updateStaffRole(member.id, newRole);
    if (ok) {
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, role: newRole } : s));
      showToast(`${member.full_name || 'Member'} is now ${newRole}`);
    }
  };

  const toggleActive = async (member: Profile) => {
    const next = !member.is_active;
    const ok = await setStaffActive(member.id, next);
    if (ok) {
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: next } : s));
      showToast(next ? 'Account activated' : 'Account deactivated');
    }
  };

  const adminCount  = staff.filter(s => s.role === 'admin').length;
  const staffCount  = staff.filter(s => s.role === 'staff').length;
  const activeCount = staff.filter(s => s.is_active).length;

  const renderItem = ({ item }: { item: Profile }) => {
    const safeRole = (item.role === 'admin' ? 'admin' : 'staff') as 'admin' | 'staff';
    const rc = ROLE_CONFIG[safeRole];
    return (
      <View style={s.card}>
        {/* Left accent bar for admin */}
        {safeRole === 'admin' && <View style={s.cardAccent} />}

        {/* Avatar */}
        <LinearGradient
          colors={rc.gradient}
          style={s.avatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={s.avatarText}>{mkInitials(item.full_name)}</Text>
        </LinearGradient>

        {/* Info */}
        <View style={s.cardBody}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>{item.full_name || 'Staff Member'}</Text>
          </View>
          <Text style={s.email} numberOfLines={1}>{item.email}</Text>
          {!item.is_active && (
            <View style={s.inactiveTag}>
              <View style={s.inactiveDot} />
              <Text style={s.inactiveTagText}>Deactivated</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={s.actions}>
          {/* Role toggle pill */}
          <TouchableOpacity
            style={[s.rolePill, { backgroundColor: rc.pillBg, borderColor: rc.pillBorder }]}
            onPress={() => toggleRole(item)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={item.role === 'admin' ? 'shield-checkmark' : 'person'}
              size={11}
              color={rc.pillText}
            />
            <Text style={[s.rolePillText, { color: rc.pillText }]}>{rc.label}</Text>
          </TouchableOpacity>

          {/* Active / Inactive toggle */}
          <TouchableOpacity
            style={[s.activeBtn, item.is_active ? s.activeBtnOn : s.activeBtnOff]}
            onPress={() => toggleActive(item)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={item.is_active ? 'checkmark-circle' : 'ban-outline'}
              size={19}
              color={item.is_active ? '#E8B923' : '#A8998A'}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>

      {/* Header */}
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Staff</Text>
          <Text style={s.sub}>{staff.length} member{staff.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => setAddOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="#3A3131" />
          <Text style={s.addBtnText}>Add Staff</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Stats row */}
      <View style={s.statsRow}>
        {/* Admins */}
        <View style={s.statCard}>
          <LinearGradient
            colors={['#E8B923', '#B5905B']}
            style={s.statIconBg}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Ionicons name="shield-checkmark" size={14} color="#3A3131" />
          </LinearGradient>
          <Text style={[s.statNum, { color: '#E8B923' }]}>{adminCount}</Text>
          <Text style={s.statLabel}>Admins</Text>
        </View>

        {/* Staff */}
        <View style={s.statCard}>
          <LinearGradient
            colors={['#E8B923', '#B5905B']}
            style={s.statIconBg}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Ionicons name="people" size={14} color="#3A3131" />
          </LinearGradient>
          <Text style={[s.statNum, { color: '#B5905B' }]}>{staffCount}</Text>
          <Text style={s.statLabel}>Staff</Text>
        </View>

        {/* Active */}
        <View style={s.statCard}>
          <LinearGradient
            colors={['#2C2320', '#3A3131']}
            style={s.statIconBg}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Ionicons name="checkmark-circle" size={14} color="#E8B923" />
          </LinearGradient>
          <Text style={[s.statNum, { color: '#2C2320' }]}>{activeCount}</Text>
          <Text style={s.statLabel}>Active</Text>
        </View>
      </View>

      {/* Section label */}
      {!loading && staff.length > 0 && (
        <Text style={s.sectionLabel}>Team Members</Text>
      )}

      {/* List */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#E8B923" size="large" />
        </View>
      ) : (
        <FlatList
          data={staff}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#E8B923"
            />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <LinearGradient
                colors={['#F1F5F9', '#E5E7EB']}
                style={s.emptyIconBg}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Ionicons name="shield-outline" size={34} color="#94A3B8" />
              </LinearGradient>
              <Text style={s.emptyTitle}>No staff members yet</Text>
              <Text style={s.emptySub}>
                Assign staff roles to existing users using the button above.
              </Text>
              <TouchableOpacity
                style={s.emptyAction}
                onPress={() => setAddOpen(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={16} color="#3A3131" />
                <Text style={s.emptyActionText}>Add First Member</Text>
              </TouchableOpacity>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add Staff modal */}
      <AddStaffModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setAddOpen(false);
          showToast('Staff role assigned successfully');
          load(true);
        }}
      />

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  /* ── Header ── */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 20,
    backgroundColor: '#2C2320',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  sub:   { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E8B923', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 11,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 5,
  },
  addBtnText: { color: '#3A3131', fontSize: 14, fontWeight: '800' },

  /* ── Stats ── */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
    gap: 10,
  },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', gap: 7,
    borderWidth: 1, borderColor: '#E8E0D0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statIconBg: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  statNum: { fontSize: 22, fontWeight: '900' },
  statLabel: {
    color: '#94A3B8', fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  /* ── Section label ── */
  sectionLabel: {
    color: '#94A3B8', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.3, textTransform: 'uppercase',
    paddingHorizontal: 20, marginTop: 18, marginBottom: 6,
  },

  /* ── List ── */
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* ── Staff card ── */
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14, gap: 12,
    marginBottom: 10,
    borderWidth: 1, borderColor: '#E8E0D0',
    shadowColor: '#3A3131', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: '#E8B923',
    borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  cardBody: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:  { color: '#1C1713', fontSize: 15, fontWeight: '700' },
  email: { color: '#A8998A', fontSize: 12, fontWeight: '500' },
  inactiveTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 5, alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2', borderRadius: 20,
    borderWidth: 1, borderColor: '#FECACA',
    paddingHorizontal: 8, paddingVertical: 3,
  },
  inactiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },
  inactiveTagText: { color: '#EF4444', fontSize: 11, fontWeight: '700' },

  /* ── Actions ── */
  actions: { flexDirection: 'column', alignItems: 'flex-end', gap: 8 },
  rolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  rolePillText: { fontSize: 11, fontWeight: '800' },
  activeBtn: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  activeBtnOn:  { backgroundColor: '#D1FAE5' },
  activeBtnOff: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E5E7EB' },

  /* ── Empty state ── */
  emptyWrap: { alignItems: 'center', marginTop: 64, gap: 14, paddingHorizontal: 24 },
  emptyIconBg: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  emptySub: {
    color: '#94A3B8', fontSize: 14, textAlign: 'center',
    lineHeight: 20, maxWidth: 240,
  },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#E8B923', borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 4,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  emptyActionText: { color: '#3A3131', fontSize: 14, fontWeight: '800' },
});
