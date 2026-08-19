import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { formatMonthLabel } from '../db/requirements';
import type { BankAccount } from '../db/requirements';
import {
  QUESTIONS, listQuestionnaires, Questionnaire, Answer,
} from '../db/questionnaire';

// What the client told us this month, for whoever is looking at their files.
//
// Only the YES answers are opened by default: a month of eleven "no"s is the
// normal case and reading it line by line tells you nothing. The count says how
// many need attention, and the rest is one tap away.

function AnswerDetail({ a, accounts }: { a: Answer; accounts: BankAccount[] }) {
  if (a.value !== 'yes') return null;

  if (a.text?.trim()) return <Text style={s.detail}>{a.text.trim()}</Text>;

  if (a.accounts?.length) {
    return (
      <Text style={s.detail}>
        {a.accounts.map(x => `${x.bank} · end ${x.last4}`).join('\n')}
      </Text>
    );
  }

  if (a.closed?.length) {
    // Closing an account takes it off the profile, so the names recorded at the
    // time are the reliable source. Fall back to their current list, then to the
    // raw id — better that than a silently missing line.
    const names = a.closed.map(id => {
      const acc = a.closedAccounts?.find(x => x.id === id) ?? accounts.find(x => x.id === id);
      return acc ? `${acc.bank} · end ${acc.last4}` : id;
    });
    return <Text style={s.detail}>{names.join('\n')}</Text>;
  }

  if (a.files?.length) {
    return (
      <View style={{ gap: 6 }}>
        {a.files.map(f => (
          <TouchableOpacity
            key={f.url}
            style={s.file}
            onPress={() => Linking.openURL(f.url)}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text-outline" size={15} color={Colors.primaryDark} />
            <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
            <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return <Text style={s.detailMuted}>Yes — nothing added.</Text>;
}

function MonthBlock({ row, accounts }: { row: Questionnaire; accounts: BankAccount[] }) {
  const yeses = QUESTIONS.filter(q => row.answers?.[q.key]?.value === 'yes');
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? QUESTIONS : yeses;

  return (
    <View style={s.month}>
      <View style={s.monthHead}>
        <Text style={s.monthName}>{formatMonthLabel(row.month)}</Text>
        <View style={[s.badge, row.status === 'submitted' ? s.badgeDone : s.badgeOpen]}>
          <Text style={[s.badgeText, row.status === 'submitted' ? s.badgeTextDone : s.badgeTextOpen]}>
            {row.status === 'submitted' ? 'Submitted' : 'In progress'}
          </Text>
        </View>
      </View>

      <Text style={s.monthSub}>
        {yeses.length === 0
          ? 'No to everything.'
          : `${yeses.length} answered yes.`}
      </Text>

      {shown.map(q => {
        const a = row.answers?.[q.key] ?? { value: null };
        return (
          <View key={q.key} style={s.qRow}>
            <Text style={s.qText}>{q.text}</Text>
            <Text style={[
              s.value,
              a.value === 'yes' && s.valueYes,
              a.value === 'no' && s.valueNo,
            ]}>
              {a.value == null ? 'Not answered' : a.value === 'yes' ? 'Yes' : 'No'}
            </Text>
            <AnswerDetail a={a} accounts={accounts} />
          </View>
        );
      })}

      {yeses.length < QUESTIONS.length && (
        <TouchableOpacity onPress={() => setShowAll(v => !v)} activeOpacity={0.7}>
          <Text style={s.toggle}>
            {showAll ? 'Show only the yes answers' : `Show all ${QUESTIONS.length} questions`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function ClientQuestionnairePanel({ clientEmail, accounts = [] }: {
  clientEmail: string;
  /** Their accounts, to name the ones marked closed. */
  accounts?: BankAccount[];
}) {
  const [rows, setRows] = useState<Questionnaire[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { listQuestionnaires(clientEmail).then(setRows); }, [clientEmail]);

  const count = rows?.length ?? 0;
  const latest = rows?.[0];

  return (
    <View style={s.panel}>
      <TouchableOpacity style={s.head} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <View style={s.headIcon}>
          <Ionicons name="help-circle-outline" size={16} color={Colors.primaryDark} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headTitle}>Monthly questionnaire</Text>
          <Text style={s.headSub} numberOfLines={1}>
            {count === 0
              ? 'Nothing answered yet'
              : `${count} month${count === 1 ? '' : 's'} · latest ${formatMonthLabel(latest!.month)}`}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={s.body}>
          {rows == null ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 14 }} />
          ) : count === 0 ? (
            <Text style={s.empty}>
              This client has not answered the questionnaire yet. They are asked before
              they upload each month.
            </Text>
          ) : (
            rows.map(row => <MonthBlock key={row.id} row={row} accounts={accounts} />)
          )}
        </View>
      )}
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
  empty: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },

  month: {
    backgroundColor: Colors.bgDeep, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: 12, padding: 12, gap: 6,
  },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthName: { flex: 1, fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  monthSub: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeDone: { backgroundColor: '#E7F6EC' },
  badgeOpen: { backgroundColor: '#FEF3E2' },
  badgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  badgeTextDone: { color: Colors.viewed },
  badgeTextOpen: { color: Colors.notViewed },

  qRow: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 8, gap: 3 },
  qText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  value: { fontSize: 12, fontWeight: '800', color: Colors.textMuted },
  valueYes: { color: Colors.primaryDark },
  valueNo: { color: Colors.textMuted },
  detail: { fontSize: 12.5, color: Colors.textPrimary, lineHeight: 18, marginTop: 2 },
  detailMuted: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },

  file: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginTop: 2,
  },
  fileName: { flex: 1, fontSize: 12, color: Colors.textPrimary },

  toggle: {
    fontSize: 11.5, fontWeight: '700', color: Colors.primaryDark,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
});
