import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { formatMonthLabel } from '../db/requirements';

// Which month a document is about.
//
// Not when it is being uploaded — a January statement handed over in March is
// still January, and that is the difference that makes sorting by date mean
// anything. Defaults to this month, because most of the time that is right.

/** The last `count` months, this one first, as 'YYYY-MM'. */
export function recentMonths(count = 15, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** 'Aug 2026' — short, because these sit in a row. */
export function shortMonthLabel(period: string): string {
  const [y, m] = period.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return Number.isNaN(d.getTime())
    ? period
    : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function PeriodPicker({ value, onChange, months = 15, hint }: {
  value: string;
  onChange: (period: string) => void;
  /** How far back to offer. A year and a bit covers a late catch-up. */
  months?: number;
  hint?: string;
}) {
  const options = useMemo(() => recentMonths(months), [months]);

  return (
    <View>
      <Text style={s.hint}>
        {hint ?? 'Which month is this for? Not when you are sending it — the month it covers.'}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {options.map((m, i) => {
          const on = m === value;
          return (
            <TouchableOpacity
              key={m}
              style={[s.chip, on && s.chipOn]}
              onPress={() => onChange(m)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={on ? 'calendar' : 'calendar-outline'}
                size={13}
                color={on ? Colors.primaryDeep : Colors.textMuted}
              />
              <Text style={[s.chipText, on && s.chipTextOn]}>
                {i === 0 ? 'This month' : shortMonthLabel(m)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {value && (
        <Text style={s.chosen}>Filed under {formatMonthLabel(value)}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hint: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16, marginBottom: 8 },
  row: { gap: 6, paddingRight: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgDeep,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextOn: { color: Colors.primaryDeep, fontWeight: '800' },
  chosen: { color: Colors.textMuted, fontSize: 11, marginTop: 8 },
});
