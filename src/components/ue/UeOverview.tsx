import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../constants/colors';
import type { MonthOverview, OverviewSection, OverviewTable, OverviewPoints } from '../../data/clientSheets';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import { TrendChart, WaterfallChart } from './OverviewCharts';

// A client's month in brief — Paul's "Oct 2026 Overview" — laid out the way the
// workbook lays it out. The sheet runs in bands: what happened beside where the
// money went, then the profit walk across the page, then what we recommend,
// and on some a month-by-month chart beside a cash walk. Each section arrives
// knowing which half of its band it takes (see MonthOverview), so all this
// decides is how a band sits: side by side where there is room, one under the
// other on a phone.

const UP = '#548235';     // the workbook's green and red for "effect on profit"
const DOWN = '#C00000';

/** A figure as these sheets format them: $41,693 · ($23,273) · +$39,387 · - */
const FIGURE = /^[+-]?\(?-?\$?\d[\d,]*(\.\d+)?[%x]?\)?$|^-$/;

const ORDER = { left: 0, full: 1, right: 2 } as const;

/** The sections of each band, in the order the sheet reads them. */
function bands(sections: OverviewSection[]) {
  const byRow = new Map<number, OverviewSection[]>();
  sections.forEach(sec => byRow.set(sec.r, [...(byRow.get(sec.r) ?? []), sec]));
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([r, secs]) => ({ r, sections: [...secs].sort((a, b) => ORDER[a.side] - ORDER[b.side]) }));
}

export function UeOverview({ overview }: { overview: MonthOverview }) {
  const rows = useMemo(() => bands(overview.sections), [overview]);
  // "October 2026  |  Monthly Overview": the last part is the title, anything
  // before it — the month, or the client's name — sits above it.
  const parts = overview.title.split('|').map(p => p.trim()).filter(Boolean);
  const title = parts.length ? parts[parts.length - 1] : overview.title;
  const kicker = parts.slice(0, -1).join('  ·  ');

  return (
    <View style={s.wrap}>
      <View style={s.intro}>
        {!!kicker && <Text style={s.kicker}>{kicker}</Text>}
        <Text style={s.title}>{title}</Text>
      </View>
      {rows.map(band => (
        <View key={band.r} style={s.band}>
          {band.sections.map(sec => (
            <View key={`${sec.side}-${sec.heading}`} style={band.sections.length > 1 ? s.half : s.whole}>
              <Section section={sec} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Section({ section }: { section: OverviewSection }) {
  return (
    <View style={s.panel}>
      <View style={s.head}>
        <Text style={s.headText}>{section.heading}</Text>
      </View>
      {section.kind === 'points' && <Points section={section} />}
      {section.kind === 'table' && <Table section={section} />}
      {section.kind === 'walk' && (
        <View style={s.chart}><WaterfallChart steps={section.steps} /></View>
      )}
      {section.kind === 'trend' && (
        <View style={s.chart}><TrendChart months={section.months} bars={section.bars} line={section.line} /></View>
      )}
    </View>
  );
}

function Points({ section }: { section: OverviewPoints }) {
  return (
    <View style={s.points}>
      {section.items.map(item => (
        <View key={item.n} style={s.point}>
          <View style={s.badge}><Text style={s.badgeText}>{item.n}</Text></View>
          <View style={s.pointBody}>
            {!!item.title && <Text style={s.pointTitle}>{item.title}</Text>}
            <Text style={s.pointText}>{item.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const LABEL_W = 150;
const FIG_W = 92;

function Table({ section }: { section: OverviewTable }) {
  const scrollRef = useWheelScroll();
  const { header, rows } = section;
  // The first column names each line; the rest are figures, right-aligned —
  // or words, like the cash walk's closing "Ties ✓".
  const numeric = useMemo(() => header.map((_, ci) => {
    const body = rows.map(r => r.cells[ci]).filter((c): c is string => c != null);
    return ci > 0 && body.length > 0 && body.filter(c => FIGURE.test(c)).length / body.length > 0.5;
  }), [header, rows]);
  const minWidth = LABEL_W + (header.length - 1) * FIG_W;
  const [viewW, setViewW] = useState(0);
  const width = Math.max(minWidth, viewW);

  const line = (cells: (string | null)[], opts: { head?: boolean; bold?: boolean; tones?: ('up' | 'down' | null)[] }) => (
    <View style={[s.row, opts.head && s.rowHead, opts.bold && s.rowTotal]}>
      {cells.map((c, ci) => (
        <Text
          key={ci}
          style={[
            s.cell,
            ci === 0 ? { flex: 1, minWidth: LABEL_W } : { width: FIG_W },
            ci > 0 && (numeric[ci] || opts.head) && s.num,
            (opts.head || opts.bold) && s.strong,
            opts.tones?.[ci] === 'up' && { color: UP },
            opts.tones?.[ci] === 'down' && { color: DOWN },
          ]}
        >
          {c ?? ''}
        </Text>
      ))}
    </View>
  );

  return (
    <View onLayout={e => setViewW(e.nativeEvent.layout.width)}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator style={s.scroll}>
        <View style={{ width }}>
          {line(header, { head: true })}
          {rows.map((r, ri) => (
            <React.Fragment key={ri}>{line(r.cells, { bold: r.bold, tones: r.tones })}</React.Fragment>
          ))}
        </View>
      </ScrollView>
      {!!section.note && <Text style={s.note}>{section.note}</Text>}
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
  title: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },

  band: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' },
  // Shrinkable: on a band of its own, each must fit a phone narrower than its basis.
  half: { flexGrow: 1, flexShrink: 1, flexBasis: 380, minWidth: 0 },
  whole: { flexGrow: 1, flexBasis: '100%', minWidth: 0 },

  panel: {
    flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, overflow: 'hidden',
  },
  head: { backgroundColor: '#3A3131', paddingHorizontal: 14, paddingVertical: 10 },
  headText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: Colors.primary },
  chart: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },

  points: { paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  badge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.bgMid,
    borderWidth: 1, borderColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: Colors.primaryDeep },
  pointBody: { flex: 1, gap: 3 },
  pointTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  pointText: { fontSize: 12.5, lineHeight: 19, color: Colors.textSecondary },

  scroll: { maxWidth: '100%' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowHead: { backgroundColor: Colors.bgMid },
  rowTotal: { backgroundColor: '#FCFAF6' },
  cell: { paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: Colors.textSecondary },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '700', color: Colors.textPrimary },
  note: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 11.5, lineHeight: 17, fontStyle: 'italic', color: Colors.textMuted },
});
