import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  TextInput, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import type { UeSheets } from '../../data/ueSheets';
import { UeBarChart } from '../../components/ue/UeBarChart';
import { UeGridTable, UeStatement } from '../../components/ue/UeTables';
import {
  MONTHS, LAST_ACTUAL, SCENARIOS, DEFAULT_ASSUMPTIONS, LEVERS, SHARED_INPUTS,
  RECOMMENDATIONS, buildForecast, buildModel, buildDashboard, historicalBasis,
  monthlyImpact, appliedToForecast, forecastOutcome, money, pct, signed, div,
  type Assumptions, type Scenario, type LeverKey, type SharedKey, type AnalysisRow, type InsightCard,
} from '../../lib/ueModel';

// Uniquely Enough Behavioral Health LLC — the monthly financial report.
//
// Every figure comes from the client's own workbook (src/data/ueSheets.ts) and
// every calculation from src/lib/ueModel.ts. This file only decides how the
// result is laid out, so the arithmetic can be checked without a screen.
//
// Findings for Review and TL;DR are internal working notes: they appear for
// staff and admin, and never in a client's view.

type TabKey = 'dash' | 'findings' | 'tldr' | 'assum' | 'fsr' | 'fsa' | 'bs' | 'pl';

interface TabDef { key: TabKey; label: string; staffOnly?: boolean }

const NAV: TabDef[] = [
  { key: 'dash', label: 'Dashboard' },
  { key: 'findings', label: 'Findings for Review', staffOnly: true },
  { key: 'tldr', label: 'TL;DR', staffOnly: true },
  { key: 'assum', label: 'Assumptions' },
];
const STATEMENTS: TabDef[] = [
  { key: 'fsr', label: 'FS-R' },
  { key: 'fsa', label: 'FS-A' },
  { key: 'bs', label: 'UE BS' },
  { key: 'pl', label: 'UE PL' },
];

export interface UEDashboardScreenProps {
  /** Returns to Financial Reports. Omitted when there is nowhere to go back to. */
  onBack?: () => void;
  /** Staff and admin see the internal tabs; clients do not. */
  staffView?: boolean;
}

export function UEDashboardScreen({ onBack, staffView = false }: UEDashboardScreenProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [sheets, setSheets] = useState<UeSheets | null>(null);
  const [tab, setTab] = useState<TabKey>('dash');
  const [month, setMonth] = useState(7);
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);

  // One client's financials are a large module, and nobody needs them until
  // this screen opens — so it is pulled in on mount rather than bundled into
  // the app everyone downloads.
  useEffect(() => {
    let live = true;
    import('../../data/ueSheets')
      .then(m => { if (live) setSheets(m.UE_SHEETS); })
      .catch(e => console.error('UEDashboard: could not load the workbook', e));
    return () => { live = false; };
  }, []);

  const tabs = useMemo(
    () => [...NAV, ...STATEMENTS].filter(t => staffView || !t.staffOnly),
    [staffView],
  );

  // A client landing on a staff tab (say, from a stale link) is put back on the
  // dashboard rather than shown an empty page.
  useEffect(() => {
    if (!tabs.some(t => t.key === tab)) setTab('dash');
  }, [tabs, tab]);

  const fsr = useMemo(() => (sheets ? buildForecast(sheets, assumptions) : null), [sheets, assumptions]);
  const model = useMemo(() => (sheets ? buildModel(sheets, assumptions) : null), [sheets, assumptions]);
  const dash = useMemo(() => (fsr ? buildDashboard(fsr, month) : null), [fsr, month]);

  if (!sheets || !fsr || !dash || !model) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={s.loadingText}>Loading the workbook…</Text>
      </View>
    );
  }

  const setLever = (key: LeverKey, i: number, value: number) =>
    setAssumptions(a => ({ ...a, [key]: a[key].map((v, k) => (k === i ? value : v)) }));
  const setShared = (key: SharedKey, value: number) =>
    setAssumptions(a => ({ ...a, [key]: value }));

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const navButton = (t: TabDef) => (
    <Pressable
      key={t.key}
      onPress={() => setTab(t.key)}
      style={[s.navItem, !wide && s.navItemNarrow, tab === t.key && s.navItemOn]}
    >
      <Text style={[s.navText, tab === t.key && s.navTextOn]} numberOfLines={1}>{t.label}</Text>
    </Pressable>
  );

  const sidebar = wide ? (
    <View style={s.side}>
      <View style={s.logo}>
        <Text style={s.logoName}>UNIQUELY ENOUGH</Text>
        <Text style={s.logoSub}>Behavioral Health LLC</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={s.navLabel}>Navigation</Text>
        {tabs.filter(t => NAV.some(n => n.key === t.key)).map(navButton)}
        <Text style={s.navLabel}>Statements</Text>
        {STATEMENTS.map(navButton)}
      </ScrollView>
      {onBack && (
        <Pressable onPress={onBack} style={s.back}>
          <Ionicons name="arrow-back" size={16} color={Colors.primaryDeep} />
          <Text style={s.backText}>Back to Financial Reports</Text>
        </Pressable>
      )}
    </View>
  ) : (
    <View style={s.topBar}>
      <View style={s.topBarHead}>
        <Text style={s.logoNameSmall}>UNIQUELY ENOUGH</Text>
        {onBack && (
          <Pressable onPress={onBack} style={s.backSmall}>
            <Ionicons name="arrow-back" size={14} color={Colors.primaryDeep} />
            <Text style={s.backTextSmall}>Reports</Text>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topBarTabs}>
        {tabs.map(navButton)}
      </ScrollView>
    </View>
  );

  // ── Pieces of the dashboard page ───────────────────────────────────────────
  const analysisTable = (rows: AnalysisRow[]) => (
    <View>
      <View style={[s.tRow, s.tHead]}>
        <Text style={[s.tCell, s.tStrong, { flex: 3 }]}>Metric</Text>
        <Text style={[s.tCell, s.tStrong, s.tNum, { flex: 1.2 }]}>Amount</Text>
        <Text style={[s.tCell, s.tStrong, s.tNum, { flex: 1.2 }]}>$ Variance</Text>
        <Text style={[s.tCell, s.tStrong, s.tNum, { flex: 1 }]}>% Variance</Text>
      </View>
      {rows.map((r, i) => (
        <View key={r.metric} style={s.tRow}>
          <Text style={[s.tCell, i === 0 && s.tStrong, { flex: 3 }]}>{r.metric}</Text>
          <Text style={[s.tCell, s.tNum, i === 0 && s.tStrong, { flex: 1.2 }]}>{money(r.amount)}</Text>
          <Text style={[s.tCell, s.tNum, { flex: 1.2 }, r.variance != null && (r.variance >= 0 ? s.pos : s.neg)]}>
            {r.variance == null ? '–' : signed(r.variance)}
          </Text>
          <Text style={[s.tCell, s.tNum, { flex: 1 }, r.variancePct != null && (r.variancePct >= 0 ? s.pos : s.neg)]}>
            {r.variancePct == null ? '–' : pct(r.variancePct)}
          </Text>
        </View>
      ))}
    </View>
  );

  const insightCards = (cards: InsightCard[]) => (
    <View style={s.cards}>
      {cards.map(c => (
        <View key={c.title} style={[s.card, wide ? s.cardWide : s.cardNarrow]}>
          <Text style={s.cardKey}>{c.title}</Text>
          <Text style={s.cardValue}>{c.value}</Text>
          <Text style={s.cardSub}>{c.sub}</Text>
          <Text style={s.cardNote}>{c.note}</Text>
        </View>
      ))}
    </View>
  );

  const subhead = (title: string, lead: string) => (
    <LinearGradient
      colors={['#3A3131', '#4A3E3E', '#3A3131']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.subhead}
    >
      <Text style={s.subheadTitle}>{title}</Text>
      <Text style={s.subheadLead}>{lead}</Text>
    </LinearGradient>
  );

  const numberCell = (value: number, onChange: (v: number) => void) => (
    <TextInput
      style={s.input}
      defaultValue={String(Math.round(value * 100) / 100)}
      keyboardType="numeric"
      selectTextOnFocus
      onEndEditing={e => {
        const v = parseFloat(e.nativeEvent.text);
        if (!Number.isNaN(v)) onChange(v);
      }}
    />
  );

  // ── Pages ──────────────────────────────────────────────────────────────────
  const dashboardPage = (
    <>
      <LinearGradient
        colors={['#3A3131', '#4A3E3E', '#3A3131']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.masthead}
      >
        <View style={s.mastheadTop}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={s.mastheadTitle}>Monthly Financial Report</Text>
            <Text style={s.mastheadMeta}>Uniquely Enough Behavioral Health LLC</Text>
          </View>
          <View style={s.preparedBy}>
            <Text style={s.preparedByName}>Prepared by Finance Therapy Group</Text>
            <Text style={s.preparedByNote}>Restated from client books</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.monthRow}>
          {MONTHS.map((mo, i) => (
            <Pressable key={mo} onPress={() => setMonth(i)} style={[s.monthChip, month === i && s.monthChipOn]}>
              <Text style={[s.monthChipText, month === i && s.monthChipTextOn]}>{mo} 26</Text>
              {i > LAST_ACTUAL && <Text style={[s.monthChipFc, month === i && s.monthChipFcOn]}>forecast</Text>}
            </Pressable>
          ))}
        </ScrollView>
      </LinearGradient>

      <View style={s.pad}>
        {dash.isForecast && (
          <View style={s.note}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.primaryDark} />
            <Text style={s.noteText}>
              {dash.label} is a forecast, not a closed month. It moves with the scenario on the Assumptions tab.
            </Text>
          </View>
        )}

        <View style={s.band}>
          {dash.kpis.map(k => (
            <View key={k.label} style={[s.bandCell, wide ? s.bandCellWide : s.bandCellNarrow]}>
              <Text style={s.bandKey}>{k.label}</Text>
              <Text style={[s.bandValue, k.positive ? s.pos : s.neg]}>{k.value}</Text>
              <Text style={s.bandDelta}>
                {k.deltaPct ? <Text style={k.positive ? s.pos : s.neg}>{k.deltaPct} </Text> : null}
                {k.delta}
              </Text>
            </View>
          ))}
        </View>

        <View style={[s.duo, !wide && s.duoStack]}>
          <View style={[s.panel, s.duoItem]}>
            <Text style={s.panelHead}>Income · monthly movement</Text>
            <View style={s.legend}>
              <Legend color={Colors.primary} label="2026" />
              <Legend color="#E0D6C6" label="2025" />
              <Legend color={Colors.textMuted} label="Trend, 3-mo avg" />
            </View>
            <View style={s.panelBody}>
              <UeBarChart {...dash.incomeSeries} color={Colors.primary} />
            </View>
          </View>
          <View style={[s.panel, s.duoItem]}>
            <Text style={s.panelHead}>Expense · monthly movement</Text>
            <View style={s.legend}>
              <Legend color={Colors.primaryDark} label="2026" />
              <Legend color="#E0D6C6" label="2025" />
              <Legend color={Colors.textMuted} label="Trend" />
            </View>
            <View style={s.panelBody}>
              <UeBarChart {...dash.expenseSeries} color={Colors.primaryDark} />
            </View>
          </View>
        </View>

        <View style={[s.duo, !wide && s.duoStack]}>
          <View style={[s.panel, s.duoItem]}>
            <Text style={s.panelHead}>Income analysis · {dash.label}</Text>
            {analysisTable(dash.incomeRows)}
          </View>
          <View style={[s.panel, s.duoItem]}>
            <Text style={s.panelHead}>Expense analysis · {dash.label}</Text>
            {analysisTable(dash.expenseRows)}
          </View>
        </View>

        <View style={[s.duo, !wide && s.duoStack]}>
          <View style={[s.prose, s.duoItem]}><Text style={s.proseText}>{dash.incomeComment}</Text></View>
          <View style={[s.prose, s.duoItem]}><Text style={s.proseText}>{dash.expenseComment}</Text></View>
        </View>

        <RuleHead label="Balance sheet" />
        {insightCards(dash.balanceCards)}
        {insightCards(dash.ratioCards)}

        <RuleHead label="Recommendations" />
        <View style={s.panel}>
          <View style={[s.tRow, s.tHead]}>
            <Text style={[s.tCell, s.tStrong, { width: 32 }]} />
            <Text style={[s.tCell, s.tStrong, { flex: 2 }]}>Action Items</Text>
            {wide && <Text style={[s.tCell, s.tStrong, { flex: 3 }]}>Why It Matters</Text>}
            <Text style={[s.tCell, s.tStrong, { flex: 1.4 }]}>Metric to Watch</Text>
            <Text style={[s.tCell, s.tStrong, { width: 88 }]}>Priority</Text>
          </View>
          {RECOMMENDATIONS.map(r => (
            <View key={r.n} style={s.tRow}>
              <Text style={[s.tCell, s.tNum, s.recNum, { width: 32 }]}>{r.n}</Text>
              <Text style={[s.tCell, s.tStrong, { flex: 2 }]}>{r.action}</Text>
              {wide && <Text style={[s.tCell, { flex: 3 }]}>{r.why}</Text>}
              <Text style={[s.tCell, { flex: 1.4 }]}>{r.metric}</Text>
              <View style={{ width: 88, paddingHorizontal: 10, paddingVertical: 7 }}>
                <View style={s.flagCritical}><Text style={s.flagCriticalText}>{r.priority}</Text></View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </>
  );

  const assumptionsPage = (
    <>
      {subhead(
        'Scenario Assumptions',
        'Edit the highlighted cells. Picking a scenario updates the Aug–Dec 2026 forecast on FS-R, and the Dashboard along with it. The historical basis is live from FS-A actuals.',
      )}
      <View style={s.pad}>
        <View style={s.panel}>
          <Text style={s.panelHead}>Selected Scenario</Text>
          <View style={[s.panelBody, s.scenRow]}>
            {SCENARIOS.map(sc => (
              <Pressable
                key={sc}
                onPress={() => setAssumptions(a => ({ ...a, scenario: sc as Scenario }))}
                style={[s.scenChip, assumptions.scenario === sc && s.scenChipOn]}
              >
                <Text style={[s.scenText, assumptions.scenario === sc && s.scenTextOn]}>{sc}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.panel}>
          <Text style={s.panelHead}>1 · Historical basis — last 6 actual months (Feb–Jul 2026)</Text>
          <View style={[s.tRow, s.tHead]}>
            <Text style={[s.tCell, s.tStrong, { flex: 3 }]}>Item</Text>
            <Text style={[s.tCell, s.tStrong, s.tNum, { flex: 1.2 }]}>$ / month</Text>
            <Text style={[s.tCell, s.tStrong, s.tNum, { flex: 1.2 }]}>% of revenue</Text>
          </View>
          {historicalBasis(model).map(r => (
            <View key={r.label} style={s.tRow}>
              <Text style={[s.tCell, { flex: 3 }]}>{r.label}</Text>
              <Text style={[s.tCell, s.tNum, { flex: 1.2 }]}>{money(r.amount)}</Text>
              <Text style={[s.tCell, s.tNum, { flex: 1.2 }]}>{r.share == null ? '' : pct(r.share)}</Text>
            </View>
          ))}
        </View>

        <View style={s.panel}>
          <Text style={s.panelHead}>3 · Scenario levers — edit the highlighted cells</Text>
          <View style={[s.tRow, s.tHead]}>
            <Text style={[s.tCell, s.tStrong, { flex: 3 }]}>Driver</Text>
            <Text style={[s.tCell, s.tStrong, { width: 56 }]}>Unit</Text>
            {SCENARIOS.map(sc => (
              <Text key={sc} style={[s.tCell, s.tStrong, s.tNum, { flex: 1 }]}>{sc}</Text>
            ))}
          </View>
          {LEVERS.map(l => (
            <View key={l.key} style={s.tRow}>
              <Text style={[s.tCell, { flex: 3 }]}>{l.label}</Text>
              <Text style={[s.tCell, s.hint, { width: 56 }]}>{l.unit}</Text>
              {SCENARIOS.map((sc, i) => (
                <View key={sc} style={{ flex: 1, paddingHorizontal: 6, paddingVertical: 4 }}>
                  {numberCell(
                    l.isPct ? assumptions[l.key][i] * 100 : assumptions[l.key][i],
                    v => setLever(l.key, i, l.isPct ? v / 100 : v),
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={s.panel}>
          <Text style={s.panelHead}>4 · Shared inputs</Text>
          {SHARED_INPUTS.map(f => (
            <View key={f.key} style={s.tRow}>
              <Text style={[s.tCell, { flex: 3 }]}>{f.label}</Text>
              <View style={{ flex: 1, paddingHorizontal: 6, paddingVertical: 4 }}>
                {numberCell(assumptions[f.key], v => setShared(f.key, v))}
              </View>
            </View>
          ))}
        </View>

        <View style={s.panel}>
          <Text style={s.panelHead}>5 · Monthly impact by scenario (auto)</Text>
          <View style={[s.tRow, s.tHead]}>
            <Text style={[s.tCell, s.tStrong, { flex: 3 }]}>Metric</Text>
            {SCENARIOS.map(sc => (
              <Text key={sc} style={[s.tCell, s.tStrong, s.tNum, { flex: 1 }]}>{sc}</Text>
            ))}
          </View>
          {monthlyImpact(assumptions).map(r => (
            <View key={r.label} style={s.tRow}>
              <Text style={[s.tCell, r.strong && s.tStrong, { flex: 3 }]}>{r.label}</Text>
              {SCENARIOS.map((sc, i) => (
                <Text key={sc} style={[s.tCell, s.tNum, r.strong && s.tStrong, { flex: 1 }]}>{money(r.fn(i))}</Text>
              ))}
            </View>
          ))}
        </View>

        <View style={s.panel}>
          <Text style={s.panelHead}>6 · Applied to forecast — these feed FS-R (Aug–Dec 2026)</Text>
          {appliedToForecast(model).map(r => (
            <View key={r.label} style={s.tRow}>
              <Text style={[s.tCell, { flex: 3 }]}>{r.label}</Text>
              <Text style={[s.tCell, s.tNum, { flex: 1.2 }]}>{r.value}</Text>
            </View>
          ))}
        </View>

        <View style={s.panel}>
          <Text style={s.panelHead}>8 · Forecast outcome — live from FS-R</Text>
          {forecastOutcome(fsr).map(r => (
            <View key={r.label} style={s.tRow}>
              <Text style={[s.tCell, r.strong && s.tStrong, { flex: 3 }]}>{r.label}</Text>
              <Text style={[s.tCell, s.tNum, r.strong && s.tStrong, { flex: 1.2 }]}>{money(r.amount)}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );

  const gridPage = (title: string, lead: string, rows: any[], flagCol?: number) => (
    <>
      {subhead(title, lead)}
      <View style={s.pad}><UeGridTable rows={rows} flagCol={flagCol} /></View>
    </>
  );

  const page = () => {
    switch (tab) {
      case 'dash': return dashboardPage;
      case 'assum': return assumptionsPage;
      case 'findings':
        return gridPage('Findings for Review',
          'CFO / controller findings and recommendations, sourced from the UE PL and UE BS tabs.',
          sheets['Findings for Review'], 6);
      case 'tldr':
        return gridPage('TL;DR',
          'Monthly / YTD financial summary prepared by Finance Therapy Group.',
          sheets['TL;DR'].map(r => r.slice(0, 6)));
      case 'bs':
        return gridPage('UE BS',
          'Balance sheet as provided — the source behind the restated statements.', sheets['UE BS']);
      case 'pl':
        return gridPage('UE PL',
          'Profit and loss as provided — the source behind the restated statements.', sheets['UE PL']);
      case 'fsa':
        return (
          <>
            {subhead('FS-A — Actuals',
              'Actuals only, with no forecast. This is the historical basis the scenario model averages from.')}
            <View style={s.pad}><UeStatement rows={sheets['FS-A']} /></View>
          </>
        );
      case 'fsr':
        return (
          <>
            {subhead('FS-R — Restated & Forecast',
              'Restated statements. January to July 2026 are booked actuals; August to December are forecast from the scenario levers.')}
            <View style={s.pad}>
              <View style={s.note}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.primaryDark} />
                <Text style={s.noteText}>
                  Jan–Jul 2026 are booked actuals. Aug–Dec 2026 are forecast, shaded below, and move
                  with the scenario on the Assumptions tab.
                </Text>
              </View>
              <UeStatement rows={Object.values(fsr)} forecastFrom={LAST_ACTUAL} />
            </View>
          </>
        );
    }
  };

  return (
    <View style={[s.root, wide && s.rootWide]}>
      {sidebar}
      <ScrollView style={s.main} contentContainerStyle={s.mainContent}>
        {page()}
      </ScrollView>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendSwatch, { backgroundColor: color }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

function RuleHead({ label }: { label: string }) {
  return (
    <View style={s.ruleHead}>
      <Text style={s.ruleHeadText}>{label}</Text>
      <View style={s.ruleLine} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  rootWide: { flexDirection: 'row' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgDeep, gap: 12 },
  loadingText: { color: Colors.textMuted, fontSize: 13 },

  // Sidebar
  side: { width: 252, backgroundColor: '#3A3131', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16 },
  logo: { paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#4A3E3E', marginBottom: 14 },
  logoName: { color: Colors.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.6 },
  logoSub: { color: '#A89880', fontSize: 11, marginTop: 3 },
  navLabel: {
    color: '#8A7A6A', fontSize: 9, fontWeight: '700', letterSpacing: 1.6,
    textTransform: 'uppercase', marginTop: 14, marginBottom: 6, paddingHorizontal: 4,
  },
  navItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 3 },
  navItemNarrow: { marginBottom: 0, marginRight: 6, paddingVertical: 8 },
  navItemOn: { backgroundColor: 'rgba(232,185,35,0.16)', borderLeftWidth: 3, borderLeftColor: Colors.primary },
  navText: { color: '#A89880', fontSize: 13, fontWeight: '600' },
  navTextOn: { color: Colors.primary },
  back: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
  backText: { color: Colors.primaryDeep, fontSize: 13, fontWeight: '800' },

  // Narrow-screen top bar
  topBar: { backgroundColor: '#3A3131', paddingTop: 12, paddingBottom: 8 },
  topBarHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 10 },
  logoNameSmall: { flex: 1, color: Colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  backSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6,
  },
  backTextSmall: { color: Colors.primaryDeep, fontSize: 12, fontWeight: '800' },
  topBarTabs: { paddingHorizontal: 10 },

  // Main
  main: { flex: 1 },
  mainContent: { paddingBottom: 70 },
  pad: { paddingHorizontal: 24 },

  masthead: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 16, marginBottom: 22 },
  mastheadTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14 },
  mastheadTitle: { color: Colors.white, fontSize: 24, fontWeight: '800', letterSpacing: 0.2 },
  mastheadMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 5 },
  preparedBy: { alignItems: 'flex-end' },
  preparedByName: { color: Colors.primary, fontSize: 11.5, fontWeight: '700' },
  preparedByNote: { color: 'rgba(255,255,255,0.4)', fontSize: 10.5, marginTop: 2 },
  monthRow: { paddingTop: 16, gap: 6 },
  monthChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', minWidth: 62,
  },
  monthChipOn: { backgroundColor: Colors.primary },
  monthChipText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },
  monthChipTextOn: { color: Colors.primaryDeep },
  monthChipFc: { color: 'rgba(255,255,255,0.4)', fontSize: 8.5, marginTop: 1 },
  monthChipFcOn: { color: 'rgba(44,35,32,0.6)' },

  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FDF8EC',
    borderWidth: 1, borderColor: '#F0E2C0', borderRadius: 12, padding: 12, marginBottom: 16,
  },
  noteText: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },

  band: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 18 },
  bandCell: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, padding: 16,
  },
  bandCellWide: { flex: 1, minWidth: 180 },
  bandCellNarrow: { width: '47%', minWidth: 140 },
  bandKey: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  bandValue: { fontSize: 26, fontWeight: '800', marginTop: 6, color: Colors.textPrimary },
  bandDelta: { color: Colors.textMuted, fontSize: 11, marginTop: 5 },

  duo: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  duoStack: { flexDirection: 'column' },
  duoItem: { flex: 1, minWidth: 0 },

  panel: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, overflow: 'hidden', marginBottom: 16,
  },
  panelHead: {
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 12, fontWeight: '800',
    color: Colors.textPrimary, backgroundColor: '#FCFAF6',
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  panelBody: { paddingHorizontal: 14, paddingVertical: 12 },
  legend: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { color: Colors.textMuted, fontSize: 10.5 },

  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.borderLight, alignItems: 'stretch' },
  tHead: { backgroundColor: Colors.bgMid },
  tCell: { paddingHorizontal: 10, paddingVertical: 8, fontSize: 11.5, color: Colors.textSecondary },
  tNum: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  tStrong: { fontWeight: '700', color: Colors.textPrimary },
  hint: { color: Colors.textMuted, fontSize: 10.5 },
  pos: { color: Colors.viewed },
  neg: { color: Colors.error },
  recNum: { fontWeight: '800', color: Colors.primaryDark },

  prose: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, padding: 16,
  },
  proseText: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 20 },

  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 14 },
  ruleHeadText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', color: Colors.primaryDark },
  ruleLine: { flex: 1, height: 1, backgroundColor: Colors.border },

  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  card: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, padding: 16,
  },
  cardWide: { flex: 1, minWidth: 220 },
  cardNarrow: { width: '100%' },
  cardKey: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  cardValue: { fontSize: 21, fontWeight: '800', color: Colors.textPrimary, marginTop: 5 },
  cardSub: { color: Colors.textMuted, fontSize: 10.5, marginTop: 4 },
  cardNote: { color: Colors.textSecondary, fontSize: 11.5, lineHeight: 17, marginTop: 8 },

  subhead: { paddingHorizontal: 24, paddingVertical: 24, marginBottom: 22 },
  subheadTitle: { color: Colors.white, fontSize: 21, fontWeight: '800' },
  subheadLead: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 19, marginTop: 6, maxWidth: 720 },

  scenRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  scenChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgDeep,
  },
  scenChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  scenText: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary },
  scenTextOn: { color: Colors.primaryDeep },

  input: {
    borderWidth: 1, borderColor: '#F0E2C0', backgroundColor: '#FDF8EC', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: Colors.textPrimary, textAlign: 'right',
  },

  flagCritical: { alignSelf: 'flex-start', backgroundColor: Colors.error, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  flagCriticalText: { color: Colors.white, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
});
