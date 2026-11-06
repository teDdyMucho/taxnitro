import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../constants/colors';
import type { BudgetTab } from '../../data/clientSheets';
import { useWheelScroll } from '../../hooks/useWheelScroll';

// A client's budget tab ("FY2027 Budget"), laid out the way the workbook lays it out.
//
// The tab is a stack of numbered sections, "1. BUDGET ASSUMPTIONS" down to
// "5. NOTES FOR REVIEW", each a small table under its own header row. Every
// figure arrives already formatted by the workbook (see BudgetTab), so all this
// decides is layout: which columns hold figures (narrow, right-aligned), which
// hold words (wide, wrapping), and where one section ends and the next begins.

type Cell = string | null;
interface Row { cells: Cell[]; bold: boolean }
interface Section { heading: string; rows: Row[] }

/** "2. FY2027 BUDGET BY ACCOUNT": a number, then capitals only. */
const HEADING = /^\d+\.\s+[A-Z0-9][^a-z]*$/;
/** A figure as these sheets format them: $1,097,407 · (22.2%) · 16.6 · 1.235x · - · OK */
const FIGURE = /^\(?-?\$?\d[\d,]*(\.\d+)?[%x]?\)?$|^-$|^OK$|^Error$/;
/** Spreadsheet errors are text in the sheet but mean "no figure": shown as a dash. */
const SHEET_ERRORS = ['#DIV/0!', '#REF!', '#VALUE!', '#N/A', '#NAME?', '#NULL!', '#NUM!'];

const words = (r: Row) => r.cells.filter((c): c is string => c != null);

function parse(tab: BudgetTab) {
  const bold = new Set(tab.bold);
  // Column A is empty in these sheets; start where the writing does.
  const starts = tab.grid.map(r => r.findIndex(c => c != null)).filter(i => i >= 0);
  const from = starts.length ? Math.min(...starts) : 0;

  const intro: string[] = [];
  const sections: Section[] = [];
  tab.grid.forEach((cells, i) => {
    const row: Row = { cells: cells.slice(from), bold: bold.has(i) };
    const w = words(row);
    if (w.length === 0) return;
    if (w.length === 1 && HEADING.test(w[0])) sections.push({ heading: w[0], rows: [] });
    else if (sections.length === 0) intro.push(w.join('  ·  '));
    else sections[sections.length - 1].rows.push(row);
  });
  return { intro, sections };
}

export function UeBudget({ tab }: { tab: BudgetTab }) {
  const { intro, sections } = useMemo(() => parse(tab), [tab]);
  // The first lines name the client, then the budget, then its basis.
  const [kicker, title, ...basis] = intro;

  return (
    <View style={s.wrap}>
      {intro.length > 0 && (
        <View style={s.intro}>
          {!!kicker && <Text style={s.kicker}>{kicker}</Text>}
          {!!title && <Text style={s.title}>{title}</Text>}
          {basis.map((line, i) => <Text key={i} style={s.basis}>{line}</Text>)}
        </View>
      )}
      {sections.map((sec, i) => (
        /NOTES/i.test(sec.heading)
          ? <NotesSection key={i} section={sec} />
          : <TableSection key={i} section={sec} />
      ))}
    </View>
  );
}

function SectionHead({ text }: { text: string }) {
  return (
    <View style={s.head}>
      <Text style={s.headText}>{text}</Text>
    </View>
  );
}

function TableSection({ section }: { section: Section }) {
  const scrollRef = useWheelScroll();
  const { rows } = section;

  // A section uses only some of the tab's columns: size the ones it does.
  const cols = useMemo(() => {
    const n = Math.max(0, ...rows.map(r => {
      let last = -1;
      r.cells.forEach((c, i) => { if (c != null) last = i; });
      return last + 1;
    }));
    return Array.from({ length: n }, (_, ci) => {
      const body = rows.slice(1).map(r => r.cells[ci]).filter((c): c is string => c != null);
      const numeric = body.length > 0 && body.filter(c => FIGURE.test(c)).length / body.length > 0.5;
      const longest = Math.max(0, ...rows.map(r => (r.cells[ci] ?? '').length));
      const width = numeric
        ? (longest > 11 ? 118 : 100)
        : longest > 60 ? 320 : longest > 30 ? 250 : longest > 14 ? 170 : 120;
      return { numeric, width };
    });
  }, [rows]);
  const total = cols.reduce((a, c) => a + c.width, 0);

  // A section narrower than its panel would stop short, header band and all.
  // The spare width goes to its widest column of words after the labels (the
  // "Basis / source" notes, which then wrap less); where it has none, the rows
  // simply run on to the panel's edge.
  const [viewW, setViewW] = useState(0);
  const extra = Math.max(0, viewW - total);
  const grow = cols.reduce(
    (best, c, i) => (i > 0 && !c.numeric && (best < 0 || c.width > cols[best].width) ? i : best), -1);
  const widths = cols.map((c, i) => c.width + (i === grow ? extra : 0));

  return (
    // Measured on the panel, whose width the page sets; inside its 1px border.
    <View style={s.panel} onLayout={e => setViewW(e.nativeEvent.layout.width - 2)}>
      <SectionHead text={section.heading} />
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator
        style={s.scroll}
      >
        <View style={{ width: Math.max(total, viewW) }}>
          {rows.map((row, ri) => {
            // A label alone on its line heads a group: "Income", "Fixed costs".
            if (ri > 0 && words(row).length === 1 && row.cells[0] != null) {
              return (
                <View key={ri} style={s.group}>
                  <Text style={s.groupText}>{row.cells[0]}</Text>
                </View>
              );
            }
            const header = ri === 0;
            const strong = header || row.bold;
            return (
              <View key={ri} style={[s.row, header && s.rowHeader, !header && row.bold && s.rowTotal]}>
                {cols.map((col, ci) => {
                  const c = row.cells[ci];
                  const text = c == null ? '' : SHEET_ERRORS.includes(c) ? '—' : c;
                  return (
                    <Text
                      key={ci}
                      style={[s.cell, col.numeric && s.num, strong && s.strong, { width: widths[ci] }]}
                    >
                      {text}
                    </Text>
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

function NotesSection({ section }: { section: Section }) {
  return (
    <View style={s.panel}>
      <SectionHead text={section.heading} />
      <View style={s.notes}>
        {section.rows.map((row, i) => (
          <Text key={i} style={s.note}>{words(row).join('  ')}</Text>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 16 },
  intro: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, gap: 4,
  },
  kicker: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: Colors.primaryDark, textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  basis: { fontSize: 12, lineHeight: 18, color: Colors.textSecondary },

  panel: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, overflow: 'hidden',
  },
  head: { backgroundColor: '#3A3131', paddingHorizontal: 14, paddingVertical: 10 },
  headText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: Colors.primary },
  scroll: { maxWidth: '100%' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.borderLight, alignItems: 'stretch' },
  rowHeader: { backgroundColor: Colors.bgMid },
  rowTotal: { backgroundColor: '#FCFAF6' },
  group: { backgroundColor: Colors.bgMid, paddingHorizontal: 10, paddingVertical: 7 },
  groupText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: Colors.primaryDark, textTransform: 'uppercase' },
  cell: { paddingHorizontal: 10, paddingVertical: 7, fontSize: 11.5, color: Colors.textSecondary },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '700', color: Colors.textPrimary },
  notes: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  note: { fontSize: 12.5, lineHeight: 19, color: Colors.textSecondary },
});
