import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { supabase } from '../../lib/supabase';
import { emailAboutClientAction } from '../../lib/uploadEmail';
import { ClientUploadModal } from '../../components/ClientUploadModal';
import {
  TAX_SEASON, TAX_SECTIONS, TAX_QUESTIONS, TAX_STEPS,
  taxYearOf, taxQuestionText, taxDocLabel, taxChecklist, taxDocState, taxStepsDone, currentTaxStep,
  isTaxAnswerComplete, unansweredTaxQuestions, canConfirmTaxDocs,
  getTaxOnboarding, saveTaxOnboarding, getTaxSlots, unreviewedFiles,
  type TaxOnboarding, type TaxAnswers, type TaxAnswer, type TaxDoc, type TaxDocState,
  type TaxQuestion, type TaxStepKey, type TaxSlot,
} from '../../db/taxOnboarding';

// The client's tax onboarding for the season: three steps on one page, with a
// progress bar. Camaree: "make a custom onboarding experience for each client"
// and "all tax clients in the 2027 season can have the same onboarding process
// (as if they were new)".
//
//   1. Welcome                 what the season looks like, in the portal
//   2. Tell us about your year the tax questionnaire (a draft, for now)
//   3. Upload your documents   a checklist built from their answers
//
// The page is the client's own: what it reads and writes is theirs, by the
// rules in database/tax_onboarding.sql. FTG accepts or sends back each upload
// where it accepts any other (Approve / Decline on the file), and the checklist
// follows, because each document's slot is in document_requirements.
//
// Split in two: TaxOnboardingScreen loads and saves; TaxOnboardingView only
// draws what it is given, so each state can be looked at without an account.

const STATE_LOOK: Record<TaxDocState, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  needed:    { label: 'To upload',                 icon: 'cloud-upload-outline',   color: '#B5905B', bg: 'rgba(181,144,91,0.12)' },
  sent:      { label: 'Sent · in review',          icon: 'time-outline',           color: '#B7791F', bg: 'rgba(232,185,35,0.16)' },
  resent:    { label: 'Sent again · in review',    icon: 'time-outline',           color: '#B7791F', bg: 'rgba(232,185,35,0.16)' },
  accepted:  { label: 'Accepted',                  icon: 'checkmark-circle',       color: Colors.viewed, bg: 'rgba(22,163,74,0.12)' },
  sent_back: { label: 'Sent back: please upload a new one', icon: 'refresh-circle-outline', color: Colors.error, bg: 'rgba(220,38,38,0.10)' },
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ── The screen: loading and saving ───────────────────────────────────────────

export function TaxOnboardingScreen({ onBack, backLabel }: {
  /** Where the back link goes; without one there is no back link. */
  onBack?: () => void;
  backLabel?: string;
}) {
  const { user } = useAuth();
  const email = user?.email ?? '';
  const season = TAX_SEASON;

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const [row, setRow] = useState<TaxOnboarding | null>(null);
  const [slots, setSlots] = useState<TaxSlot[]>([]);
  const [unreviewed, setUnreviewed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [uploadFor, setUploadFor] = useState<TaxDoc | null>(null);

  const load = useCallback(async () => {
    if (!email) return;
    const [r, sl] = await Promise.all([getTaxOnboarding(email, season), getTaxSlots(email, season)]);
    const unrev = await unreviewedFiles(sl);
    if (!mounted.current) return;
    setRow(r);
    setSlots(sl);
    setUnreviewed(unrev);
    setLoading(false);
  }, [email, season]);

  useEffect(() => { load(); }, [load]);

  // FTG accepting or sending back a document moves its slot; read again.
  useEffect(() => {
    if (!email) return;
    const ch = supabase.channel(`tax_onboarding:${email}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_requirements', filter: `client_email=eq.${email}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [email, load]);

  const stateOf = useCallback((key: string): TaxDocState => {
    const slot = slots.find(sl => sl.requirement_key === key);
    return taxDocState(slot?.status, !!slot?.document_id && unreviewed.has(slot.document_id));
  }, [slots, unreviewed]);

  const docStates = useMemo(
    () => Object.fromEntries(taxChecklist(row?.answers ?? {}).map(d => [d.key, stateOf(d.key)])),
    [row?.answers, stateOf],
  );

  // The upload sheet's one document, the same object while it stays open.
  const taxItem = useMemo(() => (uploadFor ? {
    key: uploadFor.key,
    label: taxDocLabel(uploadFor, season),
    folder: uploadFor.folder,
    season,
  } : null), [uploadFor, season]);

  const tellFtg = (change: string) => void emailAboutClientAction({
    kind: 'account', clientEmail: email, clientName: user?.name ?? null, change,
  });

  const onWelcome = async () => {
    const saved = await saveTaxOnboarding(email, season, { welcomed_at: new Date().toISOString() });
    if (saved && mounted.current) setRow(saved);
    return !!saved;
  };

  const onSaveAnswers = async (answers: TaxAnswers, submit: boolean) => {
    const wasSent = row?.status === 'submitted';
    const patch: Parameters<typeof saveTaxOnboarding>[2] = submit
      ? { answers, status: 'submitted', submitted_at: new Date().toISOString() }
      : { answers, status: 'in_progress' };
    // A changed answer can ask for a document they have not sent. Then they
    // are not done after all, and the step opens again.
    if (submit && row?.docs_confirmed_at
      && taxChecklist(answers).some(d => stateOf(d.key) === 'needed')) {
      patch.docs_confirmed_at = null;
    }
    const saved = await saveTaxOnboarding(email, season, patch);
    if (!saved) return false;
    if (mounted.current) setRow(saved);
    if (submit) {
      tellFtg(wasSent
        ? `changed their answers to the ${season} tax questionnaire`
        : `sent their ${season} tax questionnaire`);
    }
    return true;
  };

  const onConfirmDocs = async () => {
    const saved = await saveTaxOnboarding(email, season, { docs_confirmed_at: new Date().toISOString() });
    if (!saved) return false;
    if (mounted.current) setRow(saved);
    tellFtg(`sent all their documents for the ${season} tax season`);
    return true;
  };

  return (
    <>
      <TaxOnboardingView
        firstName={user?.name?.split(' ')[0] || 'there'}
        season={season}
        row={row}
        docStates={docStates}
        loading={loading && !!email}
        onBack={onBack}
        backLabel={backLabel}
        onWelcome={onWelcome}
        onSaveAnswers={onSaveAnswers}
        onConfirmDocs={onConfirmDocs}
        onUpload={setUploadFor}
      />
      <ClientUploadModal
        visible={!!uploadFor}
        onClose={() => { setUploadFor(null); load(); }}
        taxItem={taxItem}
      />
    </>
  );
}

// ── The view: what each step draws ───────────────────────────────────────────

export interface TaxOnboardingViewProps {
  firstName: string;
  season: string;
  row: TaxOnboarding | null;
  /** Where each checklist document stands, by its key. */
  docStates: Record<string, TaxDocState>;
  loading: boolean;
  onBack?: () => void;
  backLabel?: string;
  /** Each resolves true once saved; false leaves the step as it was. */
  onWelcome: () => Promise<boolean>;
  onSaveAnswers: (answers: TaxAnswers, submit: boolean) => Promise<boolean>;
  onConfirmDocs: () => Promise<boolean>;
  onUpload: (doc: TaxDoc) => void;
}

export function TaxOnboardingView(props: TaxOnboardingViewProps) {
  const { firstName, season, row, docStates, loading, onBack, backLabel } = props;
  const insets = useSafeAreaInsets();
  const { width } = useResponsive();
  const phone = width < 768;
  const year = taxYearOf(season);

  const done = taxStepsDone(row);
  const current = currentTaxStep(row);
  const doneCount = TAX_STEPS.filter(st => done[st.key]).length;

  // The step being looked at: the current one, until they open another. With
  // every step done, the last, where their documents and "all set" are.
  const landing = current ?? TAX_STEPS[TAX_STEPS.length - 1].key;
  const [open, setOpen] = useState<TaxStepKey | null>(landing);
  const lastLanding = useRef(landing);
  useEffect(() => {
    // Finishing a step moves on to the next.
    if (lastLanding.current !== landing) { setOpen(landing); lastLanding.current = landing; }
  }, [landing]);

  const reachable = (key: TaxStepKey) => done[key] || key === current;

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 48 : insets.bottom + 96 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={['#3A3131', '#4A3E3E', '#3A3131']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[s.hero, phone && s.heroPhone, { paddingTop: Platform.OS === 'web' ? 22 : insets.top + 16 }]}
        >
          {onBack && (
            <TouchableOpacity style={s.back} onPress={onBack} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={15} color="rgba(255,255,255,0.75)" />
              <Text style={s.backText}>{backLabel ?? 'Back'}</Text>
            </TouchableOpacity>
          )}
          <Text style={s.kicker}>{season} TAX SEASON</Text>
          <Text style={s.heroTitle}>Your tax onboarding</Text>
          <Text style={s.heroSub}>
            For your {year} return. {TAX_STEPS.length} short steps, all in one place.
          </Text>
          <View style={s.heroProgress}>
            <View style={[s.track, s.heroTrack]}>
              <View style={[s.fill, { width: `${(doneCount / TAX_STEPS.length) * 100}%` as any }]} />
            </View>
            <Text style={s.heroCount}>
              {doneCount === TAX_STEPS.length ? 'All steps done' : `${doneCount} of ${TAX_STEPS.length} steps done`}
            </Text>
          </View>
        </LinearGradient>

        <View style={[s.body, phone && s.bodyPhone]}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ paddingVertical: 48 }} />
          ) : TAX_STEPS.map((step, i) => {
            const isDone = done[step.key];
            const isNow = step.key === current;
            const canOpen = reachable(step.key);
            const isOpen = canOpen && open === step.key;
            return (
              <View key={step.key} style={[s.step, isOpen && s.stepOpen, !canOpen && s.stepLocked]}>
                <TouchableOpacity
                  style={s.stepHead}
                  onPress={() => setOpen(isOpen ? null : step.key)}
                  disabled={!canOpen}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen, disabled: !canOpen }}
                >
                  <View style={[s.num, isDone && s.numDone, isNow && s.numNow]}>
                    {isDone
                      ? <Ionicons name="checkmark" size={16} color={Colors.white} />
                      : <Text style={[s.numText, isNow && s.numTextNow]}>{i + 1}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.stepTitle, !canOpen && { color: Colors.textMuted }]}>{step.title}</Text>
                    <Text style={s.stepSub} numberOfLines={2}>{stepSummary(step.key, props)}</Text>
                  </View>
                  {isDone ? (
                    <View style={[s.chip, s.chipDone]}><Text style={[s.chipText, { color: Colors.viewed }]}>Done</Text></View>
                  ) : isNow ? (
                    <View style={[s.chip, s.chipNow]}><Text style={[s.chipText, { color: '#3A3131' }]}>Now</Text></View>
                  ) : (
                    <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
                  )}
                  {canOpen && (
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
                {/* Hidden rather than taken away when closed, so answers not yet
                    saved are still there when the step is opened again. */}
                {canOpen && (
                  <View style={[s.stepBody, !isOpen && { display: 'none' }]}>
                    {step.key === 'welcome' && (
                      <WelcomeStep firstName={firstName} season={season} done={isDone} onWelcome={props.onWelcome} />
                    )}
                    {step.key === 'questions' && (
                      <QuestionsStep season={season} row={row} onSave={props.onSaveAnswers} phone={phone} />
                    )}
                    {step.key === 'documents' && (
                      <DocumentsStep
                        season={season} row={row} docStates={docStates} phone={phone}
                        onUpload={props.onUpload} onConfirm={props.onConfirmDocs}
                      />
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** The line under a step's title: what it is, or how it went. */
function stepSummary(key: TaxStepKey, { row, docStates, season }: TaxOnboardingViewProps): string {
  const base = TAX_STEPS.find(st => st.key === key)!.sub;
  if (key === 'welcome' && row?.welcomed_at) return `Started ${fmtDate(row.welcomed_at)}`;
  if (key === 'questions' && row?.status === 'submitted') return `Sent ${fmtDate(row.submitted_at)}`;
  if (key === 'documents' && row?.status === 'submitted') {
    const states = taxChecklist(row.answers).map(d => docStates[d.key] ?? 'needed');
    const sent = states.filter(st => st !== 'needed').length;
    if (row.docs_confirmed_at) return `All sent ${fmtDate(row.docs_confirmed_at)} · we're reviewing them`;
    return `${sent} of ${plural(states.length, 'document')} sent`;
  }
  return key === 'questions' ? `${base} for ${taxYearOf(season)}` : base;
}

// ── Step 1: welcome ──────────────────────────────────────────────────────────

function WelcomeStep({ firstName, season, done, onWelcome }: {
  firstName: string; season: string; done: boolean; onWelcome: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const year = taxYearOf(season);
  const start = async () => {
    setBusy(true); setFailed(false);
    const ok = await onWelcome();
    setBusy(false);
    if (!ok) setFailed(true);
  };
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.lead}>Hi {firstName}, welcome to the {season} tax season.</Text>
      <Text style={s.para}>
        This year everything happens here, in your FTG portal: no separate forms by text and email.
      </Text>
      <View style={{ gap: 9 }}>
        <Bullet icon="chatbubbles-outline" text={`Answer a few yes-or-no questions about your ${year}.`} />
        <Bullet icon="cloud-upload-outline" text="Upload only the documents your answers call for." />
        <Bullet icon="shield-checkmark-outline" text="We review everything and tell you if anything is missing." />
      </View>
      <View style={s.tip}>
        <Ionicons name="bulb-outline" size={15} color={Colors.primaryDark} />
        <Text style={s.tipText}>
          Have these handy: your photo ID, and the W-2s, 1099s and other tax forms you've received.
        </Text>
      </View>
      {!done && (
        <PrimaryButton title="Let's get started" icon="arrow-forward" busy={busy} onPress={start} />
      )}
      {failed && <Text style={s.error}>That didn't save. Check your connection and try again.</Text>}
    </View>
  );
}

// ── Step 2: the questions ────────────────────────────────────────────────────

function QuestionsStep({ season, row, onSave, phone }: {
  season: string;
  row: TaxOnboarding | null;
  onSave: (answers: TaxAnswers, submit: boolean) => Promise<boolean>;
  phone: boolean;
}) {
  const sent = row?.status === 'submitted';
  const [editing, setEditing] = useState(!sent);
  const [answers, setAnswers] = useState<TaxAnswers>(row?.answers ?? {});
  const [showMissing, setShowMissing] = useState(false);
  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // Their saved answers are the starting point whenever they are not editing.
  useEffect(() => { if (!editing) setAnswers(row?.answers ?? {}); }, [row?.answers, editing]);

  const setAnswer = (key: string, patch: Partial<TaxAnswer>) => {
    setNote(null);
    setAnswers(prev => ({ ...prev, [key]: { ...(prev[key] ?? { value: null }), ...patch } }));
  };

  const missing = unansweredTaxQuestions(answers);
  const checklist = taxChecklist(answers);

  const save = async (submit: boolean) => {
    if (submit && missing.length > 0) { setShowMissing(true); return; }
    setBusy(submit ? 'send' : 'save');
    const ok = await onSave(answers, submit);
    setBusy(null);
    if (!ok) { setNote({ ok: false, text: "That didn't save. Check your connection and try again." }); return; }
    if (submit) { setEditing(false); setShowMissing(false); }
    else setNote({ ok: true, text: 'Saved. You can finish later.' });
  };

  if (sent && !editing) {
    const saved = taxChecklist(row?.answers ?? {});
    return (
      <View style={{ gap: 12 }}>
        <Text style={s.para}>
          Thanks! You sent your answers on {fmtDate(row?.submitted_at)}. They call
          for {plural(saved.length, 'document')}, listed in the next step.
        </Text>
        <SecondaryButton title="Change my answers" icon="create-outline" onPress={() => { setEditing(true); setNote(null); }} />
      </View>
    );
  }

  return (
    <View style={{ gap: 18 }}>
      <Text style={s.para}>
        Answer what you can. Press Save for later anytime and pick up where you left off.
      </Text>
      {TAX_SECTIONS.map(section => (
        <View key={section.key} style={{ gap: 10 }}>
          <Text style={s.section}>{section.title}</Text>
          {TAX_QUESTIONS.filter(q => q.section === section.key).map(q => (
            <QuestionRow
              key={q.key}
              q={q}
              season={season}
              answer={answers[q.key]}
              flag={showMissing && !isTaxAnswerComplete(q, answers[q.key])}
              onChange={patch => setAnswer(q.key, patch)}
              phone={phone}
            />
          ))}
        </View>
      ))}

      <View style={s.footer}>
        <Text style={s.footerText}>
          {missing.length === 0
            ? `All answered · ${plural(checklist.length, 'document')} to upload next`
            : `${plural(missing.length, 'question')} left`}
        </Text>
        <View style={[s.footerButtons, phone && { flexDirection: 'column-reverse', alignItems: 'stretch' }]}>
          {sent ? (
            <SecondaryButton
              title="Cancel"
              onPress={() => { setEditing(false); setShowMissing(false); setNote(null); }}
            />
          ) : (
            <SecondaryButton title="Save for later" busy={busy === 'save'} onPress={() => save(false)} />
          )}
          <PrimaryButton
            title={sent ? 'Save changes' : 'Send my answers'}
            icon="send"
            busy={busy === 'send'}
            onPress={() => save(true)}
          />
        </View>
        {showMissing && missing.length > 0 && (
          <Text style={s.error}>Please answer the questions marked in red first.</Text>
        )}
        {note && <Text style={note.ok ? s.saved : s.error}>{note.text}</Text>}
      </View>
    </View>
  );
}

function QuestionRow({ q, season, answer, flag, onChange, phone }: {
  q: TaxQuestion; season: string; answer: TaxAnswer | undefined; flag: boolean;
  onChange: (patch: Partial<TaxAnswer>) => void; phone: boolean;
}) {
  const value = answer?.value ?? null;
  return (
    <View style={[s.q, flag && s.qFlag]}>
      <Text style={s.qText}>{taxQuestionText(q, season)}</Text>
      {q.kind === 'yes_no' ? (
        <View style={s.options}>
          {(['yes', 'no'] as const).map(v => (
            <TouchableOpacity
              key={v}
              style={[s.option, s.yesNo, value === v && s.optionOn]}
              onPress={() => onChange({ value: v })}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === v }}
            >
              <Text style={[s.optionText, value === v && s.optionTextOn]}>{v === 'yes' ? 'Yes' : 'No'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={[s.options, { flexWrap: 'wrap' }]}>
          {(q.choices ?? []).map(c => (
            <TouchableOpacity
              key={c.value}
              style={[s.option, phone && { flexBasis: '100%' }, value === c.value && s.optionOn]}
              onPress={() => onChange({ value: c.value })}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === c.value }}
            >
              <Text style={[s.optionText, value === c.value && s.optionTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {q.detail && value === 'yes' && (
        <TextInput
          style={[s.detail, { outlineWidth: 0 } as any]}
          value={answer?.text ?? ''}
          onChangeText={t => onChange({ text: t })}
          placeholder={q.detail}
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      )}
      {flag && <Text style={s.flagText}>{value === 'yes' && q.detail ? 'Please add a few words.' : 'Please answer this one.'}</Text>}
    </View>
  );
}

// ── Step 3: the documents ────────────────────────────────────────────────────

function DocumentsStep({ season, row, docStates, phone, onUpload, onConfirm }: {
  season: string;
  row: TaxOnboarding | null;
  docStates: Record<string, TaxDocState>;
  phone: boolean;
  onUpload: (doc: TaxDoc) => void;
  onConfirm: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const docs = taxChecklist(row?.answers ?? {});
  const states = docs.map(d => docStates[d.key] ?? 'needed');
  const sent = states.filter(st => st !== 'needed').length;
  const accepted = states.filter(st => st === 'accepted').length;
  const confirmed = !!row?.docs_confirmed_at;
  const ready = canConfirmTaxDocs(states);

  const confirm = async () => {
    setBusy(true); setFailed(false);
    const ok = await onConfirm();
    setBusy(false);
    if (!ok) setFailed(true);
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <View style={s.track}>
          <View style={[s.fill, {
            width: `${docs.length ? (sent / docs.length) * 100 : 0}%` as any,
            backgroundColor: accepted === docs.length && docs.length > 0 ? Colors.viewed : Colors.primary,
          }]} />
        </View>
        <Text style={s.count}>
          {sent} of {plural(docs.length, 'document')} sent{accepted > 0 ? ` · ${accepted} accepted` : ''}
        </Text>
      </View>

      {docs.map(doc => {
        const st = docStates[doc.key] ?? 'needed';
        const look = STATE_LOOK[st];
        const ask = st === 'needed' || st === 'sent_back';
        const button = (
          <TouchableOpacity
            style={[ask ? s.upload : s.uploadQuiet, phone && { alignSelf: 'flex-start', marginTop: 6 }]}
            onPress={() => onUpload(doc)}
            activeOpacity={0.85}
          >
            <Ionicons name={ask ? 'cloud-upload-outline' : 'add'} size={15} color={ask ? '#3A3131' : Colors.primaryDark} />
            <Text style={ask ? s.uploadText : s.uploadQuietText}>
              {st === 'needed' ? 'Upload' : st === 'sent_back' ? 'Upload again' : 'Add more'}
            </Text>
          </TouchableOpacity>
        );
        return (
          <View key={doc.key} style={[s.doc, phone && { alignItems: 'flex-start' }]}>
            <View style={[s.docIcon, { backgroundColor: look.bg }]}>
              <Ionicons name={look.icon} size={17} color={look.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={s.docLabel}>{taxDocLabel(doc, season)}</Text>
              <Text style={s.docHint}>{doc.hint}</Text>
              <Text style={[s.docState, { color: look.color }]}>{look.label}</Text>
              {/* On a phone, under the words rather than beside them: beside, it
                  squeezed each line to two or three words. */}
              {phone && button}
            </View>
            {!phone && button}
          </View>
        );
      })}

      {confirmed ? (
        <View style={s.success}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.viewed} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.successTitle}>Thanks, you're all set for now.</Text>
            <Text style={s.successText}>
              We're reviewing your documents and will let you know if anything is missing.
              You can still add more anytime.
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <PrimaryButton
            title="I've sent everything"
            icon="checkmark-done"
            busy={busy}
            disabled={!ready}
            onPress={confirm}
          />
          <Text style={s.helper}>
            {ready
              ? "Tell us you're done, and we'll start reviewing."
              : "Upload each document above first. Can't find one? Message us from the chat and we'll help."}
          </Text>
          {failed && <Text style={s.error}>That didn't save. Check your connection and try again.</Text>}
        </View>
      )}
    </View>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Bullet({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.bullet}>
      <View style={s.bulletIcon}><Ionicons name={icon} size={14} color={Colors.primaryDark} /></View>
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

function PrimaryButton({ title, icon, busy, disabled, onPress }: {
  title: string; icon?: keyof typeof Ionicons.glyphMap; busy?: boolean; disabled?: boolean; onPress: () => void;
}) {
  const off = disabled || busy;
  return (
    <TouchableOpacity style={[s.primary, off && s.primaryOff]} onPress={onPress} disabled={off} activeOpacity={0.85}>
      {busy ? <ActivityIndicator color="#3A3131" size="small" /> : (
        <>
          <Text style={s.primaryText}>{title}</Text>
          {icon && <Ionicons name={icon} size={15} color="#3A3131" />}
        </>
      )}
    </TouchableOpacity>
  );
}

function SecondaryButton({ title, icon, busy, onPress }: {
  title: string; icon?: keyof typeof Ionicons.glyphMap; busy?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.secondary} onPress={onPress} disabled={busy} activeOpacity={0.85}>
      {busy ? <ActivityIndicator color={Colors.primaryDark} size="small" /> : (
        <>
          {icon && <Ionicons name={icon} size={15} color={Colors.textSecondary} />}
          <Text style={s.secondaryText}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },

  hero: { paddingHorizontal: 28, paddingBottom: 26, gap: 4 },
  heroPhone: { paddingHorizontal: 18 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 12 },
  backText: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: '700' },
  kicker: { color: Colors.primary, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: Colors.white, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  heroSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 19 },
  heroProgress: { marginTop: 14, gap: 6, maxWidth: 420 },
  heroCount: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: '700' },
  track: { height: 7, borderRadius: 4, backgroundColor: Colors.bgMid, overflow: 'hidden' },
  heroTrack: { backgroundColor: 'rgba(255,255,255,0.14)' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: Colors.primary },

  body: { width: '100%', maxWidth: 780, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, gap: 14 },
  bodyPhone: { paddingHorizontal: 14, paddingTop: 16, gap: 12 },

  step: {
    backgroundColor: Colors.bgCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#3A3131', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  stepOpen: { borderColor: 'rgba(232,185,35,0.55)' },
  stepLocked: { backgroundColor: '#FBF9F5', shadowOpacity: 0 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 },
  num: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgMid, borderWidth: 1, borderColor: Colors.border,
  },
  numDone: { backgroundColor: Colors.viewed, borderColor: Colors.viewed },
  numNow: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  numText: { color: Colors.textMuted, fontSize: 13, fontWeight: '800' },
  numTextNow: { color: '#3A3131' },
  stepTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  stepSub: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipDone: { backgroundColor: 'rgba(22,163,74,0.12)' },
  chipNow: { backgroundColor: Colors.primary },
  chipText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  stepBody: { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.borderLight },

  lead: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 10 },
  para: { color: Colors.textSecondary, fontSize: 13.5, lineHeight: 20, marginTop: 4 },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletIcon: {
    width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(181,144,91,0.12)',
  },
  bulletText: { flex: 1, color: Colors.textPrimary, fontSize: 13.5, lineHeight: 19 },
  tip: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.bgMid,
    borderRadius: 12, padding: 12,
  },
  tipText: { flex: 1, color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18 },

  section: {
    color: Colors.primaryDark, fontSize: 11, fontWeight: '800', letterSpacing: 0.8,
    textTransform: 'uppercase', marginTop: 4,
  },
  q: { gap: 9, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: '#FDFCFA' },
  qFlag: { borderColor: 'rgba(220,38,38,0.45)', backgroundColor: 'rgba(220,38,38,0.03)' },
  qText: { color: Colors.textPrimary, fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
  options: { flexDirection: 'row', gap: 8 },
  option: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  yesNo: { minWidth: 76, alignItems: 'center' },
  optionOn: { backgroundColor: 'rgba(232,185,35,0.16)', borderColor: Colors.primary },
  optionText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  optionTextOn: { color: '#3A3131' },
  detail: {
    minHeight: 72, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
    paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: 13.5, lineHeight: 19,
  },
  flagText: { color: Colors.error, fontSize: 12, fontWeight: '700' },

  footer: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  footerText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  footerButtons: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' },

  count: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  doc: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: '#FDFCFA',
    flexWrap: 'wrap',
  },
  docIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  docLabel: { color: Colors.textPrimary, fontSize: 13.5, fontWeight: '800' },
  docHint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  docState: { fontSize: 11.5, fontWeight: '800' },
  upload: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  uploadText: { color: '#3A3131', fontSize: 12.5, fontWeight: '800' },
  uploadQuiet: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  uploadQuietText: { color: Colors.primaryDark, fontSize: 12, fontWeight: '800' },

  success: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(22,163,74,0.08)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.25)',
  },
  successTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  successText: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  helper: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },

  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13, minWidth: 160,
    shadowColor: '#E8B923', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4,
  },
  primaryOff: { opacity: 0.45, shadowOpacity: 0 },
  primaryText: { color: '#3A3131', fontSize: 14, fontWeight: '800' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minWidth: 140,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  secondaryText: { color: Colors.textSecondary, fontSize: 13.5, fontWeight: '700' },

  error: { color: Colors.error, fontSize: 12.5, fontWeight: '700' },
  saved: { color: Colors.viewed, fontSize: 12.5, fontWeight: '700' },
});
