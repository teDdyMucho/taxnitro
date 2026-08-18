import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Colors } from '../../constants/colors';
import { MONTHS } from '../../lib/ueModel';

// Two years of monthly figures, side by side, with a trend line over the top.
//
// Drawn with plain Views rather than SVG: the app has no SVG dependency, and
// everything here is a rectangle, a hairline or a line segment, all of which a
// View does natively on web and on device.

const H = 320;          // canvas height, matching the report's proportions
const PAD_L = 46;       // room for the y-axis figures
const PAD_R = 8;
const PAD_T = 36;       // room for the rotated amounts above the tallest bar
const PAD_B = 26;       // room for the month names
const BAR_MAX = 13;
const LABEL_TRACK = 46; // length of a rotated amount's track
const LABEL_H = 10;

export interface UeBarChartProps {
  /** The current year, one entry per month. Zero means "not posted yet". */
  current: number[];
  /** The prior year, drawn beside it in grey. */
  prior: number[];
  /** Three-month average, drawn as a line. Zero breaks the line. */
  trend: number[];
  /** Colour of the current-year bars. */
  color: string;
}

/** An amount above a bar, turned to read upwards so the pair never collide. */
function Amount({ value, cx, top, color }: { value: number; cx: number; top: number; color: string }) {
  if (value <= 0) return null;
  // Rotating -90° about the centre swaps the box: it ends up LABEL_TRACK tall
  // and LABEL_H wide, still centred on the same point. Place that centre so the
  // rotated box finishes just above the bar, and the text reads out of it.
  const centreY = top - 3 - LABEL_TRACK / 2;
  return (
    <View
      pointerEvents="none"
      style={[
        s.amount,
        { left: cx - LABEL_TRACK / 2, top: centreY - LABEL_H / 2, width: LABEL_TRACK, height: LABEL_H },
      ]}
    >
      <Text style={[s.amountText, { color }]} numberOfLines={1}>
        {Math.round(value / 1000)}K
      </Text>
    </View>
  );
}

/** One segment of the trend line, as a hairline View rotated to its angle. */
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
        {
          left: x1 + dx / 2 - len / 2,
          top: y1 + dy / 2 - 0.8,
          width: len,
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
    />
  );
}

export function UeBarChart({ current, prior, trend, color }: UeBarChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (width < 40) return <View style={{ height: H }} onLayout={onLayout} />;

  const iw = width - PAD_L - PAD_R;
  const ih = H - PAD_T - PAD_B;
  const max = Math.max(...current, ...prior, ...trend, 1);
  const y = (v: number) => PAD_T + ih - (v / max) * ih;
  const slot = iw / 12;
  const bw = Math.min(BAR_MAX, slot / 3);

  // The trend line only joins months that were actually posted.
  const points = trend
    .map((v, i) => (v > 0 ? { x: PAD_L + slot * i + slot / 2, y: y(v) } : null))
    .filter((p): p is { x: number; y: number } => p != null);

  return (
    <View style={{ height: H }} onLayout={onLayout} pointerEvents="none">
      {/* Gridlines and the y-axis figures */}
      {[0, 1, 2, 3, 4].map(i => {
        const gy = PAD_T + (ih / 4) * i;
        return (
          <React.Fragment key={`g${i}`}>
            <View
              style={[
                s.grid,
                { top: gy, left: PAD_L, width: width - PAD_L - PAD_R },
                i === 4 && { backgroundColor: Colors.border },
              ]}
            />
            <Text style={[s.axis, { top: gy - 6, width: PAD_L - 8 }]}>
              {Math.round((max * (1 - i / 4)) / 1000)}K
            </Text>
          </React.Fragment>
        );
      })}

      {MONTHS.map((mo, i) => {
        const cx = PAD_L + slot * i + slot / 2;
        const cur = current[i] ?? 0;
        const pri = prior[i] ?? 0;
        return (
          <React.Fragment key={mo}>
            {cur > 0 && (
              <>
                <View style={[s.bar, { left: cx - bw - 1, top: y(cur), width: bw, height: PAD_T + ih - y(cur), backgroundColor: color }]} />
                <Amount value={cur} cx={cx - bw / 2 - 1} top={y(cur)} color={color} />
              </>
            )}
            {pri > 0 && (
              <>
                <View style={[s.bar, { left: cx + 1, top: y(pri), width: bw, height: PAD_T + ih - y(pri), backgroundColor: '#E0D6C6' }]} />
                <Amount value={pri} cx={cx + bw / 2 + 1} top={y(pri)} color={Colors.textMuted} />
              </>
            )}
            <Text style={[s.month, { left: cx - slot / 2, width: slot }]}>{mo}</Text>
          </React.Fragment>
        );
      })}

      {points.slice(1).map((p, i) => (
        <Segment key={`t${i}`} x1={points[i].x} y1={points[i].y} x2={p.x} y2={p.y} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { position: 'absolute', height: 1, backgroundColor: Colors.borderLight },
  axis: { position: 'absolute', left: 0, fontSize: 9, color: Colors.textMuted, textAlign: 'right' },
  bar: { position: 'absolute' },
  month: { position: 'absolute', bottom: 6, fontSize: 9.5, color: Colors.textMuted, textAlign: 'center' },
  amount: { position: 'absolute', justifyContent: 'center', transform: [{ rotate: '-90deg' }] },
  amountText: { fontSize: 8, fontWeight: '600', textAlign: 'left' },
  segment: { position: 'absolute', height: 1.6, backgroundColor: Colors.primaryDark },
});
