import { nativeDriver } from '../../constants/platform';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { InputField } from '../../components/InputField';
import { Button } from '../../components/Button';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  onRegisterSuccess: () => void;
  onNavigateLogin: () => void;
}

export function RegisterScreen({ onRegisterSuccess, onNavigateLogin }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);

  const { register, isLoading, error: authError } = useAuth();
  const insets = useSafeAreaInsets();

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: nativeDriver }),
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: nativeDriver }),
    ]).start();
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!fullName || fullName.trim().length < 2) newErrors.fullName = 'Please enter your full name.';
    if (!email || !email.includes('@')) newErrors.email = 'Please enter a valid email address.';
    if (!password || password.length < 8) newErrors.password = 'Password must be at least 8 characters.';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match.';
    if (!agreeTerms) newErrors.terms = 'You must agree to the terms to continue.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    const result = await register(fullName, email, password);
    if (result.success) {
      if (result.needsConfirmation) {
        setConfirmed(true); // show confirmation message
      }
      // if no confirmation needed, onAuthStateChange handles navigation automatically
    }
  };

  const strengthLevel = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const strengthColors = ['', Colors.error, Colors.notViewed, Colors.viewed, Colors.viewed];
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  const animStyle = { opacity, transform: [{ translateY }] };

  if (confirmed) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <LinearGradient
          colors={[Colors.bgDeep, Colors.bgDark, Colors.bgDeep]}
          style={StyleSheet.absoluteFillObject}
        />
        <Ionicons name="mail-outline" size={64} color={Colors.primary} />
        <Text style={[styles.title, { marginTop: 24, textAlign: 'center' }]}>Check your email</Text>
        <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 10 }]}>
          We sent a confirmation link to{'\n'}
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>{email}</Text>
          {'\n\n'}Click the link to activate your account, then sign in.
        </Text>
        <TouchableOpacity
          style={[styles.backBtn, { marginTop: 32, width: '100%', alignItems: 'center', justifyContent: 'center' }]}
          onPress={onNavigateLogin}
        >
          <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 15 }}>Go to Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={onNavigateLogin}>
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>

          <Animated.View style={[styles.header, animStyle]}>
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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join Finance Therapy Group to manage your documents</Text>
          </Animated.View>

          <Animated.View style={[styles.card, animStyle]}>
            <InputField
              label="Full Name"
              placeholder="Marcus Johnson"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              leftIcon="person-outline"
              error={errors.fullName}
            />
            <InputField
              label="Email Address"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon="mail-outline"
              error={errors.email}
            />
            <InputField
              label="Password"
              placeholder="Create a strong password"
              value={password}
              onChangeText={setPassword}
              isPassword
              leftIcon="lock-closed-outline"
              error={errors.password}
            />

            {password.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBars}>
                  {[1, 2, 3, 4].map(i => (
                    <View
                      key={i}
                      style={[
                        styles.strengthBar,
                        { backgroundColor: i <= strengthLevel ? strengthColors[strengthLevel] : Colors.bgElevated },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: strengthColors[strengthLevel] }]}>
                  {strengthLabels[strengthLevel]}
                </Text>
              </View>
            )}

            <InputField
              label="Confirm Password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              isPassword
              leftIcon="shield-checkmark-outline"
              error={errors.confirmPassword}
            />

            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setAgreeTerms(!agreeTerms)}
            >
              <View style={[styles.checkbox, agreeTerms && styles.checkboxActive]}>
                {agreeTerms && <Ionicons name="checkmark" size={14} color={Colors.white} />}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.termsLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>
            {errors.terms && <Text style={styles.errorText}>{errors.terms}</Text>}

            {authError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{authError}</Text>
              </View>
            )}

            <Button
              title="Create Account"
              onPress={handleRegister}
              loading={isLoading}
              fullWidth
              size="lg"
              style={styles.submitBtn}
            />
          </Animated.View>

          <TouchableOpacity style={styles.loginLink} onPress={onNavigateLogin}>
            <Text style={styles.loginLinkText}>
              Already have an account?{' '}
              <Text style={styles.loginLinkAccent}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  orb: { position: 'absolute', borderRadius: 999 },
  orb1: { width: 280, height: 280, backgroundColor: 'rgba(37,99,235,0.07)', top: -80, left: -80 },
  orb2: { width: 180, height: 180, backgroundColor: 'rgba(124,58,237,0.06)', bottom: 80, right: -40 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  header: { alignItems: 'center', marginBottom: 28 },
  logoContainer: {
    marginBottom: 14,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  logoGradient: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: { fontSize: 28 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 14, marginTop: 6 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '600', width: 40, textAlign: 'right' },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  termsText: { color: Colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 20 },
  termsLink: { color: Colors.primary, fontWeight: '600' },
  errorText: { color: Colors.error, fontSize: 12, marginBottom: 12, marginLeft: 4 },
  submitBtn: {
    marginTop: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  loginLink: { alignItems: 'center', marginTop: 24 },
  loginLinkText: { color: Colors.textSecondary, fontSize: 14 },
  loginLinkAccent: { color: Colors.primary, fontWeight: '700' },
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  errorBannerText: { color: Colors.error, fontSize: 13, textAlign: 'center' },
});
