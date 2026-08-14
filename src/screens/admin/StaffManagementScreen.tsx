import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useSheetStyles } from '../../hooks/useSheetStyles';
import {
  getAllStaff, updateStaffRole, setStaffActive,
  countStaffReferences, deleteStaffMember, StaffReferences,
  Profile, UserRole,
} from '../../db/profiles';
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
  const sheet = useSheetStyles('md');
  const [email, setEmail]           = useState('');
  const [role, setRole]             = useState<'admin' | 'staff'>('staff');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<'success' | 'notfound' | null>(null);
  const [assignedEmail, setAssignedEmail] = useState('');
  const [suggestions, setSuggestions]     = useState<{ email: string; full_name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const reset = () => {
    setEmail(''); setRole('staff'); setResult(null);
    setAssignedEmail(''); setSuggestions([]); setShowSuggestions(false);
  };

  const handleEmailChange = async (val: string) => {
    setEmail(val);
    setResult(null);
    if (val.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const { data } = await supabase
      .from('profiles')
      .select('email, full_name')
      .ilike('email', `%${val.trim()}%`)
      .limit(5);
    const results = (data ?? []) as { email: string; full_name: string }[];
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  };

  const selectSuggestion = (item: { email: string; full_name: string }) => {
    setEmail(item.email);
    setSuggestions([]);
    setShowSuggestions(false);
    setResult(null);
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
      <Pressable style={[im.overlay, sheet.overlay]} onPress={handleClose}>
        <Pressable style={[im.sheet, sheet.sheet]} onPress={() => {}}>

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
                    style={[im.input, { outlineWidth: 0 } as any]}
                    placeholder="Type to search users..."
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={handleEmailChange}
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
                {/* Autocomplete suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                  <View style={im.suggestionBox}>
                    {suggestions.map((item, i) => (
                      <TouchableOpacity
                        key={item.email}
                        style={[im.suggestionItem, i < suggestions.length - 1 && im.suggestionDivider]}
                        onPress={() => selectSuggestion(item)}
                        activeOpacity={0.7}
                      >
                        <View style={im.suggestionAvatar}>
                          <Text style={im.suggestionAvatarText}>
                            {(item.full_name ?? item.email)[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={im.suggestionName}>{item.full_name || 'Unknown'}</Text>
                          <Text style={im.suggestionEmail}>{item.email}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color="#A8998A" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {result === 'notfound' && (
                  <View style={im.errorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                    <Text style={im.errorText}>No account found with that email.</Text>
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
                          isActive && { backgroundColor: rrc.pillBg, borderColor: rrc.pillBorder },
                        ]}
                        onPress={() => setRole(r)}
                        activeOpacity={0.75}
                      >
                        <View style={im.roleCardInner}>
                          {isActive && (
                            <View style={[im.roleCheck, { backgroundColor: rrc.pillBorder }]}>
                              <Ionicons name="checkmark" size={11} color={rrc.pillText} />
                            </View>
                          )}
                          <LinearGradient
                            colors={isActive ? rrc.gradient : ['#E8E0D0', '#D5CCC0']}
                            style={im.roleIconBg}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                          >
                            <Ionicons
                              name={r === 'admin' ? 'shield-checkmark' : 'person'}
                              size={20}
                              color="#FFFFFF"
                            />
                          </LinearGradient>
                          <Text style={[im.roleCardTitle, isActive && { color: rrc.pillText }]}>
                            {rrc.label}
                          </Text>
                          <Text style={im.roleCardDesc}>
                            {r === 'admin' ? 'Full access' : 'Standard access'}
                          </Text>
                        </View>
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
    flex: 1, backgroundColor: 'rgba(28,23,19,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 12,
    shadowColor: '#3A3131', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 16,
    gap: 18,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E8E0D0',
    alignSelf: 'center', marginBottom: 4,
  },
  divider: { height: 1, backgroundColor: '#F2EDE3' },

  /* Success */
  successContainer: { alignItems: 'center', gap: 14, paddingVertical: 8 },
  successIcon: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
  },
  successTitle: { color: '#1C1713', fontSize: 22, fontWeight: '800' },
  successSub: { color: '#A8998A', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  /* Modal header */
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalIconBg: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(232,185,35,0.12)',
    borderWidth: 1, borderColor: 'rgba(232,185,35,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { color: '#1C1713', fontSize: 17, fontWeight: '800' },
  modalSub:   { color: '#A8998A', fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#F5F0E8',
    alignItems: 'center', justifyContent: 'center',
  },

  /* Field */
  fieldGroup: { gap: 8 },
  fieldLabel: {
    color: '#A8998A', fontSize: 10, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase',
  },

  /* Input */
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FAFAF8', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E8E0D0',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  inputRowError: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  input: { flex: 1, color: '#1C1713', fontSize: 14, fontWeight: '500' },

  /* Error */
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10,
    borderWidth: 1, borderColor: '#FECACA',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  errorText: { flex: 1, color: '#DC2626', fontSize: 12, lineHeight: 17 },

  /* Role cards */
  roleRow: { flexDirection: 'row', gap: 10 },
  roleCard: {
    flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: '#E8E0D0',
    backgroundColor: '#FAFAF8', overflow: 'hidden',
  },
  roleCardInner: {
    padding: 14, gap: 6, alignItems: 'center',
  },
  roleIconBg: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  roleCardTitle: { color: '#1C1713', fontSize: 14, fontWeight: '700' },
  roleCardDesc:  { color: '#A8998A', fontSize: 11, textAlign: 'center' },
  roleCheck: {
    width: 20, height: 20, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    position: 'absolute', top: 10, right: 10,
  },

  /* Actions */
  actionRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, backgroundColor: '#F5F0E8', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#E8E0D0',
  },
  cancelText: { color: '#6B5E52', fontWeight: '700', fontSize: 14 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#3A3131', fontWeight: '800', fontSize: 15 },

  // Autocomplete
  suggestionBox: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E8E0D0',
    shadowColor: '#3A3131', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  suggestionDivider: { borderBottomWidth: 1, borderBottomColor: '#F2EDE3' },
  suggestionAvatar: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(232,185,35,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  suggestionAvatarText: { color: '#E8B923', fontSize: 14, fontWeight: '800' },
  suggestionName:  { color: '#1C1713', fontSize: 13, fontWeight: '600' },
  suggestionEmail: { color: '#A8998A', fontSize: 11, marginTop: 1 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function StaffManagementScreen() {
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [staff, setStaff]           = useState<Profile[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen]       = useState(false);
  const [toastMsg, setToastMsg]     = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Promoting to admin is one press away and, since the admin pill is locked,
  // cannot be undone from this screen — so it asks first.
  const [roleTarget, setRoleTarget]   = useState<Profile | null>(null);
  const [rolePending, setRolePending] = useState(false);

  // Delete confirmation. `refs` is null while the reference count is loading.
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [refs, setRefs]                 = useState<StaffReferences | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2600);
  };

  const { isLoading: authLoading, user } = useAuth();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    // No setLoading(true) — show existing content immediately
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }, 8000);
    try {
      const data = await getAllStaff();
      if (mountedRef.current) setStaff(data);
    }
    catch (e) { console.error('StaffManagement load:', e); }
    finally { clearTimeout(safetyTimer); if (mountedRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => { if (!authLoading) load(); }, [authLoading]);

  const confirmRole = async () => {
    if (!roleTarget) return;
    const newRole: UserRole = roleTarget.role === 'admin' ? 'staff' : 'admin';
    setRolePending(true);
    const ok = await updateStaffRole(roleTarget.id, newRole);
    setRolePending(false);
    if (ok) {
      setStaff(prev => prev.map(s => s.id === roleTarget.id ? { ...s, role: newRole } : s));
      showToast(`${roleTarget.full_name || 'Member'} is now ${newRole}`);
    } else {
      showToast('Could not change the role');
    }
    setRoleTarget(null);
  };

  const toggleActive = async (member: Profile) => {
    const next = !member.is_active;
    const ok = await setStaffActive(member.id, next);
    if (ok) {
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: next } : s));
      showToast(next ? 'Account activated' : 'Account deactivated');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const askDelete = async (member: Profile) => {
    setDeleteTarget(member);
    setRefs(null);
    setDeleteError(null);
    // Workflow tables reference profiles with NO on-delete rule, so a linked
    // member simply cannot be removed — find out before offering the button.
    setRefs(await countStaffReferences(member.id));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteStaffMember(deleteTarget.id);
    setDeleting(false);
    if (res.ok) {
      setStaff(prev => prev.filter(m => m.id !== deleteTarget.id));
      showToast(`${deleteTarget.full_name || 'Member'} deleted`);
      setDeleteTarget(null);
    } else {
      setDeleteError(res.error ?? 'Could not delete this member.');
    }
  };

  const adminCount  = staff.filter(s => s.role === 'admin').length;
  const staffCount  = staff.filter(s => s.role === 'staff').length;
  const activeCount = staff.filter(s => s.is_active).length;

  // Admins first, then staff (each already name-sorted from the query).
  const sortedStaff = [...staff].sort((a, b) => {
    if (a.role === b.role) return 0;
    return a.role === 'admin' ? -1 : 1;
  });

  const renderItem = ({ item }: { item: Profile }) => {
    const safeRole = (item.role === 'admin' ? 'admin' : 'staff') as 'admin' | 'staff';
    const rc = ROLE_CONFIG[safeRole];
    const isSelf = item.id === user?.id;
    // An admin can be moved back to staff — except yourself (you would lose
    // this screen mid-session) and the last admin (nobody could promote again).
    const canDemote = safeRole === 'admin' && !isSelf && adminCount > 1;
    return (
      <View style={s.card}>
        {/* Left accent bar for admin */}
        {safeRole === 'admin' && <View style={s.cardAccent} />}

        {/* Avatar */}
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={[s.avatar, { borderRadius: s.avatar.borderRadius }]} />
        ) : (
          <LinearGradient colors={rc.gradient} style={s.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={s.avatarText}>{mkInitials(item.full_name)}</Text>
          </LinearGradient>
        )}

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
          {/* Role pill — tap to change, both directions. It stays locked only
              where a change would strand the system or the person pressing. */}
          {safeRole === 'admin' && !canDemote ? (
            <View style={[s.rolePill, { backgroundColor: rc.pillBg, borderColor: rc.pillBorder }]}>
              <Ionicons name="shield-checkmark" size={11} color={rc.pillText} />
              <Text style={[s.rolePillText, { color: rc.pillText }]}>{rc.label}</Text>
              <Ionicons name="lock-closed" size={9} color={rc.pillText} style={{ marginLeft: 1 }} />
            </View>
          ) : safeRole === 'admin' ? (
            <TouchableOpacity
              style={[s.rolePill, { backgroundColor: rc.pillBg, borderColor: rc.pillBorder }]}
              onPress={() => setRoleTarget(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="shield-checkmark" size={11} color={rc.pillText} />
              <Text style={[s.rolePillText, { color: rc.pillText }]}>{rc.label}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.rolePill, { backgroundColor: rc.pillBg, borderColor: rc.pillBorder }]}
              onPress={() => setRoleTarget(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="person" size={11} color={rc.pillText} />
              <Text style={[s.rolePillText, { color: rc.pillText }]}>{rc.label}</Text>
            </TouchableOpacity>
          )}

          {/* Active / Inactive toggle — admins can't be deactivated here */}
          {safeRole === 'admin' ? (
            <View style={[s.activeBtn, s.activeBtnOn]}>
              <Ionicons name="checkmark-circle" size={19} color="#E8B923" />
            </View>
          ) : (
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
          )}

          {/* Delete — admins and your own account are not removable here, for
              the same reason their role and active state are locked. */}
          {safeRole !== 'admin' && item.id !== user?.id && (
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={() => askDelete(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={17} color="#DC2626" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>

      {/* Header */}
      <LinearGradient colors={['#3A3131', '#4A3E3E', '#3A3131']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerOverlay} pointerEvents="none" />
        <View style={s.decorCircle1} pointerEvents="none" />
        <View style={s.decorCircle2} pointerEvents="none" />
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
          data={sortedStaff}
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

      {/* Promote to admin confirmation */}
      <Modal visible={!!roleTarget} transparent animationType="fade" onRequestClose={() => !rolePending && setRoleTarget(null)}>
        <Pressable style={dc.overlay} onPress={() => !rolePending && setRoleTarget(null)}>
          <Pressable style={dc.box} onPress={() => {}}>
            {(() => {
              const demoting = roleTarget?.role === 'admin';
              return (
                <>
                  <View style={dc.roleIcon}>
                    <Ionicons
                      name={demoting ? 'person-outline' : 'shield-checkmark-outline'}
                      size={26}
                      color="#B5905B"
                    />
                  </View>
                  <Text style={dc.title}>
                    {demoting ? 'Move this admin back to staff?' : 'Make this member an admin?'}
                  </Text>
                  <Text style={dc.sub} numberOfLines={2}>
                    {roleTarget?.full_name || 'Member'} · {roleTarget?.email}
                  </Text>

                  <View style={dc.warnBox}>
                    <Ionicons name="alert-circle-outline" size={15} color="#B45309" />
                    <Text style={dc.warnText}>
                      {demoting
                        ? 'They lose the Staff page and admin-only actions. Their staff access and history stay intact, and you can promote them again later.'
                        : 'Admins can manage every client, add and remove staff, and see all documents.'}
                    </Text>
                  </View>

                  <View style={dc.row}>
                    <TouchableOpacity
                      style={dc.cancelBtn}
                      onPress={() => setRoleTarget(null)}
                      disabled={rolePending}
                      activeOpacity={0.75}
                    >
                      <Text style={dc.cancelText}>No, keep it</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[dc.altBtn, rolePending && { opacity: 0.6 }]}
                      onPress={confirmRole}
                      disabled={rolePending}
                      activeOpacity={0.85}
                    >
                      {rolePending
                        ? <ActivityIndicator size="small" color="#1C1713" />
                        : <><Ionicons name={demoting ? 'person' : 'shield-checkmark'} size={15} color="#1C1713" />
                            <Text style={dc.altText}>
                              {demoting ? 'Yes, make staff' : 'Yes, make admin'}
                            </Text></>}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete confirmation */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteTarget(null)}>
        <Pressable style={dc.overlay} onPress={() => !deleting && setDeleteTarget(null)}>
          <Pressable style={dc.box} onPress={() => {}}>
            <View style={dc.icon}>
              <Ionicons name="trash-outline" size={26} color="#DC2626" />
            </View>
            <Text style={dc.title}>Delete this member?</Text>
            <Text style={dc.sub} numberOfLines={2}>
              {deleteTarget?.full_name || 'Staff member'} · {deleteTarget?.email}
            </Text>

            {refs === null ? (
              <View style={{ paddingVertical: 18 }}>
                <ActivityIndicator color="#B5905B" />
              </View>
            ) : refs.total > 0 ? (
              /* Blocked — the database will refuse, so don't offer the button. */
              <>
                <View style={dc.blockBox}>
                  <Ionicons name="lock-closed-outline" size={15} color="#B45309" />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={dc.blockTitle}>This member can't be deleted</Text>
                    <Text style={dc.blockText}>
                      They are still attached to{' '}
                      {refs.workflows > 0 && `${refs.workflows} workflow${refs.workflows !== 1 ? 's' : ''}`}
                      {refs.workflows > 0 && refs.activity > 0 ? ' and ' : ''}
                      {refs.activity > 0 && `${refs.activity} record${refs.activity !== 1 ? 's' : ''}`}
                      . Deleting them would break that history.
                    </Text>
                  </View>
                </View>
                <View style={dc.row}>
                  <TouchableOpacity style={dc.cancelBtn} onPress={() => setDeleteTarget(null)} activeOpacity={0.75}>
                    <Text style={dc.cancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={dc.altBtn}
                    onPress={() => {
                      if (deleteTarget) toggleActive(deleteTarget);
                      setDeleteTarget(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="ban-outline" size={15} color="#1C1713" />
                    <Text style={dc.altText}>Deactivate instead</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={dc.warnBox}>
                  <Ionicons name="alert-circle-outline" size={15} color="#B45309" />
                  <Text style={dc.warnText}>
                    Their sign-in and profile are removed for good. This cannot be undone.
                  </Text>
                </View>
                {!!deleteError && (
                  <View style={dc.errBox}>
                    <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
                    <Text style={dc.errText}>{deleteError}</Text>
                  </View>
                )}
                <View style={dc.row}>
                  <TouchableOpacity
                    style={dc.cancelBtn}
                    onPress={() => setDeleteTarget(null)}
                    disabled={deleting}
                    activeOpacity={0.75}
                  >
                    <Text style={dc.cancelText}>No, keep it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[dc.confirmBtn, deleting && { opacity: 0.6 }]}
                    onPress={confirmDelete}
                    disabled={deleting}
                    activeOpacity={0.85}
                  >
                    {deleting
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <><Ionicons name="trash-outline" size={15} color="#FFFFFF" />
                          <Text style={dc.confirmText}>Yes, delete</Text></>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  /* ── Header ── */
  headerOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.04 },
  decorCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,185,35,0.06)', top: -60, right: -40 } as any,
  decorCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(232,185,35,0.05)', bottom: -30, left: 60 } as any,
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 20,
    overflow: 'hidden', position: 'relative',
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
  deleteBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.22)',
  },
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

// ── Delete-confirmation styles ───────────────────────────────────────────────

const dc = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(28,23,19,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  box: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24,
    width: '100%', maxWidth: 380, alignItems: 'center', gap: 9,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2, shadowRadius: 28, elevation: 16,
  },
  icon: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  // Granting a privilege, not destroying something — gold rather than red.
  roleIcon: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(232,185,35,0.14)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  title: { color: '#1C1713', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sub:   { color: '#6B5E52', fontSize: 12.5, textAlign: 'center', lineHeight: 18 },

  warnBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 10,
    borderWidth: 1, borderColor: '#FDE68A',
    paddingHorizontal: 11, paddingVertical: 10, marginTop: 4, width: '100%',
  },
  warnText: { flex: 1, color: '#B45309', fontSize: 11.5, lineHeight: 16 },

  blockBox: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 10,
    borderWidth: 1, borderColor: '#FDE68A',
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 4, width: '100%',
  },
  blockTitle: { color: '#92400E', fontSize: 12.5, fontWeight: '800' },
  blockText:  { color: '#B45309', fontSize: 11.5, lineHeight: 16 },

  errBox: {
    flexDirection: 'row', gap: 7, alignItems: 'center',
    backgroundColor: '#FEF2F2', borderRadius: 9,
    borderWidth: 1, borderColor: '#FECACA',
    paddingHorizontal: 11, paddingVertical: 9, width: '100%',
  },
  errText: { flex: 1, color: '#DC2626', fontSize: 11.5, lineHeight: 16 },

  row: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 },
  cancelBtn: {
    flex: 1, backgroundColor: '#F5F0E8', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: '#E8E0D0',
  },
  cancelText: { color: '#6B5E52', fontWeight: '700', fontSize: 14 },
  confirmBtn: {
    flex: 1, backgroundColor: '#DC2626', borderRadius: 12,
    paddingVertical: 13, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  confirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  altBtn: {
    flex: 1.4, backgroundColor: '#E8B923', borderRadius: 12,
    paddingVertical: 13, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  altText: { color: '#1C1713', fontWeight: '800', fontSize: 13.5 },
});
