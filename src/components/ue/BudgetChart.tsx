import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Colors } from '../../constants/colors';

// The budget tab's chart, "FY2027 Monthly Revenue vs Break-even", drawn the way
// the workbook draws it beside section 4: the month's revenue as a gold column,
// break-even revenue as a black line across them, a dollar axis on the left and
// the legend underneath. Paul asked for the same format (Daja wants it so).
//
// Plain Views, like UeBarChart: the app has no SVG dependency, and a column, a
// hairline and a line segment are all things a View draws on web and device.

const H = 300;          // plot height
const PAD_T = 10;
const PAD_B = 24;       // room for the month names
const PAD_R = 12;
const GOLD = '#BF8F00'; // the workbook's own column colour
const LINE = '#000000';

export interface BudgetChartProps {
  title: string;
  /** "Jan" … "Dec". */
  months: string[];
  /** The budget's revenue for each month: the columns. */
  bars: number[];
  /** Break-even revenue for each month: the line. */
  line: number[];
  barLabel: string;
  lineLabel: string;
}

const dollars = (v: number) => '$' + Math.round(v).toLocaleString('en-US');

/**
 * The axis as Excel picks it: the smallest step of 1, 2 or 5 × 10ⁿ that needs
 * at most ten intervals. Tribal's $18,814 top month gives $2,000 steps to $20,000.
 */
function axis(max: number) {
  if (max <= 0) return { top: 1, step: 1 };
  const mag = Math.pow(10, Math.floor(Math.log10(max / 10)));
  const step = [1, 2, 5, 10].map(m => m * mag).find(st => Math.ceil(max / st) <= 10) ?? 10 * mag;
  return { top: Math.ceil(max / step) * step, step };
}

/** One piece of the line, as a View rotated to its angle. */
function Segment({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={[
        s.segment,
        { left: x1 + dx / 2 - len / 2, top: y1 + dy / 2 - 1, width: len, transform: [{ rotate: `${angle}deg` }] },
      ]}
    />
  );
}

export function BudgetChart({ title, months, bars, line, barLabel, lineLabel }: BudgetChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const n = months.length;
  const { top, step } = axis(Math.max(0, ...bars, ...line));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const padL = 12 + Math.max(...ticks.map(t => dollars(t).length)) * 6.2;

  const iw = width - padL - PAD_R;
  const ih = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + ih - (Math.max(0, v) / top) * ih;
  const slot = iw / Math.max(n, 1);
  const bw = slot * 0.62;
  const points = line.map((v, i) => ({ x: padL + slot * i + slot / 2, y: y(v) }));

  return (
    <View style={s.panel}>
      <Text style={s.title}>{title}</Text>
      <View style={{ height: H }} onLayout={onLayout} pointerEvents="none">
        {width > 80 && (
          <>
            {ticks.map(t => (
              <Text key={t} style={[s.axis, { top: y(t) - 7, width: padL - 8 }]}>{dollars(t)}</Text>
            ))}
            <View style={[s.base, { top: y(0), left: padL, width: iw }]} />
            {months.map((mo, i) => {
              const cx = padL + slot * i + slot / 2;
              const v = bars[i] ?? 0;
              return (
                <React.Fragment key={i}>
                  {v > 0 && (
                    <View style={[s.bar, { left: cx - bw / 2, top: y(v), width: bw, height: y(0) - y(v) }]} />
                  )}
                  <Text style={[s.month, { left: cx - slot / 2, width: slot }]}>{mo}</Text>
                </React.Fragment>
              );
            })}
            {points.slice(1).map((p, i) => (
              <Segment key={i} x1={points[i].x} y1={points[i].y} x2={p.x} y2={p.y} />
            ))}
          </>
        )}
      </View>
      <View style={s.legend}>
        <View style={s.key}>
          <View style={s.swatch} />
          <Text style={s.keyText}>{barLabel}</Text>
        </View>
        <View style={s.key}>
          <View style={s.stroke} />
          <Text style={s.keyText}>{lineLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12,
  },
  title: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 10 },
  axis: { position: 'absolute', left: 0, fontSize: 10, color: Colors.textSecondary, textAlign: 'right', fontVariant: ['tabular-nums'] },
  base: { position: 'absolute', height: 1, backgroundColor: Colors.border },
  bar: { position: 'absolute', backgroundColor: GOLD },
  month: { position: 'absolute', top: H - PAD_B + 6, fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },
  segment: { position: 'absolute', height: 2, backgroundColor: LINE },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 6 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 22, height: 9, backgroundColor: GOLD },
  stroke: { width: 26, height: 2, backgroundColor: LINE },
  keyText: { fontSize: 11, color: Colors.textSecondary },
});
