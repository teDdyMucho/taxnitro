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

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.bgDeep, Colors.bgDark, Colors.bgDeep]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={[styles.orb, styles.orb1]} />
      <View style={[styles.orb, styles.orb2]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.logoSection, { transform: [{ scale: logoScale }] }]}>
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDark]}
                style={styles.logoGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.logoIcon}>⚡</Text>
              </LinearGradient>
            </View>
            <Text style={styles.appName}>Finance Therapy Group</Text>
            <Text style={styles.appTagline}>Your document portal</Text>
          </Animated.View>

          <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
            <Text style={styles.cardTitle}>Welcome back</Text>
            <Text style={styles.cardSubtitle}>Sign in to access your documents</Text>

            <View style={styles.form}>
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
                style={styles.loginBtn}
              />

              {biometricAvailable && (
                <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin} disabled={signingIn}>
                  <Ionicons name="finger-print-outline" size={22} color={Colors.primary} />
                  <Text style={styles.biometricText}>Sign in with Biometrics</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.registerLink} onPress={onNavigateRegister}>
              <Text style={styles.registerLinkText}>
                Don't have an account?{' '}
                <Text style={styles.registerLinkAccent}>Create Account</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <Text style={styles.footerText}>
            Secured by Finance Therapy Group · 256-bit SSL encryption
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    backgroundColor: Colors.bgDeep,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: 'rgba(37,99,235,0.08)',
    top: -100,
    right: -80,
  },
  orb2: {
    width: 200,
    height: 200,
    backgroundColor: 'rgba(124,58,237,0.06)',
    bottom: 100,
    left: -60,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 14,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  logoGradient: {
    width: 70,
    height: 70,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 34,
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  appTagline: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  cardSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    marginBottom: 28,
  },
  form: {
    gap: 0,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 4,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rememberText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  forgotText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  errorBannerText: {
    color: Colors.error,
    fontSize: 13,
    textAlign: 'center',
  },
  loginBtn: {
    marginTop: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.3)',
    backgroundColor: 'rgba(37,99,235,0.08)',
  },
  biometricText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  registerLink: {
    alignItems: 'center',
  },
  registerLinkText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  registerLinkAccent: {
    color: Colors.primary,
    fontWeight: '700',
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 32,
    opacity: 0.7,
  },
});

const forgotStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(37,99,235,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconEmoji: { fontSize: 28 },
  title: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emailHighlight: {
    color: '#f1f5f9',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f1f5f9',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  cancelText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
