import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../constants/colors';
import type { GridCell, GridRow } from '../../data/clientSheets';

// The Financial Roadmap, drawn as the workbook draws it.
//
// Paul: "kaya ba magaya yung sa excel file for financial roadmap? ganito kasi
// itsura niya sa app hehe — parang naka binary ba hehe."
//
// He was right. The tab is a Gantt chart: each action has a 1 in every month it
// runs for, and the spreadsheet paints those cells as a bar. Poured through the
// generic grid the app draws for a sheet, they came out as what they literally
// are — a wall of 1s across twenty-odd month columns.
//
// So this reads the sheet rather than transcribing it: the actions and their
// spans, and the cadence table under them.

const PRIORITY_COLOURS: Record<string, { bar: string; chip: string; text: string }> = {
  CRITICAL: { bar: '#DC2626', chip: '#FEE2E2', text: '#991B1B' },
  HIGH:     { bar: '#E8B923', chip: '#FEF3C7', text: '#92400E' },
  MEDIUM:   { bar: '#64748B', chip: '#F1F5F9', text: '#475569' },
};
const priorityOf = (p: string) =>
  PRIORITY_COLOURS[p.trim().toUpperCase()] ?? PRIORITY_COLOURS.MEDIUM;

const text = (c: GridCell): string => (c == null ? '' : String(c).trim());

interface Action {
  no: string;
  title: string;
  why: string;
  owner: string;
  start: string;
  finish: string;
  priority: string;
  deliverable: string;
  /** Index into `months` of the first and last month it runs, or null. */
  from: number | null;
  to: number | null;
}

interface Cadence {
  frequency: string;
  what: string;
  owner: string;
  starts: string;
  standard: string;
}

interface Roadmap {
  title: string;
  months: string[];
  /** Where the month columns begin in the sheet. */
  monthCol: number;
  actions: Action[];
  cadence: Cadence[];
}

/**
 * Read the sheet into the shape it describes.
 *
 * Anchored on the headings rather than on row numbers, so another client's
 * roadmap can sit a row higher or lower without this quietly reading the wrong
 * line.
 */
function parse(grid: GridRow[]): Roadmap | null {
  const headerRow = grid.findIndex(r => r.some(c => text(c).toLowerCase() === 'action item'));
  if (headerRow < 0) return null;

  const header = grid[headerRow];
  const col = (label: string) =>
    header.findIndex(c => text(c).toLowerCase() === label.toLowerCase());

  const cNo = col('no.');
  const cTitle = col('action item');
  const cWhy = col('why it matters (cfo view)');
  const cOwner = col('accountable owner');
  const cStart = col('start');
  const cFinish = col('finish');
  const cPriority = col('priority');
  const cDeliverable = header.findIndex(c => text(c).toLowerCase().startsWith('deliverable'));

  // The months run from the last named column to the end of the header.
  const monthCol = Math.max(cPriority, cDeliverable) + 1;
  const months = header.slice(monthCol).map(text).filter(Boolean);

  const actions: Action[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const title = text(row[cTitle]);
    if (!title) {
      // The action list ends at the first blank; what follows is the cadence.
      if (actions.length) break;
      continue;
    }
    const marks = months
      .map((_, i) => (text(row[monthCol + i]) ? i : -1))
      .filter(i => i >= 0);
    actions.push({
      no: text(row[cNo]),
      title,
      why: text(row[cWhy]),
      owner: text(row[cOwner]),
      start: text(row[cStart]),
      finish: text(row[cFinish]),
      priority: text(row[cPriority]),
      deliverable: cDeliverable >= 0 ? text(row[cDeliverable]) : '',
      from: marks.length ? marks[0] : null,
      to: marks.length ? marks[marks.length - 1] : null,
    });
  }

  const cadHeader = grid.findIndex(r => r.some(c => text(c).toLowerCase() === 'frequency'));
  const cadence: Cadence[] = [];
  if (cadHeader >= 0) {
    const h = grid[cadHeader];
    const at = (label: string) =>
      h.findIndex(c => text(c).toLowerCase() === label.toLowerCase());
    const [f, w, o, s, st] =
      [at('frequency'), at('what happens'), at('accountable owner'), at('starts'), at('standard to hit')];
    for (let r = cadHeader + 1; r < grid.length; r++) {
      const row = grid[r];
      if (!text(row[f])) { if (cadence.length) break; continue; }
      cadence.push({
        frequency: text(row[f]), what: text(row[w]), owner: text(row[o]),
        starts: text(row[s]), standard: text(row[st]),
      });
    }
  }

  const title = text(grid[0]?.[0]) || 'Financial Roadmap';
  return { title, months, monthCol, actions, cadence };
}

const MONTH_W = 62;

export function UeRoadmap({ grid }: { grid: GridRow[] }) {
  const road = useMemo(() => parse(grid), [grid]);

  if (!road || !road.actions.length) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>This client&rsquo;s workbook has no roadmap yet.</Text>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <Text style={s.sectionTitle}>Action roadmap</Text>
      <Text style={s.sectionSub}>What happens, who owns it, and when it runs.</Text>

      {road.actions.map(a => {
        const p = priorityOf(a.priority);
        return (
          <View key={a.no + a.title} style={s.card}>
            <View style={s.cardTop}>
              <View style={[s.num, { backgroundColor: p.bar }]}>
                <Text style={s.numText}>{a.no}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.title}>{a.title}</Text>
                <Text style={s.why}>{a.why}</Text>
              </View>
              <View style={[s.chip, { backgroundColor: p.chip }]}>
                <Text style={[s.chipText, { color: p.text }]}>{a.priority}</Text>
              </View>
            </View>

            <View style={s.meta}>
              <Text style={s.metaLabel}>Owner</Text>
              <Text style={s.metaValue}>{a.owner}</Text>
              <Text style={s.metaLabel}>Runs</Text>
              <Text style={s.metaValue}>{a.start} – {a.finish}</Text>
            </View>

            {a.deliverable ? (
              <Text style={s.deliverable}>{a.deliverable}</Text>
            ) : null}
          </View>
        );
      })}

      <Text style={[s.sectionTitle, { marginTop: 22 }]}>Timeline</Text>
      <Text style={s.sectionSub}>
        Each bar is the months that action runs for — the same span the workbook marks.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator style={s.timelineScroll}>
        <View>
          <View style={s.monthHeader}>
            <View style={s.rowLabel} />
            {road.months.map(m => (
              <Text key={m} style={s.monthName} numberOfLines={1}>{m}</Text>
            ))}
          </View>

          {road.actions.map(a => {
            const p = priorityOf(a.priority);
            return (
              <View key={a.no + a.title} style={s.timelineRow}>
                <View style={s.rowLabel}>
                  <Text style={s.rowLabelText} numberOfLines={3}>{a.no}. {a.title}</Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  {road.months.map((m, i) => {
                    const on = a.from != null && a.to != null && i >= a.from && i <= a.to;
                    return (
                      <View key={m} style={s.cell}>
                        {on && (
                          <View style={[
                            s.bar,
                            { backgroundColor: p.bar },
                            i === a.from && s.barStart,
                            i === a.to && s.barEnd,
                          ]} />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {road.cadence.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { marginTop: 22 }]}>Recurring cadence</Text>
          <Text style={s.sectionSub}>The rhythm this runs on once the actions are done.</Text>
          {road.cadence.map((c, i) => (
            <View key={c.frequency + c.what + i} style={s.card}>
              <View style={s.cardTop}>
                <View style={s.freq}><Text style={s.freqText}>{c.frequency}</Text></View>
                <Text style={[s.title, { flex: 1 }]}>{c.what}</Text>
              </View>
              <View style={s.meta}>
                <Text style={s.metaLabel}>Owner</Text>
                <Text style={s.metaValue}>{c.owner}</Text>
                <Text style={s.metaLabel}>Starts</Text>
                <Text style={s.metaValue}>{c.starts}</Text>
              </View>
              {c.standard ? <Text style={s.deliverable}>{c.standard}</Text> : null}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 30 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  sectionSub: { color: Colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 },

  card: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
  title: { color: Colors.textPrimary, fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
  why: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  freq: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
    backgroundColor: Colors.bgDeep, borderWidth: 1, borderColor: Colors.border,
  },
  freqText: { color: Colors.textSecondary, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },

  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  metaLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
  metaValue: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginRight: 10 },
  deliverable: {
    color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border,
  },

  timelineScroll: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 14,
    backgroundColor: Colors.bgCard,
  },
  monthHeader: {
    flexDirection: 'row', alignItems: 'center', minHeight: 42,
    borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 8,
  },
  monthName: {
    width: MONTH_W, textAlign: 'center',
    color: Colors.textMuted, fontSize: 10.5, fontWeight: '700',
  },
    // A floor on the height, so the short labels line their bars up with each
    // other. A long one is given a third line rather than cut: STEER's first
    // action runs to 91 characters, and two lines lose the end of it.
  timelineRow: {
    flexDirection: 'row', alignItems: 'center', minHeight: 42,
    borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 7,
  },
  rowLabel: { width: 300, paddingHorizontal: 14 },
  rowLabelText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  cell: { width: MONTH_W, height: 16, justifyContent: 'center' },
  // Square in the middle so consecutive months read as one bar, rounded at the
  // two ends so it reads as a span rather than a run of separate blocks.
  bar: { height: 8, marginHorizontal: 0 },
  barStart: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4, marginLeft: 6 },
  barEnd: { borderTopRightRadius: 4, borderBottomRightRadius: 4, marginRight: 6 },

  empty: { padding: 30, alignItems: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 13 },
});
