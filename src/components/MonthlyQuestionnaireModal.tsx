import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { BankAccountsField, cleanBankAccounts } from './BankAccountsField';
import { uploadDocumentToStorage } from '../db/documents';
import { removeBankAccounts } from '../db/profiles';
import { formatMonthLabel } from '../db/requirements';
import type { BankAccount } from '../db/requirements';
import {
  QUESTIONS, Answer, Answers, Question, emptyAnswers, isAnswerComplete,
  unfinishedQuestions, getQuestionnaire, saveQuestionnaire, AnswerFile,
} from '../db/questionnaire';

// The monthly questionnaire, asked before a bookkeeping or CFO client starts
// uploading for the month.
//
// Every question is yes or no. NO is finished on its own; YES opens up whatever
// that question needs, and the questionnaire is not submitted until each YES
// has it. Answering yes by mistake is therefore not a trap — change it to no,
// or save and come back when the document is to hand.

export function MonthlyQuestionnaireModal({
  visible, month, onClose, onSubmitted,
}: {
  visible: boolean;
  /** 'YYYY-MM' */
  month: string;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const { user, refreshProfile } = useAuth();
  const email = user?.email ?? '';

  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    if (!visible || !email) return;
    let live = true;
    setLoading(true);
    setShowMissing(false);
    getQuestionnaire(email, month).then(row => {
      if (!live) return;
      // Merge onto the empty set so a question added since they last saved
      // appears unanswered rather than missing.
      setAnswers({ ...emptyAnswers(), ...(row?.answers ?? {}) });
      setLoading(false);
    });
    return () => { live = false; };
  }, [visible, email, month]);

  const setAnswer = useCallback((key: string, patch: Partial<Answer>) => {
    setAnswers(a => ({ ...a, [key]: { ...a[key], ...patch } }));
  }, []);

  // Switching to NO clears what YES had gathered, so a stale explanation is
  // never submitted alongside a "no".
  const setValue = (key: string, value: 'yes' | 'no') =>
    setAnswers(a => ({
      ...a,
      [key]: value === 'no'
        ? { value: 'no' }
        : { ...a[key], value: 'yes' },
    }));

  const pickFiles = async (key: string) => {
    const r = await DocumentPicker.getDocumentAsync({
      type: '*/*', copyToCacheDirectory: true, multiple: true,
    });
    if (r.canceled || !r.assets?.length || !user?.id) return;
    setUploadingKey(key);
    const uploaded: AnswerFile[] = [];
    for (const f of r.assets) {
      const url = await uploadDocumentToStorage(
        user.id, 'questionnaire', f.uri, f.name, f.mimeType ?? 'application/octet-stream',
      );
      if (url) uploaded.push({ name: f.name, url });
    }
    setUploadingKey(null);
    if (uploaded.length) {
      setAnswer(key, { files: [...(answers[key]?.files ?? []), ...uploaded] });
    }
  };

  const removeFile = (key: string, url: string) =>
    setAnswer(key, { files: (answers[key]?.files ?? []).filter(f => f.url !== url) });

  const missing = unfinishedQuestions(answers);
  const answeredCount = QUESTIONS.length - missing.length;

  const save = async (status: 'in_progress' | 'submitted') => {
    if (status === 'submitted' && missing.length > 0) { setShowMissing(true); return; }
    setBusy(status === 'submitted' ? 'submit' : 'save');
    const row = await saveQuestionnaire(email, month, answers, status);
    if (!row) { setBusy(null); return; }    // the db module already logged why

    // Accounts they have told us are closed come off their list, so next month
    // does not ask for statements on an account that no longer exists. Only on
    // submit: a saved draft is not their final answer.
    if (status === 'submitted') {
      const closed = answers.closed_accounts?.value === 'yes'
        ? (answers.closed_accounts.closed ?? [])
        : [];
      if (closed.length && user?.id) {
        await removeBankAccounts(user.id, closed);
        await refreshProfile();
      }
    }

    setBusy(null);
    if (status === 'submitted') onSubmitted?.();
    onClose();
  };

  const myAccounts: BankAccount[] = user?.bankAccounts ?? [];

  const followUp = (q: Question) => {
    const a = answers[q.key] ?? { value: null };
    if (a.value !== 'yes') return null;

    return (
      <View style={s.followUp}>
        {q.prompt ? <Text style={s.prompt}>{q.prompt}</Text> : null}

        {(q.followUp === 'short_text' || q.followUp === 'long_text') && (
          <TextInput
            style={[s.input, q.followUp === 'long_text' && s.inputTall]}
            value={a.text ?? ''}
            onChangeText={t => setAnswer(q.key, { text: t })}
            placeholder={q.followUp === 'long_text' ? 'Type your explanation…' : 'A short description…'}
            placeholderTextColor={Colors.textMuted}
            multiline
          />
        )}

        {q.followUp === 'bank_accounts' && (
          <BankAccountsField
            value={a.accounts ?? []}
            onChange={accounts => setAnswer(q.key, { accounts })}
          />
        )}

        {q.followUp === 'closed_accounts' && (
          myAccounts.length === 0 ? (
            <Text style={s.note}>
              There are no accounts on your profile yet. Tell us which one closed in the
              last question, or ask us to add it first.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={s.note}>
                Anything you tick here comes off your list, so we stop asking for
                its statements next month.
              </Text>
              {myAccounts.map(acc => {
                const on = (a.closed ?? []).includes(acc.id);
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[s.pick, on && s.pickOn]}
                    onPress={() => {
                      const closed = on
                        ? (a.closed ?? []).filter(id => id !== acc.id)
                        : [...(a.closed ?? []), acc.id];
                      // Keep the names alongside the ids: the account is about
                      // to leave their profile, and an id alone reads as noise.
                      setAnswer(q.key, {
                        closed,
                        closedAccounts: myAccounts.filter(x => closed.includes(x.id)),
                      });
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={19}
                      color={on ? Colors.primary : Colors.textMuted}
                    />
                    <Text style={[s.pickText, on && s.pickTextOn]}>
                      {acc.bank} · end {acc.last4}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        )}

        {q.followUp === 'upload' && (
          <View style={{ gap: 8 }}>
            {(a.files ?? []).map(f => (
              <View key={f.url} style={s.file}>
                <Ionicons name="document-text-outline" size={16} color={Colors.primaryDark} />
                <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
                <TouchableOpacity
                  onPress={() => removeFile(q.key, f.url)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={s.upload}
              onPress={() => pickFiles(q.key)}
              disabled={uploadingKey === q.key}
              activeOpacity={0.85}
            >
              {uploadingKey === q.key
                ? <ActivityIndicator color={Colors.primaryDeep} size="small" />
                : <>
                    <Ionicons name="cloud-upload-outline" size={16} color={Colors.primaryDeep} />
                    <Text style={s.uploadText}>
                      {(a.files ?? []).length ? 'Add another file' : 'Choose files'}
                    </Text>
                  </>}
            </TouchableOpacity>
            {(a.files ?? []).length === 0 && (
              <Text style={s.note}>
                A document is needed here. If you have nothing to upload, change your
                answer to No — or save and come back when you have it.
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <LinearGradient
            colors={['#3A3131', '#4A3E3E', '#3A3131']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.head}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.title}>Monthly questionnaire</Text>
              <Text style={s.sub}>
                {formatMonthLabel(month)} · {answeredCount} of {QUESTIONS.length} done
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </LinearGradient>

          {loading ? (
            <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
          ) : (
            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              <Text style={s.intro}>
                A few questions before you upload this month. They tell us what to look
                for in your books, so nothing is missed or miscoded.
              </Text>

              {showMissing && missing.length > 0 && (
                <View style={s.missing}>
                  <Ionicons name="alert-circle-outline" size={15} color="#B45309" />
                  <Text style={s.missingText}>
                    {missing.length} question{missing.length === 1 ? '' : 's'} still
                    need{missing.length === 1 ? 's' : ''} an answer. They are marked below.
                  </Text>
                </View>
              )}

              {QUESTIONS.map((q, i) => {
                const a = answers[q.key] ?? { value: null };
                const incomplete = showMissing && !isAnswerComplete(q, a);
                return (
                  <View key={q.key} style={[s.q, incomplete && s.qMissing]}>
                    <Text style={s.qText}>
                      <Text style={s.qNum}>{i + 1}. </Text>{q.text}
                    </Text>
                    <View style={s.yesno}>
                      {(['yes', 'no'] as const).map(v => {
                        const on = a.value === v;
                        return (
                          <TouchableOpacity
                            key={v}
                            style={[s.choice, on && (v === 'yes' ? s.choiceYes : s.choiceNo)]}
                            onPress={() => setValue(q.key, v)}
                            activeOpacity={0.85}
                          >
                            <Text style={[s.choiceText, on && s.choiceTextOn]}>
                              {v === 'yes' ? 'Yes' : 'No'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {followUp(q)}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={s.foot}>
            <TouchableOpacity
              style={s.saveBtn}
              onPress={() => save('in_progress')}
              disabled={busy != null}
              activeOpacity={0.85}
            >
              {busy === 'save'
                ? <ActivityIndicator color={Colors.textSecondary} size="small" />
                : <Text style={s.saveText}>Save for later</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, missing.length > 0 && s.submitOff]}
              onPress={() => save('submitted')}
              disabled={busy != null}
              activeOpacity={0.85}
            >
              {busy === 'submit'
                ? <ActivityIndicator color={Colors.primaryDeep} size="small" />
                : <>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primaryDeep} />
                    <Text style={s.submitText}>Submit</Text>
                  </>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgDeep, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: '92%', overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 18 },
  title: { color: Colors.white, fontSize: 18, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3 },
  center: { paddingVertical: 60, alignItems: 'center' },
  body: { padding: 16, gap: 12 },
  intro: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 19 },

  missing: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FDF8EC', borderWidth: 1, borderColor: '#F0E2C0',
    borderRadius: 12, padding: 12,
  },
  missingText: { flex: 1, fontSize: 12, color: '#8A6D3B', lineHeight: 17 },

  q: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, padding: 14, gap: 10,
  },
  qMissing: { borderColor: '#E8B923', backgroundColor: '#FFFDF7' },
  qText: { fontSize: 13.5, color: Colors.textPrimary, lineHeight: 20 },
  qNum: { fontWeight: '800', color: Colors.primaryDark },

  yesno: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgDeep,
  },
  choiceYes: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  choiceNo: { backgroundColor: Colors.bgMid, borderColor: Colors.primaryDark },
  choiceText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  choiceTextOn: { color: Colors.primaryDeep },

  followUp: { gap: 8, paddingTop: 2 },
  prompt: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.3 },
  input: {
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgDeep,
    borderRadius: 12, padding: 12, fontSize: 13, color: Colors.textPrimary,
    minHeight: 44, textAlignVertical: 'top',
  },
  inputTall: { minHeight: 90 },
  note: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 17 },

  pick: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgDeep,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11,
  },
  pickOn: { borderColor: Colors.primary, backgroundColor: '#FDF8EC' },
  pickText: { fontSize: 13, color: Colors.textSecondary },
  pickTextOn: { color: Colors.textPrimary, fontWeight: '700' },

  file: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.bgDeep,
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9,
  },
  fileName: { flex: 1, fontSize: 12.5, color: Colors.textPrimary },
  upload: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: Colors.primary, borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 12, backgroundColor: '#FDF8EC',
  },
  uploadText: { fontSize: 12.5, fontWeight: '800', color: Colors.primaryDeep },

  foot: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  saveBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  saveText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  submitBtn: {
    flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.primary,
  },
  submitOff: { opacity: 0.55 },
  submitText: { fontSize: 13, fontWeight: '800', color: Colors.primaryDeep },
});
