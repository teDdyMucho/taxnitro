import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Colors } from '../../constants/colors';
import { Button } from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const BIOMETRIC_KEY = 'biometric_enabled';
const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'biometric_password';

// ── helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function memberSince(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── SettingRow ────────────────────────────────────────────────────────────────

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (val: boolean) => void;
  onPress?: () => void;
  color?: string;
  danger?: boolean;
  last?: boolean;
}

function SettingRow({
  icon, label, value, toggle, toggleValue, onToggle, onPress, color, danger, last,
}: SettingRowProps) {
  const iconColor = danger ? Colors.error : color ?? Colors.primary;
  return (
    <>
      <TouchableOpacity
        style={styles.settingRow}
        onPress={onPress}
        disabled={toggle || !onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.settingIconWrap, { backgroundColor: `${iconColor}18` }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={[styles.settingLabel, danger && { color: Colors.error }]}>{label}</Text>
        <View style={styles.settingRight}>
          {value ? <Text style={styles.settingValue}>{value}</Text> : null}
          {toggle ? (
            <Switch
              value={toggleValue}
              onValueChange={onToggle}
              trackColor={{ false: Colors.bgMid, true: '#E8B923' }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.bgMid}
            />
          ) : (
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          )}
        </View>
      </TouchableOpacity>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

// ── EditProfileModal ──────────────────────────────────────────────────────────

function EditProfileModal({
  visible, onClose, currentName, currentEmail, onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  currentName: string;
  currentEmail: string;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => { setName(currentName); }, [currentName]);

  const save = async () => {
    if (!name.trim() || name.trim().length < 2) {
      Alert.alert('Invalid', 'Name must be at least 2 characters.');
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() })
      .eq('id', user!.id);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    onSaved(name.trim());
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={modalStyles.root}>
          <View style={modalStyles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={modalStyles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={modalStyles.title}>Edit Profile</Text>
            <TouchableOpacity onPress={save} disabled={loading}>
              {loading
                ? <ActivityIndicator color={Colors.primary} />
                : <Text style={modalStyles.save}>Save</Text>}
            </TouchableOpacity>
          </View>
          <View style={modalStyles.body}>
            <Text style={modalStyles.label}>Full Name</Text>
            <TextInput
              style={modalStyles.input}
              value={name}
              onChangeText={setName}
              placeholderTextColor={Colors.textMuted}
              placeholder="Enter your full name"
              autoCapitalize="words"
            />
            <Text style={modalStyles.label}>Email</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.inputDisabled]}
              value={currentEmail}
              editable={false}
            />
            <Text style={modalStyles.hint}>Email cannot be changed here. Contact support to update it.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── ChangePasswordModal ───────────────────────────────────────────────────────

function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const reset = () => { setCurrent(''); setNext(''); setConfirm(''); };

  const save = async () => {
    if (next.length < 8) { Alert.alert('Too short', 'Password must be at least 8 characters.'); return; }
    if (next !== confirm) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }
    setLoading(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user!.email, password: current });
    if (signInErr) { setLoading(false); Alert.alert('Wrong password', 'Current password is incorrect.'); return; }
    const { error } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Success', 'Password changed successfully.');
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={modalStyles.root}>
          <View style={modalStyles.header}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={modalStyles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={modalStyles.title}>Change Password</Text>
            <TouchableOpacity onPress={save} disabled={loading}>
              {loading
                ? <ActivityIndicator color={Colors.primary} />
                : <Text style={modalStyles.save}>Save</Text>}
            </TouchableOpacity>
          </View>
          <View style={modalStyles.body}>
            <Text style={modalStyles.label}>Current Password</Text>
            <TextInput
              style={modalStyles.input}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
              placeholder="Enter current password"
            />
            <Text style={modalStyles.label}>New Password</Text>
            <TextInput
              style={modalStyles.input}
              value={next}
              onChangeText={setNext}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
              placeholder="At least 8 characters"
            />
            <Text style={modalStyles.label}>Confirm New Password</Text>
            <TextInput
              style={modalStyles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholderTextColor={Colors.textMuted}
              placeholder="Repeat new password"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── PolicyModal ───────────────────────────────────────────────────────────────

function PolicyModal({
  visible, onClose, type,
}: { visible: boolean; onClose: () => void; type: 'terms' | 'privacy' }) {
  const isTerms = type === 'terms';
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <View style={modalStyles.header}>
          <View style={{ width: 60 }} />
          <Text style={modalStyles.title}>{isTerms ? 'Terms of Service' : 'Privacy Policy'}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={modalStyles.save}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={modalStyles.body}>
          {isTerms ? (
            <>
              <Text style={modalStyles.policyTitle}>Terms of Service</Text>
              <Text style={modalStyles.policyDate}>Effective Date: January 1, 2025</Text>
              <Text style={modalStyles.policySection}>1. Acceptance of Terms</Text>
              <Text style={modalStyles.policyText}>By accessing or using the Finance Therapy Group application, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.</Text>
              <Text style={modalStyles.policySection}>2. Use of Service</Text>
              <Text style={modalStyles.policyText}>Finance Therapy Group provides a secure document portal for tax-related files. You agree to use the service only for lawful purposes and in accordance with these terms. You are responsible for maintaining the confidentiality of your account credentials.</Text>
              <Text style={modalStyles.policySection}>3. Document Storage</Text>
              <Text style={modalStyles.policyText}>Documents uploaded to Finance Therapy Group are stored securely using industry-standard encryption. You retain full ownership of all documents you upload. Finance Therapy Group does not share your documents with third parties without your explicit consent.</Text>
              <Text style={modalStyles.policySection}>4. Account Termination</Text>
              <Text style={modalStyles.policyText}>We reserve the right to suspend or terminate accounts that violate these terms, engage in fraudulent activity, or misuse the platform in any way.</Text>
              <Text style={modalStyles.policySection}>5. Limitation of Liability</Text>
              <Text style={modalStyles.policyText}>Finance Therapy Group is not responsible for any loss or damage arising from your use of the service beyond what is required by applicable law.</Text>
              <Text style={modalStyles.policySection}>6. Changes to Terms</Text>
              <Text style={modalStyles.policyText}>We may update these terms from time to time. Continued use of the application after changes constitutes acceptance of the new terms.</Text>
              <Text style={modalStyles.policySection}>7. Contact</Text>
              <Text style={modalStyles.policyText}>For questions regarding these terms, contact us at support@taxnitro.com</Text>
            </>
          ) : (
            <>
              <Text style={modalStyles.policyTitle}>Privacy Policy</Text>
              <Text style={modalStyles.policyDate}>Effective Date: January 1, 2025</Text>
              <Text style={modalStyles.policySection}>1. Information We Collect</Text>
              <Text style={modalStyles.policyText}>We collect information you provide when creating an account (name, email) and documents you upload to the platform. We also collect usage data to improve our service.</Text>
              <Text style={modalStyles.policySection}>2. How We Use Your Information</Text>
              <Text style={modalStyles.policyText}>Your information is used solely to provide and improve the Finance Therapy Group service. We do not sell, trade, or rent your personal information to third parties.</Text>
              <Text style={modalStyles.policySection}>3. Data Security</Text>
              <Text style={modalStyles.policyText}>All data is encrypted in transit using TLS and at rest using AES-256 encryption. We use Supabase infrastructure which complies with SOC 2 Type II standards.</Text>
              <Text style={modalStyles.policySection}>4. Data Retention</Text>
              <Text style={modalStyles.policyText}>Your data is retained for as long as your account is active. You may request deletion of your account and all associated data by contacting support.</Text>
              <Text style={modalStyles.policySection}>5. Cookies &amp; Tracking</Text>
              <Text style={modalStyles.policyText}>The mobile application does not use cookies. We may collect anonymized analytics to understand usage patterns and improve the app experience.</Text>
              <Text style={modalStyles.policySection}>6. Your Rights</Text>
              <Text style={modalStyles.policyText}>You have the right to access, correct, or delete your personal data at any time. Contact us at privacy@taxnitro.com to exercise these rights.</Text>
              <Text style={modalStyles.policySection}>7. Contact</Text>
              <Text style={modalStyles.policyText}>For privacy-related questions, contact us at privacy@taxnitro.com</Text>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

function InfoRow({
  icon, label, children, last,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <>
      <View style={styles.infoRow}>
        <View style={styles.infoIconWrap}>
          <Ionicons name={icon} size={15} color={Colors.textMuted} />
        </View>
        <Text style={styles.infoLabel}>{label}</Text>
        <View style={styles.infoValueWrap}>{children}</View>
      </View>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

interface Stats { total: number; viewed: number; }
interface ProfileData {
  full_name: string;
  email: string;
  client_id: string;
  plan: string;
  created_at: string;
  avatar_url: string | null;
}

interface Props { onLogout: () => void }

export function ProfileScreen({ onLogout }: Props) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<Stats>({ total: 0, viewed: 0 });
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [showBiometricPasswordModal, setShowBiometricPasswordModal] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [profileRes, docsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, email, client_id, plan, created_at, avatar_url')
        .eq('id', user.id)
        .single(),
      supabase.from('documents').select('status').eq('email', user.email),
    ]);

    if (profileRes.data) setProfile(profileRes.data);

    if (docsRes.data) {
      const docs = docsRes.data;
      setStats({
        total: docs.length,
        viewed: docs.filter(d => d.status === 'viewed').length,
      });
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricSupported(compatible && enrolled);
      const stored = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      setBiometricEnabled(stored === 'true');
    })();
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'Biometric login is not supported on web.');
      return;
    }
    if (value) {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!compatible || !enrolled) {
        Alert.alert(
          'Not available',
          'Biometric authentication is not set up on this device. Please configure it in your device settings.',
        );
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm your identity to enable biometric login',
        fallbackLabel: 'Use password',
        cancelLabel: 'Cancel',
      });
      if (!result.success) return;
      setBiometricPassword('');
      setShowBiometricPasswordModal(true);
    } else {
      await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_PASSWORD_KEY);
      setBiometricEnabled(false);
    }
  };

  const saveBiometricCredentials = async () => {
    if (!biometricPassword) { Alert.alert('Required', 'Please enter your password.'); return; }
    await SecureStore.setItemAsync(BIOMETRIC_KEY, 'true');
    await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, user?.email ?? '');
    await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, biometricPassword);
    setBiometricEnabled(true);
    setBiometricPassword('');
    setShowBiometricPasswordModal(false);
    Alert.alert('Enabled', 'Biometric login is now active. You can sign in with your fingerprint or Face ID next time.');
  };

  const pickAvatar = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: any) => {
        const file: File = e.target.files[0];
        if (!file) return;
        setAvatarUploading(true);
        try {
          const ext = file.name.split('.').pop() ?? 'jpg';
          const fileName = `${user!.id}/avatar.${ext}`;
          const arrayBuffer = await file.arrayBuffer();
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, arrayBuffer, { contentType: file.type, upsert: true });
          if (uploadError) { Alert.alert('Upload failed', uploadError.message); return; }
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
          const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
          await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user!.id);
          setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
        } catch (e: any) {
          Alert.alert('Error', e.message ?? 'Failed to upload photo.');
        } finally {
          setAvatarUploading(false);
        }
      };
      input.click();
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setAvatarUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const fileName = `${user!.id}/avatar.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true });
      if (uploadError) { Alert.alert('Upload failed', uploadError.message); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user!.id);
      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to upload photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLogout = () => setSignOutOpen(true);

  const displayName = profile?.full_name ?? user?.name ?? 'User';
  const displayEmail = profile?.email ?? user?.email ?? '';
  const displayClientId = profile?.client_id ?? user?.clientId ?? '—';
  const displayPlan = profile?.plan ?? user?.plan ?? 'Free';
  const displayMember = profile?.created_at ? memberSince(profile.created_at) : '—';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'web' ? 32 : insets.bottom + 90,
        }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Profile Header ──────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#3A3131', '#4A3E3E', '#3A3131']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.header,
            { paddingTop: Platform.OS === 'web' ? 28 : insets.top + 28 },
          ]}
        >
          {/* Avatar */}
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={pickAvatar}
            disabled={avatarUploading}
            activeOpacity={0.85}
          >
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={['#E8B923', '#B5905B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarInitials}
              >
                <Text style={styles.avatarText}>{initials(displayName)}</Text>
              </LinearGradient>
            )}
            {/* Camera overlay */}
            <View style={styles.cameraOverlay}>
              {avatarUploading
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Ionicons name="camera" size={15} color={Colors.white} />}
            </View>
          </TouchableOpacity>

          {/* Name + email */}
          <Text style={styles.headerName}>{displayName}</Text>
          <Text style={styles.headerEmail}>{displayEmail}</Text>

          {/* Plan badge */}
          <View style={styles.planBadge}>
            <Ionicons name="shield-checkmark" size={12} color={Colors.white} />
            <Text style={styles.planBadgeText}>{displayPlan}</Text>
          </View>

          {/* Member since */}
          <Text style={styles.memberSince}>Member since {displayMember}</Text>
        </LinearGradient>

        <View style={styles.content}>

          {/* ── My Stats ───────────────────────────────────────────────────── */}
          <SectionLabel label="MY STATS" />
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginBottom: 20 }} />
          ) : (
            <View style={styles.statsRow}>
              {/* Total Docs */}
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: `${Colors.accent}15` }]}>
                  <Ionicons name="documents-outline" size={20} color={Colors.accent} />
                </View>
                <Text style={[styles.statValue, { color: Colors.accent }]}>{stats.total}</Text>
                <Text style={styles.statLabel}>Total Docs</Text>
              </View>

              {/* Viewed */}
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: `${Colors.primary}15` }]}>
                  <Ionicons name="eye-outline" size={20} color={Colors.primary} />
                </View>
                <Text style={[styles.statValue, { color: Colors.primary }]}>{stats.viewed}</Text>
                <Text style={styles.statLabel}>Viewed</Text>
              </View>

              {/* Pending */}
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: `${Colors.accentGold}15` }]}>
                  <Ionicons name="time-outline" size={20} color={Colors.accentGold} />
                </View>
                <Text style={[styles.statValue, { color: Colors.accentGold }]}>
                  {stats.total - stats.viewed}
                </Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
            </View>
          )}

          {/* ── Account Information ─────────────────────────────────────── */}
          <SectionLabel label="ACCOUNT" />
          <View style={styles.card}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 20 }} />
            ) : (
              <>
                <InfoRow icon="id-card-outline" label="Client ID">
                  <Text style={styles.infoValue} numberOfLines={1}>{displayClientId}</Text>
                </InfoRow>

                <InfoRow icon="mail-outline" label="Email">
                  <Text style={styles.infoValue} numberOfLines={1}>{displayEmail}</Text>
                </InfoRow>

                <InfoRow icon="layers-outline" label="Plan">
                  <View style={styles.planPill}>
                    <Text style={styles.planPillText}>{displayPlan}</Text>
                  </View>
                </InfoRow>

                <View style={styles.rowDivider} />

                <SettingRow
                  icon="person-outline"
                  label="Edit Profile"
                  onPress={() => setShowEditProfile(true)}
                  color={Colors.primary}
                />

                <SettingRow
                  icon="lock-closed-outline"
                  label="Change Password"
                  onPress={() => setShowChangePassword(true)}
                  color={Colors.accentPurple}
                  last
                />
              </>
            )}
          </View>

          {/* ── Preferences ───────────────────────────────────────────────── */}
          <SectionLabel label="PREFERENCES" />
          <View style={styles.card}>
            <SettingRow
              icon="notifications-outline"
              label="Push Notifications"
              toggle
              toggleValue={notifEnabled}
              onToggle={setNotifEnabled}
              color={Colors.primary}
            />
            <SettingRow
              icon="finger-print-outline"
              label="Biometric Login"
              toggle
              toggleValue={biometricEnabled}
              onToggle={handleBiometricToggle}
              color={Colors.accent}
            />
            <SettingRow
              icon="sync-outline"
              label="Auto-Sync Documents"
              toggle
              toggleValue={autoSync}
              onToggle={setAutoSync}
              color={Colors.accentGold}
              last
            />
          </View>

          {/* ── About ─────────────────────────────────────────────────────── */}
          <SectionLabel label="ABOUT" />
          <View style={styles.card}>
            <SettingRow
              icon="document-text-outline"
              label="Terms of Service"
              onPress={() => setShowTerms(true)}
              color={Colors.textSecondary}
            />
            <SettingRow
              icon="shield-outline"
              label="Privacy Policy"
              onPress={() => setShowPrivacy(true)}
              color={Colors.textSecondary}
            />
            <SettingRow
              icon="information-circle-outline"
              label="App Version"
              value="1.0.0"
              color={Colors.textSecondary}
              last
            />
          </View>

          {/* ── Sign Out ───────────────────────────────────────────────────── */}
          <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color={Colors.white} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>Finance Therapy Group · 256-bit SSL · v1.0.0</Text>
        </View>
      </ScrollView>

      {/* ── Sign Out Confirm Modal ─────────────────────────────────────────── */}
      <Modal
        visible={signOutOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSignOutOpen(false)}
      >
        <Pressable style={so.overlay} onPress={() => setSignOutOpen(false)}>
          <Pressable style={so.box} onPress={() => {}}>
            <LinearGradient
              colors={[Colors.error + '30', Colors.error + '10']}
              style={so.iconWrap}
            >
              <Ionicons name="log-out-outline" size={32} color={Colors.error} />
            </LinearGradient>
            <Text style={so.title}>Sign Out</Text>
            <Text style={so.sub}>Are you sure you want to sign out of your account?</Text>
            <View style={so.row}>
              <TouchableOpacity style={so.cancelBtn} onPress={() => setSignOutOpen(false)}>
                <Text style={so.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={so.confirmBtn}
                onPress={() => { setSignOutOpen(false); logout(); }}
              >
                <Ionicons name="log-out-outline" size={16} color={Colors.white} />
                <Text style={so.confirmText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Edit Profile Modal ─────────────────────────────────────────────── */}
      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        currentName={displayName}
        currentEmail={displayEmail}
        onSaved={(name) => setProfile(prev => prev ? { ...prev, full_name: name } : prev)}
      />

      {/* ── Change Password Modal ──────────────────────────────────────────── */}
      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

      {/* ── Policy Modals ──────────────────────────────────────────────────── */}
      <PolicyModal visible={showTerms} onClose={() => setShowTerms(false)} type="terms" />
      <PolicyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} type="privacy" />

      {/* ── Biometric Password Capture Modal ──────────────────────────────── */}
      <Modal
        visible={showBiometricPasswordModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowBiometricPasswordModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={bioModal.overlay}>
            <View style={bioModal.card}>
              <View style={bioModal.iconRow}>
                <View style={bioModal.iconBg}>
                  <Ionicons name="finger-print-outline" size={34} color={Colors.primary} />
                </View>
              </View>
              <Text style={bioModal.title}>Enable Biometric Login</Text>
              <Text style={bioModal.subtitle}>
                Enter your password to save it securely on this device.
              </Text>
              <TextInput
                style={bioModal.input}
                value={biometricPassword}
                onChangeText={setBiometricPassword}
                secureTextEntry
                placeholder="Your current password"
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
              <View style={bioModal.btnRow}>
                <TouchableOpacity
                  style={bioModal.cancelBtn}
                  onPress={() => setShowBiometricPasswordModal(false)}
                >
                  <Text style={bioModal.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={bioModal.confirmBtn} onPress={saveBiometricCredentials}>
                  <Text style={bioModal.confirmText}>Enable</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── StyleSheet ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarInitials: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E8B923',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3A3131',
  },
  headerName: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  headerEmail: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 14,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E8B923',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  planBadgeText: {
    color: '#3A3131',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  memberSince: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },

  // Content container
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // Section label
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingLeft: 4,
    marginTop: 4,
  },

  // Shared card
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Info rows (account card top section)
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  infoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  infoValueWrap: {
    alignItems: 'flex-end',
    maxWidth: '55%',
  },
  infoValue: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  planPill: {
    backgroundColor: `${Colors.primary}18`,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
  },
  planPillText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },

  // Setting rows
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingValue: {
    color: Colors.textMuted,
    fontSize: 13,
  },

  // Divider
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 62,
  },

  // Sign Out button
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.error,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 4,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  signOutText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  footer: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
    opacity: 0.6,
  },
});

// ── Sign-out modal styles ─────────────────────────────────────────────────────

const so = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    backgroundColor: Colors.bgCard,
    borderRadius: 24,
    padding: 28,
    width: 300,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  sub: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.bgMid,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: Colors.error,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  confirmText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});

// ── Modal shared styles ───────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  cancel: {
    color: Colors.textMuted,
    fontSize: 15,
  },
  save: {
    color: '#E8B923',
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    padding: 24,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: Colors.bgMid,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  policyTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  policyDate: {
    color: Colors.textMuted,
    fontSize: 13,
    marginBottom: 20,
  },
  policySection: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 6,
  },
  policyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
});

// ── Biometric modal styles ────────────────────────────────────────────────────

const bioModal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBg: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.primary}25`,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 19,
  },
  input: {
    backgroundColor: Colors.bgMid,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.bgMid,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#E8B923',
    alignItems: 'center',
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmText: {
    color: '#3A3131',
    fontSize: 14,
    fontWeight: '700',
  },
});
