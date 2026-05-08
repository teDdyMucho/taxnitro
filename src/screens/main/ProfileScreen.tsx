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
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const BIOMETRIC_KEY = 'biometric_enabled';
const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'biometric_password';

// ── helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function memberSince(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── sub-components ────────────────────────────────────────────────────────────

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

function SettingRow({ icon, label, value, toggle, toggleValue, onToggle, onPress, color, danger, last }: SettingRowProps) {
  return (
    <>
      <TouchableOpacity style={styles.settingRow} onPress={onPress} disabled={toggle || !onPress} activeOpacity={0.7}>
        <View style={[styles.settingIcon, { backgroundColor: `${color || Colors.primary}18` }]}>
          <Ionicons name={icon} size={18} color={danger ? Colors.error : color || Colors.primary} />
        </View>
        <Text style={[styles.settingLabel, danger && { color: Colors.error }]}>{label}</Text>
        <View style={styles.settingRight}>
          {value ? <Text style={styles.settingValue}>{value}</Text> : null}
          {toggle ? (
            <Switch value={toggleValue} onValueChange={onToggle}
              trackColor={{ false: Colors.bgElevated, true: Colors.primary }}
              thumbColor={Colors.white}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
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

// ── modals ────────────────────────────────────────────────────────────────────

function EditProfileModal({ visible, onClose, currentName, currentEmail, onSaved }: {
  visible: boolean; onClose: () => void;
  currentName: string; currentEmail: string;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => { setName(currentName); }, [currentName]);

  const save = async () => {
    if (!name.trim() || name.trim().length < 2) {
      Alert.alert('Invalid', 'Name must be at least 2 characters.'); return;
    }
    setLoading(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user!.id);
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
            <TouchableOpacity onPress={onClose}><Text style={modalStyles.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={modalStyles.title}>Edit Profile</Text>
            <TouchableOpacity onPress={save} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={modalStyles.save}>Save</Text>}
            </TouchableOpacity>
          </View>
          <View style={modalStyles.body}>
            <Text style={modalStyles.label}>Full Name</Text>
            <TextInput style={modalStyles.input} value={name} onChangeText={setName}
              placeholderTextColor={Colors.textMuted} placeholder="Enter your full name"
              autoCapitalize="words" />
            <Text style={modalStyles.label}>Email</Text>
            <TextInput style={[modalStyles.input, modalStyles.inputDisabled]}
              value={currentEmail} editable={false} />
            <Text style={modalStyles.hint}>Email cannot be changed here. Contact support to update it.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
    // Re-authenticate first
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user!.email, password: current });
    if (signInErr) { setLoading(false); Alert.alert('Wrong password', 'Current password is incorrect.'); return; }
    const { error } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Success', 'Password changed successfully.');
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={modalStyles.root}>
          <View style={modalStyles.header}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={modalStyles.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={modalStyles.title}>Change Password</Text>
            <TouchableOpacity onPress={save} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={modalStyles.save}>Save</Text>}
            </TouchableOpacity>
          </View>
          <View style={modalStyles.body}>
            <Text style={modalStyles.label}>Current Password</Text>
            <TextInput style={modalStyles.input} value={current} onChangeText={setCurrent}
              secureTextEntry placeholderTextColor={Colors.textMuted} placeholder="Enter current password" />
            <Text style={modalStyles.label}>New Password</Text>
            <TextInput style={modalStyles.input} value={next} onChangeText={setNext}
              secureTextEntry placeholderTextColor={Colors.textMuted} placeholder="At least 8 characters" />
            <Text style={modalStyles.label}>Confirm New Password</Text>
            <TextInput style={modalStyles.input} value={confirm} onChangeText={setConfirm}
              secureTextEntry placeholderTextColor={Colors.textMuted} placeholder="Repeat new password" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PolicyModal({ visible, onClose, type }: { visible: boolean; onClose: () => void; type: 'terms' | 'privacy' }) {
  const isTerms = type === 'terms';
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <View style={modalStyles.header}>
          <View style={{ width: 60 }} />
          <Text style={modalStyles.title}>{isTerms ? 'Terms of Service' : 'Privacy Policy'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={modalStyles.save}>Done</Text></TouchableOpacity>
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
              <Text style={modalStyles.policySection}>5. Cookies & Tracking</Text>
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

// ── main screen ───────────────────────────────────────────────────────────────

interface Stats { total: number; viewed: number; }
interface ProfileData { full_name: string; email: string; client_id: string; plan: string; created_at: string; avatar_url: string | null; }

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

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [profileRes, docsRes] = await Promise.all([
      supabase.from('profiles').select('full_name, email, client_id, plan, created_at, avatar_url').eq('id', user.id).single(),
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
        Alert.alert('Not available', 'Biometric authentication is not set up on this device. Please configure it in your device settings.');
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
      // On web use a native file input
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

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const displayName = profile?.full_name ?? user?.name ?? 'User';
  const displayEmail = profile?.email ?? user?.email ?? '';
  const displayClientId = profile?.client_id ?? user?.clientId ?? '—';
  const displayPlan = profile?.plan ?? user?.plan ?? 'Free';
  const displayMember = profile?.created_at ? memberSince(profile.created_at) : '—';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 90 }} showsVerticalScrollIndicator={false}>

        {/* Banner */}
        <LinearGradient colors={[Colors.bgDark, Colors.bgDeep]} style={[styles.banner, { paddingTop: Platform.OS === 'web' ? 20 : insets.top + 20 }]}>
          <View style={styles.avatarWrapper}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <LinearGradient colors={[Colors.primary, Colors.accent]} style={styles.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={styles.avatarText}>{initials(displayName)}</Text>
              </LinearGradient>
            )}
            <TouchableOpacity style={styles.editAvatarBtn} onPress={pickAvatar} disabled={avatarUploading}>
              {avatarUploading
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Ionicons name="camera" size={14} color={Colors.white} />}
            </TouchableOpacity>
          </View>

          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{displayEmail}</Text>

          <View style={styles.planRow}>
            <LinearGradient colors={['rgba(37,99,235,0.3)', 'rgba(124,58,237,0.3)']} style={styles.planBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="flash" size={12} color={Colors.primary} />
              <Text style={styles.planText}>{displayPlan} Client</Text>
            </LinearGradient>
            <Text style={styles.memberSince}>Member since {displayMember}</Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>

          {/* Account Info */}
          <Card style={styles.infoCard}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 16 }} />
            ) : (
              <>
                <View style={styles.infoRow}>
                  <Ionicons name="id-card-outline" size={16} color={Colors.textMuted} />
                  <Text style={styles.infoLabel}>Client ID</Text>
                  <Text style={styles.infoValue}>{displayClientId}</Text>
                </View>
                <View style={[styles.infoRow, styles.infoBorder]}>
                  <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>{displayEmail}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={Colors.textMuted} />
                  <Text style={styles.infoLabel}>Plan</Text>
                  <Text style={styles.infoValue}>{displayPlan}</Text>
                </View>
              </>
            )}
          </Card>

          {/* Stats */}
          <Text style={styles.sectionTitle}>My Stats</Text>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginBottom: 16 }} />
          ) : (
            <View style={styles.statsRow}>
              {[
                { label: 'Total Docs', value: stats.total, icon: 'documents-outline', color: Colors.primary },
                { label: 'Viewed', value: stats.viewed, icon: 'eye-outline', color: Colors.viewed },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Ionicons name={s.icon as any} size={20} color={s.color} style={{ marginBottom: 6 }} />
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Preferences */}
          <Text style={styles.sectionTitle}>Preferences</Text>
          <Card noPadding>
            <SettingRow icon="notifications-outline" label="Push Notifications" toggle toggleValue={notifEnabled} onToggle={setNotifEnabled} color={Colors.primary} />
            <SettingRow icon="finger-print-outline" label="Biometric Login" toggle toggleValue={biometricEnabled} onToggle={handleBiometricToggle} color={Colors.accent} />
            <SettingRow icon="sync-outline" label="Auto-Sync Documents" toggle toggleValue={autoSync} onToggle={setAutoSync} color={Colors.viewed} last />
          </Card>

          {/* Account */}
          <Text style={styles.sectionTitle}>Account</Text>
          <Card noPadding>
            <SettingRow icon="person-outline" label="Edit Profile" onPress={() => setShowEditProfile(true)} color={Colors.primary} />
            <SettingRow icon="lock-closed-outline" label="Change Password" onPress={() => setShowChangePassword(true)} color={Colors.notViewed} last />
          </Card>

          {/* About */}
          <Text style={styles.sectionTitle}>About</Text>
          <Card noPadding>
            <SettingRow icon="document-text-outline" label="Terms of Service" onPress={() => setShowTerms(true)} color={Colors.textMuted} />
            <SettingRow icon="eye-outline" label="Privacy Policy" onPress={() => setShowPrivacy(true)} color={Colors.textMuted} />
            <SettingRow icon="information-circle-outline" label="App Version" value="1.0.0" color={Colors.textMuted} last />
          </Card>

          {/* Logout */}
          <Button title="Sign Out" onPress={handleLogout} variant="danger" fullWidth size="lg" style={styles.logoutBtn} />
          <Text style={styles.footer}>Finance Therapy Group · 256-bit SSL · v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Modals */}
      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        currentName={displayName}
        currentEmail={displayEmail}
        onSaved={(name) => {
          setProfile(prev => prev ? { ...prev, full_name: name } : prev);
        }}
      />
      <ChangePasswordModal visible={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <PolicyModal visible={showTerms} onClose={() => setShowTerms(false)} type="terms" />
      <PolicyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} type="privacy" />

      {/* Biometric password capture modal */}
      <Modal visible={showBiometricPasswordModal} animationType="fade" transparent onRequestClose={() => setShowBiometricPasswordModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={bioModalStyles.overlay}>
            <View style={bioModalStyles.card}>
              <View style={bioModalStyles.iconRow}>
                <Ionicons name="finger-print-outline" size={36} color={Colors.primary} />
              </View>
              <Text style={bioModalStyles.title}>Enable Biometric Login</Text>
              <Text style={bioModalStyles.subtitle}>Enter your password to save it securely on this device.</Text>
              <TextInput
                style={bioModalStyles.input}
                value={biometricPassword}
                onChangeText={setBiometricPassword}
                secureTextEntry
                placeholder="Your current password"
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
              <View style={bioModalStyles.btnRow}>
                <TouchableOpacity style={bioModalStyles.cancelBtn} onPress={() => setShowBiometricPasswordModal(false)}>
                  <Text style={bioModalStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={bioModalStyles.confirmBtn} onPress={saveBiometricCredentials}>
                  <Text style={bioModalStyles.confirmText}>Enable</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  banner: { alignItems: 'center', paddingBottom: 28, paddingHorizontal: 20 },
  avatarWrapper: { position: 'relative', marginBottom: 14 },
  avatar: { width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },
  avatarImage: { width: 88, height: 88, borderRadius: 26, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },
  avatarText: { color: Colors.white, fontSize: 30, fontWeight: '700' },
  editAvatarBtn: { position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bgDeep },
  profileName: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  profileEmail: { color: Colors.textMuted, fontSize: 14, marginBottom: 14 },
  planRow: { alignItems: 'center', gap: 8 },
  planBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)', marginBottom: 4 },
  planText: { color: Colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  memberSince: { color: Colors.textMuted, fontSize: 12 },
  content: { padding: 16 },
  infoCard: { marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  infoBorder: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 12, marginVertical: 4 },
  infoLabel: { color: Colors.textMuted, fontSize: 13, width: 65 },
  infoValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  sectionTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 20, paddingLeft: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  statCard: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  statLabel: { color: Colors.textMuted, fontSize: 11, textAlign: 'center' },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  settingIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingValue: { color: Colors.textMuted, fontSize: 13 },
  rowDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 62 },
  logoutBtn: { marginTop: 24 },
  footer: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 24, opacity: 0.6 },
});

const modalStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  cancel: { color: Colors.textMuted, fontSize: 15 },
  save: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  body: { padding: 24 },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: Colors.bgMid, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: 15, paddingHorizontal: 14, paddingVertical: 13 },
  inputDisabled: { opacity: 0.5 },
  hint: { color: Colors.textMuted, fontSize: 12, marginTop: 6 },
  policyTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  policyDate: { color: Colors.textMuted, fontSize: 13, marginBottom: 20 },
  policySection: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 6 },
  policyText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
});

const bioModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.bgCard, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: Colors.border },
  iconRow: { alignItems: 'center', marginBottom: 14 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  input: { backgroundColor: Colors.bgMid, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: 15, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 20 },
  btnRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});
