import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../constants/colors';
import type { GridRow, StatementRow } from '../../data/clientSheets';
import { MONTHS, money, pct } from '../../lib/ueModel';

// The workbook's presentation tabs, rendered as tables.
//
// A web table sizes its own columns; a View has to be told. Both renderers
// below pick widths from the content — a column of figures is narrow, a column
// of prose is wide — and scroll sideways when the total runs past the screen.

const FLAGS: Record<string, { bg: string; fg: string }> = {
  OK: { bg: '#E7F6EC', fg: '#16A34A' },
  WATCH: { bg: '#FEF3E2', fg: '#D97706' },
  LOW: { bg: '#FEF3E2', fg: '#D97706' },
  MEDIUM: { bg: '#FEF3E2', fg: '#D97706' },
  HIGH: { bg: '#FDECEC', fg: '#DC2626' },
  CRITICAL: { bg: '#DC2626', fg: '#FFFFFF' },
};

const isNum = (v: unknown): v is number => typeof v === 'number';
/** A small fraction against a %-ish label is a rate, not a dollar amount. */
const looksPct = (v: unknown, label: string) =>
  isNum(v) && Math.abs(v) <= 1 && /%|ratio|margin/i.test(label || '');

function Flag({ value }: { value: string }) {
  const c = FLAGS[value] ?? { bg: Colors.bgMid, fg: Colors.textSecondary };
  return (
    <View style={[s.flag, { backgroundColor: c.bg }]}>
      <Text style={[s.flagText, { color: c.fg }]}>{value}</Text>
    </View>
  );
}

export function UeGridTable({ rows, flagCol }: { rows: GridRow[]; flagCol?: number }) {
  const cols = useMemo(() => {
    const n = Math.max(...rows.map(r => r.length));
    return Array.from({ length: n }, (_, ci) => {
      const cells = rows.map(r => r[ci]).filter(c => c != null && c !== '');
      const numeric = cells.length > 0 && cells.filter(isNum).length / cells.length > 0.5;
      const longest = cells.reduce<number>((a, c) => Math.max(a, String(c).length), 0);
      return { numeric, width: numeric ? 112 : longest > 60 ? 300 : longest > 24 ? 220 : 150 };
    });
  }, [rows]);

  const total = cols.reduce((a, c) => a + c.width, 0);

  return (
    <View style={s.panel}>
      <ScrollView horizontal showsHorizontalScrollIndicator style={s.scroll}>
        <View style={{ width: total }}>
          {rows.map((row, ri) => {
            const filled = row.filter(c => c != null && c !== '').length;
            const first = String(row.find(c => c != null) ?? '');
            // A lone wide string on its own line is a section banner in these sheets.
            if (filled === 1 && first.length > 3 && ri > 0 && !isNum(row.find(c => c != null))) {
              return (
                <View key={ri} style={s.section}>
                  <Text style={s.sectionText}>{first}</Text>
                </View>
              );
            }
            const header = ri === 0 || /^(Metric|No\.|Ratio|Driver|Finding)$/i.test(String(row[0] ?? row[1] ?? ''));
            return (
              <View key={ri} style={[s.row, header && s.rowHeader]}>
                {cols.map((col, ci) => {
                  const c = row[ci];
                  if (c == null || c === '') return <View key={ci} style={{ width: col.width }} />;
                  if (flagCol != null && ci === flagCol && typeof c === 'string' && FLAGS[c]) {
                    return (
                      <View key={ci} style={{ width: col.width, paddingHorizontal: 10, paddingVertical: 7 }}>
                        <Flag value={c} />
                      </View>
                    );
                  }
                  if (isNum(c)) {
                    const label = String(row[1] ?? row[0] ?? '');
                    const text = looksPct(c, label)
                      ? pct(c)
                      : Number.isInteger(c) && Math.abs(c) < 100
                        ? String(c)
                        : money(c);
                    return (
                      <Text key={ci} style={[s.cell, s.num, header && s.strong, { width: col.width }]}>{text}</Text>
                    );
                  }
                  return (
                    <Text key={ci} style={[s.cell, header && s.strong, { width: col.width }]}>{String(c)}</Text>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const ACCOUNT_W = 240;
const MONTH_W = 104;

export function UeStatement({ rows, forecastFrom }: { rows: StatementRow[]; forecastFrom?: number | null }) {
  const isFc = (i: number) => forecastFrom != null && i > forecastFrom;
  const total = ACCOUNT_W + MONTH_W * 26;

  return (
    <View style={s.panel}>
      <ScrollView horizontal showsHorizontalScrollIndicator style={s.scroll}>
        <View style={{ width: total }}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, s.strong, { width: ACCOUNT_W }]}>Account</Text>
            {MONTHS.map(m => (
              <Text key={`a${m}`} style={[s.cell, s.num, s.strong, { width: MONTH_W }]}>{m} 25</Text>
            ))}
            <Text style={[s.cell, s.num, s.strong, { width: MONTH_W }]}>2025</Text>
            {MONTHS.map((m, i) => (
              <Text key={`b${m}`} style={[s.cell, s.num, s.strong, isFc(i) && s.fcText, { width: MONTH_W }]}>{m} 26</Text>
            ))}
            <Text style={[s.cell, s.num, s.strong, { width: MONTH_W }]}>2026</Text>
          </View>

          {rows.map(r => {
            const bold = /^total|^net /i.test(r.label);
            return (
              <View key={r.r} style={[s.row, bold && s.rowTotal]}>
                <Text style={[s.cell, bold && s.strong, { width: ACCOUNT_W }]}>{r.label}</Text>
                {r.y2025.map((v, i) => (
                  <Text key={`p${i}`} style={[s.cell, s.num, bold && s.strong, { width: MONTH_W }]}>
                    {v == null ? '' : money(v)}
                  </Text>
                ))}
                <Text style={[s.cell, s.num, bold && s.strong, { width: MONTH_W }]}>
                  {r.t2025 == null ? '' : money(r.t2025)}
                </Text>
                {r.y2026.map((v, i) => (
                  <Text
                    key={`c${i}`}
                    style={[s.cell, s.num, bold && s.strong, isFc(i) && s.fc, { width: MONTH_W }]}
                  >
                    {v == null ? '' : money(v)}
                  </Text>
                ))}
                <Text style={[s.cell, s.num, bold && s.strong, { width: MONTH_W }]}>
                  {r.t2026 == null ? '' : money(r.t2026)}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, overflow: 'hidden',
  },
  scroll: { maxWidth: '100%' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.borderLight, alignItems: 'stretch' },
  rowHeader: { backgroundColor: Colors.bgMid },
  rowTotal: { backgroundColor: '#FCFAF6' },
  cell: { paddingHorizontal: 10, paddingVertical: 7, fontSize: 11.5, color: Colors.textSecondary },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '700', color: Colors.textPrimary },
  section: { backgroundColor: Colors.bgMid, paddingHorizontal: 12, paddingVertical: 9 },
  sectionText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, color: Colors.primaryDark, textTransform: 'uppercase' },
  fc: { backgroundColor: '#FDF8EC' },
  fcText: { color: Colors.primaryDark },
  flag: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  flagText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
});
