import React from 'react';
import { Platform, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

// A single day, as 'YYYY-MM-DD'.
//
// The app had no date picker. On the web — where staff and Team One work — this
// is the browser's own, which every browser now has and which needs nothing
// installed. Elsewhere it is a typed date, checked with isIsoDate.

/**
 * A real calendar day written as YYYY-MM-DD. Checked as a day, not a moment:
 * read as local midnight and compared in UTC, every date failed east of UTC —
 * Team One in Manila could never send an update.
 */
export function isIsoDate(v: string | null | undefined): boolean {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function DateField({ value, onChange, min }: {
  value: string;
  onChange: (value: string) => void;
  /** The earliest day that may be picked, as YYYY-MM-DD. */
  min?: string;
}) {
  if (Platform.OS === 'web') {
    // react-native-web has no date input, so this is a plain one.
    return React.createElement('input', {
      type: 'date',
      value,
      min,
      onChange: (e: any) => onChange(e.target.value),
      style: web,
    });
  }
  return (
    <TextInput
      style={s.input}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={Colors.textMuted}
      keyboardType="numbers-and-punctuation"
      maxLength={10}
    />
  );
}

const web: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  backgroundColor: Colors.white,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: 'inherit',
};

const s = StyleSheet.create({
  input: {
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white, color: Colors.textPrimary,
    fontSize: 14, paddingHorizontal: 12, paddingVertical: 10,
  },
});
