import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { openedFromInvite } from '../../lib/supabase';
import { emailAboutClientAction } from '../../lib/uploadEmail';

// After a password-reset link. The link signs the person in; here they choose
// the new password before reaching their portal. Forgot Password used to send
// them to an app address nothing answered (database/SOP-GAPS.md, item 3).
// An invite is the same link, and is greeted as a welcome instead.

function Field({ label, value, onChange, show, onToggle, onSubmit }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle?: () => void;
  onSubmit?: () => void;
}) {
  return (
    <View style={st.field}>
      <Text style={st.label}>{label}</Text>
      <View style={st.inputRow}>
        <Ionicons name="lock-closed-outline" size={16} color="#A8998A" />
        <TextInput
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="At least 8 characters"
          placeholderTextColor="#A8998A"
          onSubmitEditing={onSubmit}
          style={[st.input, { outlineWidth: 0 } as any]}
        />
        {onToggle && (
          <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color="#A8998A" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function SetPasswordScreen() {
  const { finishRecovery, logout, user } = useAuth();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    if (password.length < 8) { setProblem('Use at least 8 characters.'); return; }
    if (password !== again) { setProblem('The two passwords do not match.'); return; }
    setBusy(true);
    setProblem(null);
    const r = await finishRecovery(password);
    setBusy(false);
    if (!r.success) { setProblem(r.error ?? 'It could not be saved. Please try again.'); return; }
    // FTG hears a client is in: an invite taken up, or a password reset.
    if (user?.role === 'client') {
      void emailAboutClientAction({
        kind: 'account',
        clientEmail: user.email,
        clientName: user.name,
        change: openedFromInvite ? 'accepted their invite and set a password' : 'set a new password with Forgot Password',
      });
    }
    // The invite's ?welcome=1 has done its job; a reload should not repeat it.
    if (typeof window !== 'undefined' && window.location?.search) window.history.replaceState(null, '', window.location.pathname);
  };

  return (
    <View style={st.root}>
      <View style={st.card}>
        <LinearGradient colors={['rgba(232,185,35,0.18)', 'rgba(181,144,91,0.10)']} style={st.iconWrap} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Ionicons name="key-outline" size={28} color="#E8B923" />
        </LinearGradient>
        <Text style={st.title}>{openedFromInvite ? 'Welcome to Finance Therapy Group' : 'Choose a new password'}</Text>
        <Text style={st.sub}>
          {user?.email && user.email !== '' ? `For ${user.email}. ` : ''}
          {openedFromInvite
            ? 'Choose a password for your portal. From now on you sign in with your email and this password.'
            : 'You opened a password reset link. Pick a new password to finish signing in.'}
        </Text>

        <Field label="New password" value={password} onChange={setPassword} show={show} onToggle={() => setShow(s => !s)} />
        <Field label="Type it again" value={again} onChange={setAgain} show={show} onSubmit={save} />

        {!!problem && <Text style={st.problem}>{problem}</Text>}

        <TouchableOpacity style={[st.btn, busy && { opacity: 0.6 }]} onPress={save} disabled={busy} activeOpacity={0.85}>
          {busy
            ? <ActivityIndicator color="#3A3131" size="small" />
            : <><Ionicons name="checkmark-circle-outline" size={16} color="#3A3131" /><Text style={st.btnText}>{openedFromInvite ? 'Save password' : 'Save new password'}</Text></>}
        </TouchableOpacity>
        <TouchableOpacity style={st.quiet} onPress={logout} disabled={busy} activeOpacity={0.85}>
          <Text style={st.quietText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2C2320', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28,
    width: '100%', maxWidth: 400, alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#E8E0D0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 30, elevation: 18,
  },
  iconWrap: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  title: { color: '#1C1713', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#6B5E52', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 6 },
  field: { width: '100%', gap: 6 },
  label: { color: '#6B5E52', fontSize: 12, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 12, borderWidth: 1, borderColor: '#E8E0D0', backgroundColor: '#FAFAF8',
  },
  input: { flex: 1, fontSize: 14, color: '#1C1713' },
  problem: { color: '#DC2626', fontSize: 13, textAlign: 'center' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#E8B923', borderRadius: 14, paddingVertical: 14, width: '100%', marginTop: 8,
  },
  btnText: { color: '#3A3131', fontWeight: '800', fontSize: 14 },
  quiet: { alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 12, width: '100%' },
  quietText: { color: '#6B5E52', fontWeight: '700', fontSize: 14 },
});
