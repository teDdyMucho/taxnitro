import { nativeDriver } from '../../constants/platform';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { InputField } from '../../components/InputField';
import { Button } from '../../components/Button';
import { useAuth } from '../../hooks/useAuth';

const BIOMETRIC_KEY = 'biometric_enabled';
const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'biometric_password';

interface Props {
  onLoginSuccess: () => void;
  onNavigateRegister: () => void;
}

export function LoginScreen({ onLoginSuccess, onNavigateRegister }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const { login, error, forgotPassword } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 768;

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: nativeDriver }),
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: nativeDriver }),
      Animated.spring(logoScale, { toValue: 1, damping: 14, stiffness: 100, useNativeDriver: nativeDriver }),
    ]).start();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      if (enabled !== 'true') return;
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (compatible && enrolled) {
        setBiometricAvailable(true);
        handleBiometricLogin();
      }
    })();
  }, []);

  const handleBiometricLogin = async () => {
    if (Platform.OS === 'web') return;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to Finance Therapy Group',
      fallbackLabel: 'Use password',
      cancelLabel: 'Cancel',
    });
    if (!result.success) return;
    const savedEmail = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
    const savedPassword = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);
    if (savedEmail && savedPassword) {
      await login(savedEmail, savedPassword);
    }
  };

  const validate = () => {
    let valid = true;
    if (!email || !email.includes('@')) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    } else setEmailError('');
    if (!password || password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      valid = false;
    } else setPasswordError('');
    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setSigningIn(true);
    await login(email, password);
    setSigningIn(false);
  };

  const handleForgotSubmit = async () => {
    if (!forgotEmail || !forgotEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setForgotLoading(true);
    const result = await forgotPassword(forgotEmail);
    setForgotLoading(false);
    if (result.success) {
      setForgotSent(true);
    } else {
      Alert.alert('Error', result.error ?? 'Something went wrong. Please try again.');
    }
  };

  const closeForgot = () => {
    setShowForgot(false);
    setForgotEmail('');
    setForgotSent(false);
    setForgotLoading(false);
  };

  // ── Shared login form (used in both layouts) ──────────────────────────────
  const loginForm = (
    <>
      <InputField
        label="Email Address"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        leftIcon="mail-outline"
        error={emailError}
      />
      <InputField
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        isPassword
        leftIcon="lock-closed-outline"
        error={passwordError}
      />

      <View style={styles.rowBetween}>
        <View style={styles.rememberRow}>
          <Switch
            value={rememberMe}
            onValueChange={setRememberMe}
            trackColor={{ false: Colors.bgElevated, true: Colors.primary }}
            thumbColor={Colors.white}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
          <Text style={styles.rememberText}>Remember me</Text>
        </View>
        <TouchableOpacity onPress={() => { setForgotEmail(email); setShowForgot(true); }}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <Button
        title="Sign In"
        onPress={handleLogin}
        loading={signingIn}
        fullWidth
        size="lg"
        style={{ marginTop: 4, backgroundColor: '#E8B923', shadowColor: '#E8B923', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}
        textStyle={{ color: '#3A3131', fontWeight: '700' }}
      />

      {biometricAvailable && (
        <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin} disabled={signingIn}>
          <Ionicons name="finger-print-outline" size={22} color="#E8B923" />
          <Text style={styles.biometricText}>Sign in with Biometrics</Text>
        </TouchableOpacity>
      )}

    </>
  );

  // ── Forgot Password Modal (shared) ────────────────────────────────────────
  const forgotModal = (
    <Modal visible={showForgot} animationType="fade" transparent onRequestClose={closeForgot}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={forgotStyles.overlay}>
          <View style={forgotStyles.card}>
            <View style={forgotStyles.iconWrap}>
              <Text style={forgotStyles.iconEmoji}>🔑</Text>
            </View>
            {forgotSent ? (
              <>
                <Text style={forgotStyles.title}>Check your email</Text>
                <Text style={forgotStyles.subtitle}>
                  We sent a password reset link to{'\n'}
                  <Text style={forgotStyles.emailHighlight}>{forgotEmail}</Text>
                  {'\n\n'}Check your inbox (and spam folder) and click the link to reset your password.
                </Text>
                <TouchableOpacity style={forgotStyles.primaryBtn} onPress={closeForgot}>
                  <Text style={forgotStyles.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={forgotStyles.title}>Forgot Password?</Text>
                <Text style={forgotStyles.subtitle}>
                  Enter your email and we'll send you a link to reset your password.
                </Text>
                <TextInput
                  style={forgotStyles.input}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="#64748b"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
                <View style={forgotStyles.btnRow}>
                  <TouchableOpacity style={forgotStyles.cancelBtn} onPress={closeForgot}>
                    <Text style={forgotStyles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={forgotStyles.primaryBtn} onPress={handleForgotSubmit} disabled={forgotLoading}>
                    {forgotLoading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={forgotStyles.primaryBtnText}>Send Link</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── Desktop Web: full-screen background + floating card ──────────────────
  if (isDesktopWeb) {
    return (
      <View style={split.root}>
        {/* Full-screen background gradient */}
        <LinearGradient
          colors={['#2C2320', '#3A3131', '#2C2320']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {/* Subtle orbs */}
        <View style={split.orbBlue} />
        <View style={split.orbPurple} />

        {/* Grid lines overlay (decorative) */}
        <View style={split.gridOverlay} />

        {/* LEFT: branding content — absolutely fills left side */}
        <View style={split.leftPane}>
          {/* Top logo */}
          <View style={split.brandRow}>
            <Image
              source={require('../../../assets/main-logo.png')}
              style={{ width: 260, height: 100 }}
              resizeMode="contain"
            />
          </View>

          {/* Main headline */}
          <View style={split.headlineWrap}>
            <Text style={split.headline}>Your Financial{'\n'}Documents,{'\n'}
              <Text style={[split.headlineAccent, { color: '#E8B923' }]}>Secured.</Text>
            </Text>
            <Text style={split.headlineSub}>
              The all-in-one portal to access, manage,{'\n'}and track all your important documents.
            </Text>
          </View>

          {/* Feature cards */}
          <View style={split.featureGrid}>
            {[
              { icon: 'document-text', label: 'Document Hub', sub: 'All your files, organized' },
              { icon: 'shield-checkmark', label: 'Bank-Level Security', sub: '256-bit SSL encryption' },
              { icon: 'flash', label: 'Real-time Sync', sub: 'Instant updates, always' },
              { icon: 'notifications', label: 'Smart Alerts', sub: 'Never miss a thing' },
            ].map(f => (
              <View key={f.label} style={split.featureCard}>
                <LinearGradient colors={['rgba(232,185,35,0.15)', 'rgba(181,144,91,0.08)']} style={split.featureCardGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Ionicons name={f.icon as any} size={22} color="#E8B923" />
                  <Text style={split.featureCardLabel}>{f.label}</Text>
                  <Text style={split.featureCardSub}>{f.sub}</Text>
                </LinearGradient>
              </View>
            ))}
          </View>

          <Text style={split.leftFooter}>Trusted · Secure · Real-time</Text>
        </View>

        {/* RIGHT: floating glass card */}
        <View style={split.rightPane}>
          <ScrollView
            contentContainerStyle={split.cardScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={split.glassCard}>
              {/* Card top accent line */}
              <LinearGradient colors={['#E8B923', '#B5905B']} style={split.cardTopAccent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />

              {/* Card header */}
              <View style={split.cardHeader}>
                <Text style={split.cardTitle}>Welcome Back</Text>
                <Text style={split.cardSubtitle}>Sign in to continue to Finance Therapy Group</Text>
              </View>

              {/* Form */}
              <View style={split.cardBody}>
                {loginForm}
              </View>

              {/* Card footer note */}
              <Text style={split.cardNote}>
                Need help? Contact your administrator.
              </Text>
            </View>
          </ScrollView>
        </View>

        {forgotModal}
      </View>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Full background — covers everything including scroll overscroll area */}
      <View style={StyleSheet.absoluteFillObject}>
        <LinearGradient
          colors={['#3A3131', '#4A3E3E']}
          style={{ flex: 1 }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </View>

      <View style={[styles.orb, styles.orb1]} />
      <View style={[styles.orb, styles.orb2]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
          <Animated.View style={[styles.logoSection, { transform: [{ scale: logoScale }] }]}>
            <Image
              source={require('../../../assets/main-logo.png')}
              style={{ width: 140, height: 56, alignSelf: 'center', marginBottom: 8 }}
              resizeMode="contain"
            />
            <Text style={styles.appTagline}>Your document portal</Text>
          </Animated.View>

          <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
            <Text style={styles.cardTitle}>Welcome back</Text>
            <Text style={styles.cardSubtitle}>Sign in to access your documents</Text>
            <View style={styles.form}>
              {loginForm}
            </View>
          </Animated.View>

          <Text style={styles.footerText}>
            Secured by Finance Therapy Group · 256-bit SSL encryption
          </Text>
        </View>
      </KeyboardAvoidingView>

      {forgotModal}
    </View>
  );
}

// ── Mobile styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#3A3131',
    overflow: 'hidden' as any,
    ...(Platform.OS === 'web' ? { height: '100vh' as any, maxHeight: '100vh' as any } : {}),
  },
  keyboardView: { flex: 1, overflow: 'hidden' as any },
  scroll: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 12,
  },
  orb: { position: 'absolute', borderRadius: 999 },
  orb1: { width: 250, height: 250, backgroundColor: 'rgba(232,185,35,0.06)', top: -80, right: -60 },
  orb2: { width: 180, height: 180, backgroundColor: 'rgba(181,144,91,0.05)', bottom: 80, left: -50 },
  logoSection: { alignItems: 'center', marginBottom: 0 },
  logoContainer: {
    marginBottom: 14,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  logoGradient: { width: 70, height: 70, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  logoIcon: { fontSize: 34 },
  appName: { color: Colors.textPrimary, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  appTagline: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 },
  card: { backgroundColor: Colors.bgCard, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 4, letterSpacing: -0.4 },
  cardSubtitle: { color: Colors.textMuted, fontSize: 13, marginBottom: 14 },
  form: { gap: 0 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rememberText: { color: Colors.textSecondary, fontSize: 13 },
  forgotText: { color: '#E8B923', fontSize: 13, fontWeight: '600' },
  errorBanner: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  errorBannerText: { color: Colors.error, fontSize: 13, textAlign: 'center' },
  loginBtn: { marginTop: 4, shadowColor: '#E8B923', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  biometricBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(232,185,35,0.3)', backgroundColor: 'rgba(232,185,35,0.08)' },
  biometricText: { color: '#E8B923', fontSize: 14, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: 13 },
  registerLink: { alignItems: 'center' },
  registerLinkText: { color: Colors.textSecondary, fontSize: 14 },
  registerLinkAccent: { color: '#E8B923', fontWeight: '700' },
  footerText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 8 },
});

// ── Desktop web styles ────────────────────────────────────────────────────────

const split = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#020817',
  },

  // glowing orbs
  orbBlue: {
    position: 'absolute',
    width: 600,
    height: 600,
    borderRadius: 300,
    backgroundColor: 'rgba(232,185,35,0.06)',
    top: -200,
    left: -100,
  },
  orbPurple: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: 'rgba(181,144,91,0.05)',
    bottom: -150,
    left: 200,
  },
  orbCyan: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(6,182,212,0.06)',
    top: 100,
    left: '40%' as any,
  },
  gridOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.03,
  },

  // LEFT pane
  leftPane: {
    flex: 1,
    paddingHorizontal: 64,
    paddingVertical: 48,
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandEmoji: { fontSize: 22 },
  brandName: {
    color: '#f1f5f9',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  headlineWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  headline: {
    color: '#ffffff',
    fontSize: 56,
    fontWeight: '800',
    lineHeight: 66,
    letterSpacing: -2,
    marginBottom: 20,
  },
  headlineAccent: {
    color: '#E8B923',
  },
  headlineSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 16,
    lineHeight: 26,
  },

  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap' as any,
    gap: 12,
    marginBottom: 40,
  },
  featureCard: {
    width: '47%' as any,
    borderRadius: 16,
    overflow: 'hidden' as any,
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.2)',
  },
  featureCardGrad: {
    padding: 18,
    gap: 8,
  },
  featureCardLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  featureCardSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  leftFooter: {
    color: 'rgba(232,185,35,0.4)',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase' as any,
  },

  // RIGHT pane — flex: 0, fixed width, centered
  rightPane: {
    width: 440,
    justifyContent: 'center',
    paddingVertical: 40,
    paddingRight: 48,
    paddingLeft: 8,
  },
  cardScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // The floating glass card — white on dark background
  glassCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E8E0D0',
    overflow: 'hidden' as any,
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.15,
    shadowRadius: 60,
    elevation: 30,
  },
  cardTopAccent: {
    height: 4,
    width: '100%',
  },
  cardHeader: {
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 8,
  },
  cardTitle: {
    color: '#1C1713',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  cardSubtitle: {
    color: '#A8998A',
    fontSize: 14,
  },
  cardBody: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 8,
  },
  cardNote: {
    color: '#A8998A',
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingBottom: 24,
    paddingTop: 4,
  },
});

// ── Forgot password modal styles ──────────────────────────────────────────────

const forgotStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(44,35,32,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#E8E0D0',
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(232,185,35,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.25)',
  },
  iconEmoji: { fontSize: 28 },
  title: { color: '#1C1713', fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  subtitle: { color: '#A8998A', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emailHighlight: { color: '#1C1713', fontWeight: '700' },
  input: {
    width: '100%',
    backgroundColor: '#FAFAF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E0D0',
    color: '#1C1713',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 20,
  },
  btnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#E8E0D0', alignItems: 'center', backgroundColor: '#F5F0E8' },
  cancelText: { color: '#6B5E52', fontSize: 14, fontWeight: '600' },
  primaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#E8B923', alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  primaryBtnText: { color: '#2C2320', fontSize: 14, fontWeight: '800' },
});
