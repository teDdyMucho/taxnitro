import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, LayoutChangeEvent } from 'react-native';
import { Colors } from '../../constants/colors';
import type { OverviewStep } from '../../data/clientSheets';
import { useWheelScroll } from '../../hooks/useWheelScroll';

// The two charts on a month's overview, drawn the way Paul's workbook draws
// them: the profit walk from one month's net income to the next as a
// waterfall, and on some workbooks the year so far month by month.
//
// Plain Views, like BudgetChart: the app has no SVG dependency, and bars,
// hairlines and line segments are all things a View draws on web and device.
// Unlike the budget's, these go below zero (a month can lose money), so the
// axis runs from its lowest tick to its highest with zero wherever it falls.

// The workbook's own colours.
const UP = '#548235';
const DOWN = '#C00000';
const TOTAL = '#BF8F00';
const TOTAL_LAST = '#7F6000';
const BAR = '#BF9000';
const LINE = '#000000';

const PAD_T = 22;       // room for the labels over the tallest bar
const PAD_R = 12;

/** "$42K", as the workbook's axis writes thousands; "($23K)" or "-$23K" below zero. */
function thousands(v: number, parens: boolean) {
  const k = '$' + Math.round(Math.abs(v) / 1000).toLocaleString('en-US') + 'K';
  if (Math.round(Math.abs(v) / 1000) === 0) return '$0K';
  return v < 0 ? (parens ? `(${k})` : `-${k}`) : k;
}

/**
 * The axis as Excel picks it, both sides of zero: the smallest step of 1, 2 or
 * 5 × 10ⁿ that needs at most eight intervals from the lowest value to the highest.
 */
function axis(lo: number, hi: number) {
  const span = Math.max(hi - lo, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(span / 8)));
  const step = [1, 2, 5, 10].map(m => m * mag).find(st => Math.ceil(hi / st) - Math.floor(lo / st) <= 8) ?? 10 * mag;
  const bottom = Math.floor(lo / step) * step;
  const top = Math.max(Math.ceil(hi / step) * step, bottom + step);
  const ticks = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step);
  return { bottom, top, ticks };
}

/** One piece of a line, as a View rotated to its angle. */
function Segment({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={[s.segment, { left: x1 + dx / 2 - len / 2, top: y1 + dy / 2 - 1, width: len, transform: [{ rotate: `${angle}deg` }] }]}
    />
  );
}

/**
 * A plot that keeps a readable width: on a screen narrower than that, it
 * scrolls sideways rather than squeezing every label into a sliver.
 */
function useFrame(minWidth: number) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  return { width: Math.max(width, minWidth), measured: width > 0, onLayout, scrolls: width > 0 && width < minWidth };
}

function Frame({ frame, height, children }: {
  frame: ReturnType<typeof useFrame>; height: number; children: React.ReactNode;
}) {
  const scrollRef = useWheelScroll();
  const plot = <View style={{ width: frame.width, height }} pointerEvents="none">{frame.measured && children}</View>;
  return (
    <View onLayout={frame.onLayout}>
      {frame.scrolls
        ? <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator>{plot}</ScrollView>
        : plot}
      {/* On a phone the chart runs past the screen's edge; say so, or the walk looks finished halfway. */}
      {frame.scrolls && <Text style={s.hint}>Swipe sideways to see the rest →</Text>}
    </View>
  );
}

function Grid({ ticks, y, left, width, parens }: {
  ticks: number[]; y: (v: number) => number; left: number; width: number; parens: boolean;
}) {
  return (
    <>
      {ticks.map(t => (
        <React.Fragment key={t}>
          <View style={[t === 0 ? s.zero : s.gridline, { top: y(t), left, width }]} />
          <Text style={[s.axis, { top: y(t) - 7, width: left - 8 }]}>{thousands(t, parens)}</Text>
        </React.Fragment>
      ))}
    </>
  );
}

// ── The profit walk ─────────────────────────────────────────────────────────

const WALK_H = 300;     // plot
const WALK_CAT = 46;    // the step names under it, up to three lines

/**
 * Last month's net income, each line that moved it, and this month's — a total
 * stands on zero, a step starts where the one before it ended. Rises in green,
 * falls in red, the two totals in gold; each bar carries the workbook's own label.
 */
export function WaterfallChart({ steps }: { steps: OverviewStep[] }) {
  const n = steps.length;
  const values = steps.flatMap(st => [st.from, st.to]);
  const { bottom, top, ticks } = axis(Math.min(0, ...values), Math.max(0, ...values));
  const padL = 12 + Math.max(...ticks.map(t => thousands(t, false).length)) * 6.4;
  const frame = useFrame(padL + n * 78 + PAD_R);

  const iw = frame.width - padL - PAD_R;
  const ih = WALK_H - PAD_T - 8;
  const y = (v: number) => PAD_T + ((top - v) / (top - bottom)) * ih;
  const slot = iw / Math.max(n, 1);
  const bw = slot * 0.62;                    // Excel's gap width of 60
  const lastTotal = steps.map(st => st.kind).lastIndexOf('total');

  return (
    <Frame frame={frame} height={WALK_H + WALK_CAT}>
      <Grid ticks={ticks} y={y} left={padL} width={iw} parens={false} />
      {steps.map((st, i) => {
        const hi = Math.max(st.from, st.to), lo = Math.min(st.from, st.to);
        const colour = st.kind === 'up' ? UP : st.kind === 'down' ? DOWN : i === lastTotal && i > 0 ? TOTAL_LAST : TOTAL;
        const cx = padL + slot * i + slot / 2;
        return (
          <React.Fragment key={i}>
            <View style={[s.bar, { left: cx - bw / 2, top: y(hi), width: bw, height: Math.max(1, y(lo) - y(hi)), backgroundColor: colour }]} />
            <Text style={[s.value, { left: cx - slot / 2, width: slot, top: y(hi) - 17, color: st.kind === 'total' ? Colors.textPrimary : colour }]}>
              {st.text}
            </Text>
            <Text style={[s.category, { left: cx - slot / 2 + 2, width: slot - 4, top: WALK_H + 4 }]} numberOfLines={3}>
              {st.label}
            </Text>
          </React.Fragment>
        );
      })}
    </Frame>
  );
}

// ── The year month by month ─────────────────────────────────────────────────

const TREND_H = 280;
const TREND_CAT = 22;

/**
 * One measure as columns and another as a line, month by month: Paul's "2026
 * month by month", income in gold and net income in black. Each month carries
 * its figures where there is room for them; where there is not, only the
 * latest month does, which is the one the overview is about.
 */
export function TrendChart({ months, bars, line }: {
  months: string[];
  bars: { label: string; values: number[] };
  line: { label: string; values: number[] };
}) {
  const n = months.length;
  const all = [...bars.values, ...line.values];
  const { bottom, top, ticks } = axis(Math.min(0, ...all), Math.max(0, ...all));
  const padL = 12 + Math.max(...ticks.map(t => thousands(t, true).length)) * 6.4;
  const frame = useFrame(padL + n * 40 + PAD_R);

  const iw = frame.width - padL - PAD_R;
  const ih = TREND_H - PAD_T - 8;
  const y = (v: number) => PAD_T + ((top - v) / (top - bottom)) * ih;
  const slot = iw / Math.max(n, 1);
  const bw = slot * 0.5;
  const roomy = slot >= 56;
  const points = line.values.map((v, i) => ({ x: padL + slot * i + slot / 2, y: y(v) }));

  return (
    <View>
      <Frame frame={frame} height={TREND_H + TREND_CAT}>
        <Grid ticks={ticks} y={y} left={padL} width={iw} parens />
        {months.map((mo, i) => {
          const v = bars.values[i] ?? 0;
          const cx = padL + slot * i + slot / 2;
          const labelled = roomy || i === n - 1;
          return (
            <React.Fragment key={i}>
              <View style={[s.bar, { left: cx - bw / 2, top: y(Math.max(v, 0)), width: bw, height: Math.max(1, Math.abs(y(v) - y(0))), backgroundColor: BAR }]} />
              {labelled && (
                <Text style={[s.value, { left: cx - slot / 2, width: slot, top: v >= 0 ? y(v) - 17 : y(v) + 3, color: Colors.textSecondary }]}>
                  {thousands(v, true)}
                </Text>
              )}
              <Text style={[s.month, { left: cx - slot / 2, width: slot, top: TREND_H + 4 }]}>{mo}</Text>
            </React.Fragment>
          );
        })}
        {points.slice(1).map((p, i) => (
          <Segment key={i} x1={points[i].x} y1={points[i].y} x2={p.x} y2={p.y} />
        ))}
        {points.map((p, i) => (
          <React.Fragment key={`p${i}`}>
            <View style={[s.dot, { left: p.x - 4, top: p.y - 4 }]} />
            {(roomy || i === n - 1) && (
              <Text style={[s.pointLabel, { left: p.x + 6, top: p.y - 16 }]}>{thousands(line.values[i], true)}</Text>
            )}
          </React.Fragment>
        ))}
      </Frame>
      <View style={s.legend}>
        <View style={s.key}>
          <View style={s.swatch} />
          <Text style={s.keyText}>{bars.label}</Text>
        </View>
        <View style={s.key}>
          <View style={s.stroke}><View style={s.strokeDot} /></View>
          <Text style={s.keyText}>{line.label}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  axis: { position: 'absolute', left: 0, fontSize: 10, color: Colors.textSecondary, textAlign: 'right', fontVariant: ['tabular-nums'] },
  gridline: { position: 'absolute', height: 1, backgroundColor: Colors.borderLight },
  zero: { position: 'absolute', height: 1, backgroundColor: '#BFB4A6' },
  bar: { position: 'absolute' },
  value: { position: 'absolute', fontSize: 10.5, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  category: { position: 'absolute', fontSize: 10, lineHeight: 13, color: Colors.textSecondary, textAlign: 'center' },
  month: { position: 'absolute', fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },
  segment: { position: 'absolute', height: 2, backgroundColor: LINE },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: LINE },
  pointLabel: { position: 'absolute', fontSize: 10, fontWeight: '700', color: LINE, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 8 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 22, height: 9, backgroundColor: BAR },
  stroke: { width: 26, height: 2, backgroundColor: LINE, alignItems: 'center', justifyContent: 'center' },
  strokeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: LINE },
  keyText: { fontSize: 11, color: Colors.textSecondary },
  hint: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
});
