import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import {
  TAX_SEASON, TAX_QUESTIONS, FILING_STATUSES,
  taxQuestionText, taxDocLabel, taxChecklist, taxDocState, taxOnboardingOpenFor,
  getTaxOnboarding, getTaxSlots, slotFiles,
  type TaxOnboarding, type TaxSlot, type SlotFile, type TaxDocState,
} from '../db/taxOnboarding';

// A client's tax onboarding for the season, on their profile, for FTG: how far
// they are, what they answered, and where each document on their checklist
// stands. Belly reviews from here; the files themselves are accepted or sent
// back where any other file is (the Documents queue, or the client's folders),
// and the checklist follows, because each document's slot is the same one the
// client's page reads.
//
// Shown for a tax client the onboarding is offered to, or who has started it.
// While it is still closed to clients, that keeps it off every other profile.

const STAFF_LOOK: Record<TaxDocState, { label: string; color: string; bg: string }> = {
  needed:    { label: 'Not sent yet',                 color: Colors.textMuted, bg: Colors.bgMid },
  sent:      { label: 'Sent · awaiting review',       color: '#B7791F',        bg: '#FEF3E2' },
  resent:    { label: 'Sent again · awaiting review', color: '#B7791F',        bg: '#FEF3E2' },
  accepted:  { label: 'Accepted',                     color: Colors.viewed,    bg: '#E7F6EC' },
  sent_back: { label: 'Sent back · waiting on them',  color: Colors.error,     bg: '#FDECEC' },
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

interface Loaded { row: TaxOnboarding | null; slots: TaxSlot[]; files: Map<string, SlotFile> }

export function ClientTaxOnboardingPanel({ clientId, clientEmail, services }: {
  /** Their profile id, which is what the preview list holds. */
  clientId: string;
  clientEmail: string;
  /** The client's services: only a tax client has an onboarding. */
  services?: readonly string[] | null;
}) {
  const season = TAX_SEASON;
  const isTax = !!services?.includes('TAX');
  const [data, setData] = useState<Loaded | null>(null);
  // Read again each time it is opened, so it is current when looked at.
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!isTax || !clientEmail) return;
    let live = true;
    (async () => {
      const [row, slots] = await Promise.all([getTaxOnboarding(clientEmail, season), getTaxSlots(clientEmail, season)]);
      const files = await slotFiles(slots);
      if (live) setData({ row, slots, files });
    })();
    return () => { live = false; };
  }, [clientEmail, season, isTax, reads]);

  if (!isTax || !data) return null;
  if (!data.row && !taxOnboardingOpenFor(clientId)) return null;
  return <TaxOnboardingPanelView season={season} {...data} onOpen={() => setReads(n => n + 1)} />;
}

/** What the panel draws, from what was read. Apart so it can be looked at without a database. */
export function TaxOnboardingPanelView({ season, row, slots, files, onOpen, startOpen = false }: Loaded & {
  season: string;
  onOpen?: () => void;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [allAnswers, setAllAnswers] = useState(false);
  const toggle = () => { if (!open) onOpen?.(); setOpen(!open); };

  const docs = row ? taxChecklist(row.answers) : [];
  const stateOf = (key: string): TaxDocState => {
    const slot = slots.find(sl => sl.requirement_key === key);
    const file = slot?.document_id ? files.get(slot.document_id) : undefined;
    return taxDocState(slot?.status, file?.approval_status === 'pending');
  };
  const states = docs.map(d => stateOf(d.key));
  const sent = states.filter(st => st !== 'needed').length;
  const accepted = states.filter(st => st === 'accepted').length;
  const submitted = row?.status === 'submitted';

  const summary = !row?.welcomed_at
    ? 'Not started'
    : !submitted
      ? 'Answering the questions'
      : row.docs_confirmed_at
        ? `All documents in · ${accepted} of ${docs.length} accepted`
        : `${sent} of ${docs.length} documents sent · ${accepted} accepted`;

  const answered = row ? TAX_QUESTIONS.filter(q => row.answers?.[q.key]?.value != null) : [];
  const yeses = TAX_QUESTIONS.filter(q => q.kind === 'yes_no' && row?.answers?.[q.key]?.value === 'yes');
  const shownQuestions = allAnswers ? TAX_QUESTIONS : yeses;
  const filing = FILING_STATUSES.find(c => c.value === row?.answers?.filing_status?.value)?.label;

  return (
    <View style={s.panel}>
      <TouchableOpacity style={s.head} onPress={toggle} activeOpacity={0.7}>
        <View style={s.headIcon}>
          <Ionicons name="document-text-outline" size={16} color={Colors.primaryDark} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headTitle}>{season} tax onboarding</Text>
          <Text style={s.headSub} numberOfLines={1}>{summary}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={s.body}>
          {/* How far they are. */}
          <View style={s.block}>
            <StepLine label="Welcome" value={row?.welcomed_at ? `Started ${fmtDate(row.welcomed_at)}` : 'Not yet'} done={!!row?.welcomed_at} />
            <StepLine
              label="Questions"
              value={submitted ? `Sent ${fmtDate(row?.submitted_at)}` : row?.welcomed_at ? 'In progress' : 'Not yet'}
              done={submitted}
            />
            <StepLine
              label="Documents"
              value={row?.docs_confirmed_at
                ? `Client says all are in · ${fmtDate(row.docs_confirmed_at)}`
                : submitted ? `${sent} of ${docs.length} sent` : 'After the questions'}
              done={!!row?.docs_confirmed_at}
            />
          </View>

          {/* What they told us. */}
          {row && answered.length > 0 && (
            <View style={s.block}>
              <Text style={s.blockTitle}>Answers{!submitted ? ' so far (not sent yet)' : ''}</Text>
              {filing && (
                <View style={s.qRow}>
                  <Text style={s.qText}>Filing status</Text>
                  <Text style={s.valueYes}>{filing}</Text>
                </View>
              )}
              {!allAnswers && yeses.length === 0 && (
                <Text style={s.muted}>No to everything else.</Text>
              )}
              {shownQuestions.filter(q => q.kind === 'yes_no').map(q => {
                const a = row.answers?.[q.key];
                return (
                  <View key={q.key} style={s.qRow}>
                    <Text style={s.qText}>{taxQuestionText(q, season)}</Text>
                    <Text style={a?.value === 'yes' ? s.valueYes : s.valueNo}>
                      {a?.value === 'yes' ? 'Yes' : a?.value === 'no' ? 'No' : 'Not answered'}
                    </Text>
                    {a?.value === 'yes' && !!a.text?.trim() && <Text style={s.detail}>{a.text.trim()}</Text>}
                  </View>
                );
              })}
              <TouchableOpacity onPress={() => setAllAnswers(v => !v)} activeOpacity={0.7}>
                <Text style={s.toggle}>
                  {allAnswers ? 'Show only the yes answers' : `Show all ${TAX_QUESTIONS.length} questions`}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Their checklist. */}
          {submitted && (
            <View style={s.block}>
              <Text style={s.blockTitle}>Documents</Text>
              {docs.map((doc, i) => {
                const look = STAFF_LOOK[states[i]];
                const label = taxDocLabel(doc, season);
                const slot = slots.find(sl => sl.requirement_key === doc.key);
                const file = slot?.document_id ? files.get(slot.document_id) : undefined;
                // Files are named "<item> — <their file>"; the item is the line above.
                const fileName = file?.name.startsWith(`${label} — `) ? file.name.slice(label.length + 3) : file?.name;
                return (
                  <View key={doc.key} style={s.doc}>
                    <View style={s.docHead}>
                      <Text style={s.docLabel}>{label}</Text>
                      <View style={[s.pill, { backgroundColor: look.bg }]}>
                        <Text style={[s.pillText, { color: look.color }]}>{look.label}</Text>
                      </View>
                    </View>
                    {file?.url ? (
                      <TouchableOpacity style={s.file} onPress={() => Linking.openURL(file.url)} activeOpacity={0.8}>
                        <Ionicons name="document-text-outline" size={14} color={Colors.primaryDark} />
                        <Text style={s.fileName} numberOfLines={1}>{fileName}</Text>
                        <Ionicons name="open-outline" size={13} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
              <Text style={s.muted}>
                Accept or send back each file in Documents or in their folders. This list follows.
              </Text>
            </View>
          )}

          {!row && (
            <Text style={s.muted}>
              They haven't opened it yet. It's on their dashboard as "Start your {season} tax onboarding".
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function StepLine({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <View style={s.stepLine}>
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={15}
        color={done ? Colors.viewed : Colors.textMuted}
      />
      <Text style={s.stepLabel}>{label}</Text>
      <Text style={s.stepValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, overflow: 'hidden', marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  headIcon: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: '#FDF8EC',
    alignItems: 'center', justifyContent: 'center',
  },
  headTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  headSub: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },

  block: {
    backgroundColor: Colors.bgDeep, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: 12, padding: 12, gap: 7,
  },
  blockTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },

  stepLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepLabel: { width: 82, fontSize: 12, fontWeight: '800', color: Colors.textPrimary },
  stepValue: { flex: 1, fontSize: 12, color: Colors.textSecondary },

  qRow: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 8, gap: 3 },
  qText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  valueYes: { fontSize: 12, fontWeight: '800', color: Colors.primaryDark },
  valueNo: { fontSize: 12, fontWeight: '800', color: Colors.textMuted },
  detail: { fontSize: 12.5, color: Colors.textPrimary, lineHeight: 18, marginTop: 2 },
  muted: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 17 },
  toggle: {
    fontSize: 11.5, fontWeight: '700', color: Colors.primaryDark,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },

  doc: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 8, gap: 6 },
  docHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  docLabel: { flexShrink: 1, fontSize: 12.5, fontWeight: '800', color: Colors.textPrimary },
  pill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  file: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7,
  },
  fileName: { flex: 1, fontSize: 12, color: Colors.textPrimary },
});
