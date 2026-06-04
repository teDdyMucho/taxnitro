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
  Easing,
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
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const orb1Y = useRef(new Animated.Value(0)).current;
  const orb2Y = useRef(new Animated.Value(0)).current;
  const orb1Scale = useRef(new Animated.Value(1)).current;
  const orb2Scale = useRef(new Animated.Value(1)).current;
  const shimmerX = useRef(new Animated.Value(-440)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroY = useRef(new Animated.Value(30)).current;
  const featureAnims = useRef(
    [0, 1, 2, 3].map(() => ({ opacity: new Animated.Value(0), y: new Animated.Value(20) }))
  ).current;
  const cardEntranceRX   = useRef(new Animated.Value(-12)).current;
  const cardHoverRX      = useRef(new Animated.Value(0)).current;
  const cardHoverRY      = useRef(new Animated.Value(0)).current;
  const cardHoverScale   = useRef(new Animated.Value(1)).current;
  const loginParticles   = useRef([0,1,2,3,4,5].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: nativeDriver }),
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: nativeDriver }),
      Animated.spring(logoScale, { toValue: 1, damping: 14, stiffness: 100, useNativeDriver: nativeDriver }),
    ]).start();
    Animated.spring(cardEntranceRX, { toValue: 0, damping: 16, stiffness: 72, delay: 350, useNativeDriver: nativeDriver }).start();
  }, []);

  useEffect(() => {
    const float = (anim: Animated.Value, range: number, dur: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: -range, duration: dur, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
          Animated.timing(anim, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
        ])
      ).start();

    const pulsate = (anim: Animated.Value, to: number, dur: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: to, duration: dur, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
          Animated.timing(anim, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
        ])
      ).start();

    float(orb1Y, 40, 8000, 0);
    float(orb2Y, 26, 11000, 3500);
    pulsate(orb1Scale, 1.2, 7000, 800);
    pulsate(orb2Scale, 1.14, 9000, 2000);
    [6000, 8000, 7000, 9000, 6500, 8500].forEach((dur, i) =>
      float(loginParticles[i], 22, dur, [0, 1200, 2400, 800, 3000, 1600][i])
    );

    Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.timing(shimmerX, { toValue: 440, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
        Animated.timing(shimmerX, { toValue: -440, duration: 0, useNativeDriver: nativeDriver }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!isDesktopWeb) return;
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 600, useNativeDriver: nativeDriver }),
        Animated.spring(heroY, { toValue: 0, damping: 18, stiffness: 100, useNativeDriver: nativeDriver }),
      ]),
      Animated.stagger(100, featureAnims.map(a =>
        Animated.parallel([
          Animated.timing(a.opacity, { toValue: 1, duration: 400, useNativeDriver: nativeDriver }),
          Animated.spring(a.y, { toValue: 0, damping: 16, stiffness: 120, useNativeDriver: nativeDriver }),
        ])
      )),
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

  // ── Card 3D hover handlers ────────────────────────────────────────────────
  const handleCardMove = (e: any) => {
    if (Platform.OS !== 'web') return;
    const rect = e.currentTarget?.getBoundingClientRect?.();
    if (!rect) return;
    const tx = ((e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)) * -4;
    const ty = ((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)) * 4;
    Animated.parallel([
      Animated.spring(cardHoverRX, { toValue: tx, damping: 10, stiffness: 200, useNativeDriver: nativeDriver }),
      Animated.spring(cardHoverRY, { toValue: ty, damping: 10, stiffness: 200, useNativeDriver: nativeDriver }),
      Animated.spring(cardHoverScale, { toValue: 1.015, damping: 14, stiffness: 180, useNativeDriver: nativeDriver }),
    ]).start();
  };
  const handleCardLeave = () => {
    Animated.parallel([
      Animated.spring(cardHoverRX, { toValue: 0, damping: 14, stiffness: 180, useNativeDriver: nativeDriver }),
      Animated.spring(cardHoverRY, { toValue: 0, damping: 14, stiffness: 180, useNativeDriver: nativeDriver }),
      Animated.spring(cardHoverScale, { toValue: 1, damping: 14, stiffness: 180, useNativeDriver: nativeDriver }),
    ]).start();
  };
  const totalRX        = Animated.add(cardEntranceRX, cardHoverRX);
  const totalRXInterp  = totalRX.interpolate({ inputRange: [-16, 16], outputRange: ['-16deg', '16deg'] });
  const cardRYInterp   = cardHoverRY.interpolate({ inputRange: [-4, 4], outputRange: ['-4deg', '4deg'] });

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

  // ── Desktop Web ───────────────────────────────────────────────────────────
  if (isDesktopWeb) {
    const PX = [
      { top: 8,  left: 14, size: 2.5, op: 0.28 },
      { top: 22, left: 72, size: 2.0, op: 0.20 },
      { top: 45, left: 88, size: 3.0, op: 0.32 },
      { top: 60, left: 24, size: 2.0, op: 0.22 },
      { top: 35, left: 42, size: 3.5, op: 0.18 },
      { top: 12, left: 58, size: 2.0, op: 0.25 },
    ];
    return (
      <View style={split.root}>
        {/* Dark background */}
        <LinearGradient
          colors={['#020817', '#0b1224', '#180c06', '#020817']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        {/* CSS dot grid */}
        {Platform.OS === 'web' && (
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundImage: 'radial-gradient(rgba(232,185,35,0.07) 1px, transparent 1px)', backgroundSize: '48px 48px' } as any} />
        )}

        {/* Animated orbs */}
        <Animated.View style={[split.orbBlue,   { transform: [{ translateY: orb1Y }, { scale: orb1Scale }] }]} />
        <Animated.View style={[split.orbPurple,  { transform: [{ translateY: orb2Y }, { scale: orb2Scale }] }]} />
        <View style={split.orbAccent} />

        {/* Floating particles */}
        {PX.map((p, i) => (
          <Animated.View key={i} style={{
            position: 'absolute', width: p.size, height: p.size,
            borderRadius: p.size / 2, backgroundColor: '#E8B923',
            top: `${p.top}%` as any, left: `${p.left}%` as any,
            opacity: p.op,
            transform: [{ translateY: loginParticles[i] }],
          }} />
        ))}

        {/* LEFT pane */}
        <View style={split.leftPane}>
          <View style={split.brandRow}>
            <Image source={require('../../../assets/main-logo.png')} style={{ width: 220, height: 88 }} resizeMode="contain" />
          </View>

          <Animated.View style={[split.headlineWrap, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}>
            <Text style={split.headline}>
              Your Financial{'\n'}Documents,{'\n'}
              {Platform.OS === 'web' ? (
                <Text style={{ color: '#E8B923', ...({ backgroundImage: 'linear-gradient(135deg,#E8B923,#FFD700,#B5905B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as any) }}>
                  Secured.
                </Text>
              ) : (
                <Text style={{ color: '#E8B923' }}>Secured.</Text>
              )}
            </Text>
            <Text style={split.headlineSub}>
              The all-in-one portal to access, manage,{'\n'}and track all your important documents.
            </Text>
          </Animated.View>

          <View style={split.featureGrid}>
            {[
              { icon: 'document-text',    label: 'Document Hub',        sub: 'All your files, organized' },
              { icon: 'shield-checkmark', label: 'Bank-Level Security', sub: '256-bit SSL encryption' },
              { icon: 'flash',            label: 'Real-time Sync',      sub: 'Instant updates, always' },
              { icon: 'notifications',    label: 'Smart Alerts',        sub: 'Never miss a thing' },
            ].map((f, i) => (
              <Animated.View key={f.label} style={[split.featureCard, { opacity: featureAnims[i].opacity, transform: [{ translateY: featureAnims[i].y }] }]}>
                {/* gold top bar */}
                <LinearGradient colors={['#E8B923', '#B5905B', 'transparent']} style={split.featureTopBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                <LinearGradient colors={['rgba(232,185,35,0.09)', 'rgba(8,14,30,0.7)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <View style={split.featureCardInner}>
                  <LinearGradient colors={['#E8B923', '#B5905B']} style={split.featureCardIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Ionicons name={f.icon as any} size={16} color="#2C2320" />
                  </LinearGradient>
                  <Text style={split.featureCardLabel}>{f.label}</Text>
                  <Text style={split.featureCardSub}>{f.sub}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          <Text style={split.leftFooter}>Trusted · Secure · Real-time</Text>
        </View>

        {/* RIGHT pane: 3D interactive glass card */}
        <View style={split.rightPane}>
          <ScrollView contentContainerStyle={split.cardScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* glow ring */}
            <View style={split.cardGlowRing}>
              <Animated.View
                style={{
                  transform: [
                    { perspective: 1200 },
                    { rotateX: totalRXInterp },
                    { rotateY: cardRYInterp },
                    { scale: cardHoverScale },
                  ],
                }}
                {...(Platform.OS === 'web' ? { onMouseMove: handleCardMove, onMouseLeave: handleCardLeave } as any : {})}
              >
                <View style={split.glassCard}>
                  {/* shimmer top accent */}
                  <View style={[split.cardTopAccent, { overflow: 'hidden' as any }]}>
                    <LinearGradient colors={['#E8B923', '#B5905B']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                    <Animated.View style={{ position: 'absolute' as any, top: 0, bottom: 0, left: 0, width: 80, backgroundColor: 'rgba(255,255,255,0.45)', transform: [{ translateX: shimmerX }] }} />
                  </View>

                  <View style={split.cardHeader}>
                    <Text style={split.cardTitle}>Welcome Back</Text>
                    <Text style={split.cardSubtitle}>Sign in to continue to Finance Therapy Group</Text>
                  </View>

                  <View style={split.cardBody}>{loginForm}</View>

                  <Text style={split.cardNote}>Need help? Contact your administrator.</Text>
                </View>
              </Animated.View>
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
      {/* Full background */}
      <LinearGradient
        colors={['#020817', '#0b1224', '#180c06']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }, { scale: orb1Scale }] }]} />
      <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }, { scale: orb2Scale }] }]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 }]}>
          <Animated.View style={[styles.logoSection, { transform: [{ scale: logoScale }] }]}>
            <Image
              source={require('../../../assets/main-logo.png')}
              style={{ width: 220, height: 88, alignSelf: 'center', marginBottom: 4 }}
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
    backgroundColor: '#020817',
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
  orb1: { width: 320, height: 320, backgroundColor: 'rgba(232,185,35,0.07)', top: -100, right: -80 },
  orb2: { width: 220, height: 220, backgroundColor: 'rgba(181,144,91,0.06)', bottom: 60, left: -60 },
  logoSection: { alignItems: 'center', marginBottom: 20 },
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

  // Orbs — bigger and richer to match landing page
  orbBlue: {
    position: 'absolute',
    width: 800, height: 800, borderRadius: 400,
    backgroundColor: 'rgba(232,185,35,0.055)',
    top: -280, left: -220,
  },
  orbPurple: {
    position: 'absolute',
    width: 650, height: 650, borderRadius: 325,
    backgroundColor: 'rgba(181,144,91,0.05)',
    bottom: -180, left: 160,
  },
  orbAccent: {
    position: 'absolute',
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(232,185,35,0.03)',
    top: '40%' as any, right: 80,
  },

  // LEFT pane
  leftPane: {
    flex: 1,
    paddingHorizontal: 64,
    paddingVertical: 48,
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  headlineWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  headline: {
    color: '#ffffff',
    fontSize: 58,
    fontWeight: '800',
    lineHeight: 68,
    letterSpacing: -2,
    marginBottom: 20,
  },
  headlineAccent: { color: '#E8B923' },
  headlineSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 16,
    lineHeight: 26,
  },

  // Premium feature cards (match landing page style)
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
    backgroundColor: 'rgba(8,14,30,0.6)',
  },
  featureTopBar: { height: 3 },
  featureCardInner: { padding: 16, gap: 7 },
  featureCardIconBox: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  featureCardLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13, fontWeight: '700',
  },
  featureCardSub: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
  },
  leftFooter: {
    color: 'rgba(232,185,35,0.4)',
    fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase' as any,
  },

  // RIGHT pane
  rightPane: {
    width: 460,
    justifyContent: 'center',
    paddingVertical: 40,
    paddingRight: 52,
    paddingLeft: 8,
  },
  cardScroll: { flexGrow: 1, justifyContent: 'center' },

  // Glow ring wrapping the card
  cardGlowRing: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.25)',
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 48,
    elevation: 24,
  },

  // White glass card
  glassCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden' as any,
    shadowColor: '#E8B923',
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.18,
    shadowRadius: 64,
    elevation: 32,
  },
  cardTopAccent: { height: 4, width: '100%' },
  cardHeader: {
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 8,
  },
  cardTitle: {
    color: '#1C1713',
    fontSize: 26, fontWeight: '800',
    letterSpacing: -0.5, marginBottom: 6,
  },
  cardSubtitle: { color: '#A8998A', fontSize: 14 },
  cardBody: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 8,
  },
  cardNote: {
    color: '#A8998A', fontSize: 11,
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
