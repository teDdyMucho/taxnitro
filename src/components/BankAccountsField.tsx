/**
 * BankAccountsField — the "request statements per bank account" repeater.
 *
 * Staff/admin add one card per bank account the client must send statements for.
 * Each card needs a bank name and the last 4 digits of the account number; each
 * saved card becomes its OWN required item on the client's checklist (its own
 * upload slot, radio and approve/reject) — see src/db/requirements.ts.
 *
 * Leaving the list empty keeps the single generic "Bank Statements
 * (all accounts)" item, so existing clients are unaffected.
 *
 * Used by both the Add Client and Manage Client modals (ClientListScreen), so
 * staff can set this at creation time or any time after.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { BankAccount, bankAccountLabel, newBankAccountId } from '../db/requirements';

// ── Validation ────────────────────────────────────────────────────────────────

/** A card is complete when it has a bank name and exactly 4 digits. */
export function isCompleteBankAccount(a: BankAccount): boolean {
  return a.bank.trim().length > 0 && /^\d{4}$/.test(a.last4.trim());
}

/** True if any card is half-filled — the caller should block save until fixed. */
export function hasIncompleteBankAccount(accounts: BankAccount[]): boolean {
  return accounts.some(a => !isCompleteBankAccount(a));
}

/** Drop half-filled cards and trim — what actually gets written to the profile. */
export function cleanBankAccounts(accounts: BankAccount[]): BankAccount[] {
  return accounts
    .filter(isCompleteBankAccount)
    .map(a => ({ id: a.id, bank: a.bank.trim(), last4: a.last4.trim() }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BankAccountsField({
  value,
  onChange,
}: {
  value: BankAccount[];
  onChange: (accounts: BankAccount[]) => void;
}) {
  // A field turns red only AFTER it has been left — a freshly added card is
  // blank by definition, and colouring it on sight reads as "broken" rather
  // than "your turn".
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = (fieldId: string) =>
    setTouched(prev => (prev.has(fieldId) ? prev : new Set(prev).add(fieldId)));

  const add = () => onChange([...value, { id: newBankAccountId(), bank: '', last4: '' }]);

  const update = (id: string, patch: Partial<BankAccount>) =>
    onChange(value.map(a => (a.id === id ? { ...a, ...patch } : a)));

  const remove = (id: string) => {
    onChange(value.filter(a => a.id !== id));
    // Drop the removed card's touch flags so a new card can't inherit them.
    setTouched(prev => new Set([...prev].filter(k => !k.startsWith(`${id}:`))));
  };

  const completeCount = value.filter(isCompleteBankAccount).length;
  const incomplete    = hasIncompleteBankAccount(value);

  return (
    <View style={s.wrap}>
      {/* ── Section header ── */}
      <View style={s.headerRow}>
        <Text style={s.label}>Bank Accounts</Text>
        <View style={{ flex: 1 }} />
        {value.length > 0 && (
          <Text style={s.headerCount}>
            {completeCount} of {value.length} ready
          </Text>
        )}
      </View>
      <Text style={s.help}>
        Each account becomes its own required item on the client's checklist.
      </Text>

      {/* ── Cards ── */}
      {value.length === 0 ? (
        <View style={s.emptyBox}>
          <View style={s.emptyIcon}>
            <Ionicons name="business-outline" size={17} color="#B5905B" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.emptyTitle}>No accounts added</Text>
            <Text style={s.emptyText}>
              The client will see one “Bank Statements (all accounts)” item instead.
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {value.map((acct, idx) => {
            const complete = isCompleteBankAccount(acct);
            const bankBad  = touched.has(`${acct.id}:bank`)  && acct.bank.trim().length === 0;
            const last4Bad = touched.has(`${acct.id}:last4`) && !/^\d{4}$/.test(acct.last4.trim());

            return (
              <View key={acct.id} style={[s.card, complete && s.cardComplete]}>
                {/* Card header — icon, title, remove */}
                <View style={s.cardHead}>
                  <View style={[s.cardIcon, complete && s.cardIconComplete]}>
                    <Ionicons
                      name={complete ? 'checkmark' : 'business-outline'}
                      size={15}
                      color={complete ? '#16A34A' : '#B5905B'}
                    />
                  </View>
                  <Text style={s.cardTitle}>Account {idx + 1}</Text>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    style={s.removeBtn}
                    onPress={() => remove(acct.id)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={15} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Fields */}
                <View style={s.fieldsRow}>
                  <View style={s.bankField}>
                    <Text style={s.fieldLabel}>Bank Name</Text>
                    <View style={[s.input, bankBad && s.inputError]}>
                      <TextInput
                        style={[s.textInput, { outlineWidth: 0 } as any]}
                        placeholder="e.g. Chase"
                        placeholderTextColor={Colors.textMuted}
                        value={acct.bank}
                        onChangeText={t => update(acct.id, { bank: t })}
                        onBlur={() => markTouched(`${acct.id}:bank`)}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>

                  <View style={s.last4Field}>
                    <Text style={s.fieldLabel}>Last 4</Text>
                    <View style={[s.input, last4Bad && s.inputError]}>
                      <TextInput
                        style={[s.textInput, s.last4Text, { outlineWidth: 0 } as any]}
                        placeholder="0000"
                        placeholderTextColor={Colors.border}
                        value={acct.last4}
                        // Digits only — this is the tail of the account number.
                        onChangeText={t => update(acct.id, { last4: t.replace(/\D/g, '').slice(0, 4) })}
                        onBlur={() => markTouched(`${acct.id}:last4`)}
                        keyboardType="number-pad"
                        maxLength={4}
                      />
                    </View>
                  </View>
                </View>

                {/* Confirm what this card creates, in the client's own words. */}
                {complete && (
                  <View style={s.preview}>
                    <Ionicons name="eye-outline" size={12} color="#6B5E52" />
                    <Text style={s.previewText} numberOfLines={1}>
                      {bankAccountLabel(acct)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Add ── */}
      <TouchableOpacity style={s.addBtn} onPress={add} activeOpacity={0.75}>
        <Ionicons name="add" size={17} color="#3A3131" />
        <Text style={s.addBtnText}>Add Bank Account</Text>
      </TouchableOpacity>

      {incomplete && (
        <View style={s.warnBox}>
          <Ionicons name="information-circle-outline" size={14} color="#B45309" />
          <Text style={s.warnText}>
            Finish every account — a bank name and 4 digits each.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrap: { gap: 8 },

  /* Section header */
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  label: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerCount: { color: '#B5905B', fontSize: 11, fontWeight: '700' },
  help: { color: Colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: -3, marginBottom: 2 },

  /* Empty state */
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgMid,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,185,35,0.14)',
  },
  emptyTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  emptyText:  { color: Colors.textMuted, fontSize: 11, lineHeight: 16 },

  /* Account card */
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 13,
    gap: 11,
    shadowColor: '#3A3131',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardComplete: { borderColor: 'rgba(22,163,74,0.32)' },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,185,35,0.14)',
  },
  cardIconComplete: { backgroundColor: 'rgba(22,163,74,0.12)' },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgMid,
  },

  /* Fields */
  fieldsRow:   { flexDirection: 'row', gap: 10 },
  bankField:   { flex: 1, gap: 5 },
  last4Field:  { width: 92, gap: 5 },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.bgDeep,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: { borderColor: 'rgba(220,38,38,0.4)', backgroundColor: '#FEF2F2' },
  textInput:  { color: Colors.textPrimary, fontSize: 13.5, padding: 0 },
  last4Text:  { fontWeight: '700', letterSpacing: 3, textAlign: 'center' },

  /* Client-facing preview */
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgMid,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  previewText: { flex: 1, color: Colors.textSecondary, fontSize: 11.5, fontWeight: '600' },

  /* Add button */
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(232,185,35,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(232,185,35,0.45)',
    marginTop: 2,
  },
  addBtnText: { color: '#3A3131', fontSize: 13, fontWeight: '700' },

  /* Warning */
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  warnText: { flex: 1, color: '#B45309', fontSize: 11, lineHeight: 15 },
});
