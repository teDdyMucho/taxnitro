import type { StatementRow, ClientSheets } from '../data/clientSheets';

// The Uniquely Enough workbook, as calculation rather than presentation.
//
// Everything here is pure: give it the sheets and a set of assumptions and it
// hands back figures. No DOM, no state, no formatting decisions that belong to
// the screen — so the arithmetic can be checked on its own.
//
// Row numbers are the workbook's own. FS-R row 34 is Total Income, 60 is Total
// Operating Expense, 72 is Net Income, and so on; the workbook's formulas
// address those rows, so we do too.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Jul 2026 is the last booked month — August onward is forecast. */
export const LAST_ACTUAL = 6;

const ROW = {
  income: 33, totalIncome: 34,
  payroll: [37, 38, 39, 40],
  opexFirst: 37, opexLast: 59, totalOpex: 60, grossProfit: 62,
  otherIncome: [64, 65], totalOtherIncome: 66,
  otherExpense: [68, 69], totalOtherExpense: 70, netOther: 71,
  netIncome: 72,
  cash: 77, currentAssets: 78, cards: 85, currentLiabilities: 86,
  draws: 91, equity: 94,
};

const PAYROLL_ROWS = ROW.payroll;
const OPEX_ROWS = Array.from({ length: ROW.opexLast - ROW.opexFirst + 1 }, (_, k) => ROW.opexFirst + k);
const GROW_ROWS = OPEX_ROWS.filter(r => !PAYROLL_ROWS.includes(r));
const FLAT_ROWS = [64, 65, 68, 69];

// ── Formatting ───────────────────────────────────────────────────────────────
// Kept beside the model because every surface shows the same shapes: whole
// dollars, one decimal on a percentage, thousands on a chart.

const nf = (n: number) => Math.abs(Math.round(n)).toLocaleString();
export const money = (n: number | null | undefined) =>
  n == null ? '–' : (n < 0 ? '-$' : '$') + nf(n);
export const kfmt = (n: number) => (n < 0 ? '-$' : '$') + nf(Math.abs(n) / 1000) + 'K';
export const pct = (n: number) => (n * 100).toFixed(1) + '%';
export const signed = (n: number) => (n >= 0 ? '' : '-') + '$' + nf(n);
/** Every ratio in the workbook is IFERROR(…, 0) — divide by zero reads as zero. */
export const div = (a: number, b: number) => (b ? a / b : 0);

// ── Assumptions ──────────────────────────────────────────────────────────────
// Section numbers match the workbook's own ASSUMPTIONS tab.

export const SCENARIOS = ['Conservative', 'Target', 'Stretch'] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** The three-column levers: one value per scenario. */
export type LeverKey = 'recovered' | 'supervisors' | 'capture' | 'salarySave' | 'revGrowth' | 'costGrowth';
/** The single-value inputs shared by all three scenarios. */
export type SharedKey = 'rate' | 'unbilledHrs' | 'weeks' | 'supervisorCost';

export interface Assumptions {
  scenario: Scenario;
  recovered: number[];
  supervisors: number[];
  capture: number[];
  salarySave: number[];
  revGrowth: number[];
  costGrowth: number[];
  rate: number;
  unbilledHrs: number;
  weeks: number;
  supervisorCost: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  scenario: 'Target',
  // 3 · scenario levers, one column per scenario [Conservative, Target, Stretch]
  recovered: [0.40, 0.70, 1.00],      // % of unbilled clinician hours recovered
  supervisors: [1, 2, 2],             // supervisors to hire
  capture: [10000, 30000, 60000],     // capture all-time recovery, $/yr
  salarySave: [5000, 15000, 30000],   // move-to-salary labour savings, $/yr
  revGrowth: [0.005, 0.010, 0.015],   // base monthly revenue growth
  costGrowth: [0.005, 0.000, -0.005], // non-payroll cost growth
  // 4 · shared inputs
  rate: 70, unbilledHrs: 92, weeks: 4.33, supervisorCost: 85000,
};

export interface Model {
  index: number;
  baseRev: number; payBlock: number; totalOpex: number; netOther: number;
  unlocked: number; captureM: number; revUplift: number;
  supCost: number; salarySave: number; addedPayroll: number;
  revGrowth: number; costGrowth: number;
  shares: Record<number, number>;
}

export type Fsr = Record<number, StatementRow>;

const byRow = (rows: StatementRow[]): Fsr => {
  const m: Fsr = {};
  rows.forEach(r => { m[r.r] = r; });
  return m;
};

/** Average of the last six actual months, Feb–Jul (workbook: AVERAGE(U:Z)). */
const avgFebJul = (fsa: Fsr, row: number) => {
  const v = (fsa[row]?.y2026 ?? []).slice(1, 7).filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};

export function buildModel(sheets: ClientSheets, a: Assumptions): Model {
  const fsa = byRow(sheets['FS-A']);
  const avg = (row: number) => avgFebJul(fsa, row);
  const i = SCENARIOS.indexOf(a.scenario);
  // 1 · historical basis
  const baseRev = avg(ROW.totalIncome);
  const payBlock = PAYROLL_ROWS.reduce((s, r) => s + avg(r), 0);
  const totalOpex = avg(ROW.totalOpex);
  // 5 · monthly impact
  const unlocked = a.recovered[i] * a.unbilledHrs * a.weeks * a.rate;
  const captureM = a.capture[i] / 12;
  const supCost = (a.supervisors[i] * a.supervisorCost) / 12;
  const salarySave = a.salarySave[i] / 12;
  // 7 · shares that split the added payroll across the four payroll rows
  const shares: Record<number, number> = {};
  PAYROLL_ROWS.forEach(r => { shares[r] = payBlock ? avg(r) / payBlock : 0; });
  return {
    index: i, baseRev, payBlock, totalOpex, netOther: avg(ROW.netOther),
    unlocked, captureM, revUplift: unlocked + captureM,
    supCost, salarySave, addedPayroll: supCost - salarySave,
    revGrowth: a.revGrowth[i], costGrowth: a.costGrowth[i], shares,
  };
}

/**
 * FS-R with Aug–Dec 2026 rebuilt from the assumptions. Mirrors the workbook
 * cell for cell:
 *   revenue = base * (1 + growth)^n + uplift
 *   payroll = avg(Feb–Jul) + addedPayroll * share
 *   other   = avg(Feb–Jul) * (1 + costGrowth)^n
 *   flat    = avg(Feb–Jul)
 * Returns a fresh copy; the source sheets are never mutated.
 */
export function buildForecast(sheets: ClientSheets, a: Assumptions): Fsr {
  const m = buildModel(sheets, a);
  const fsa = byRow(sheets['FS-A']);
  const avg = (row: number) => avgFebJul(fsa, row);
  const fsr: Fsr = {};
  sheets['FS-R'].forEach(r => { fsr[r.r] = { ...r, y2025: [...r.y2025], y2026: [...r.y2026] }; });

  const set = (row: number, mo: number, v: number) => { if (fsr[row]) fsr[row].y2026[mo] = v; };
  const get = (row: number, mo: number) => (fsr[row]?.y2026?.[mo] ?? 0) as number;

  for (let mo = LAST_ACTUAL + 1; mo < 12; mo++) {
    const n = mo - LAST_ACTUAL;                      // 1..5, the workbook's row-6 offset
    set(ROW.income, mo, m.baseRev * Math.pow(1 + m.revGrowth, n) + m.revUplift);
    set(ROW.totalIncome, mo, get(ROW.income, mo));
    PAYROLL_ROWS.forEach(r => set(r, mo, avg(r) + m.addedPayroll * m.shares[r]));
    GROW_ROWS.forEach(r => set(r, mo, avg(r) * Math.pow(1 + m.costGrowth, n)));
    set(ROW.totalOpex, mo, OPEX_ROWS.reduce((s, r) => s + get(r, mo), 0));
    set(ROW.grossProfit, mo, get(ROW.totalIncome, mo) - get(ROW.totalOpex, mo));
    FLAT_ROWS.forEach(r => set(r, mo, avg(r)));
    set(ROW.totalOtherIncome, mo, ROW.otherIncome.reduce((s, r) => s + get(r, mo), 0));
    set(ROW.totalOtherExpense, mo, ROW.otherExpense.reduce((s, r) => s + get(r, mo), 0));
    set(ROW.netOther, mo, get(ROW.totalOtherIncome, mo) - get(ROW.totalOtherExpense, mo));
    set(ROW.netIncome, mo, get(ROW.grossProfit, mo) + get(ROW.netOther, mo));
  }
  return fsr;
}

// ── Reading the restated statements ──────────────────────────────────────────

export const r26 = (fsr: Fsr, row: number, m: number) => (fsr[row]?.y2026?.[m] ?? 0) as number;
export const r25 = (fsr: Fsr, row: number, m: number) => (fsr[row]?.y2025?.[m] ?? 0) as number;

const income26 = (f: Fsr, m: number) => r26(f, ROW.totalIncome, m);
const income25 = (f: Fsr, m: number) => r25(f, ROW.totalIncome, m);
const expense26 = (f: Fsr, m: number) => r26(f, ROW.totalOpex, m) + r26(f, ROW.totalOtherExpense, m);
const expense25 = (f: Fsr, m: number) => r25(f, ROW.totalOpex, m) + r25(f, ROW.totalOtherExpense, m);
const payrollOf = (f: Fsr, m: number) => PAYROLL_ROWS.reduce((s, r) => s + r26(f, r, m), 0);
const sumTo = (fn: (m: number) => number, m: number) => {
  let s = 0;
  for (let i = 0; i <= m; i++) s += fn(i);
  return s;
};

/** Total of one row across a month range — used by the Assumptions outcome panel. */
export const sumRange = (f: Fsr, row: number, a: number, b: number) => {
  let s = 0;
  for (let i = a; i <= b; i++) s += r26(f, row, i);
  return s;
};

const priorLabel = (m: number) => (m === 0 ? 'Dec 2025' : MONTHS[m - 1] + ' 2026');
const lyLabel = (m: number) => MONTHS[m] + ' 2025';

interface Driver { label: string; change: number }

/** The biggest mover in each direction — the workbook names these in its commentary. */
function drivers(f: Fsr, m: number) {
  const mk = (rows: number[]): Driver[] => rows
    .map(r => ({
      label: f[r]?.label || '',
      change: r26(f, r, m) - (m === 0 ? r25(f, r, 11) : r26(f, r, m - 1)),
    }))
    .filter(x => x.label);
  const exp = mk(OPEX_ROWS), inc = mk([ROW.income]);
  const max = (a: Driver[]) => a.reduce((x, y) => (y.change > x.change ? y : x), a[0]);
  const min = (a: Driver[]) => a.reduce((x, y) => (y.change < x.change ? y : x), a[0]);
  return { incUp: max(inc), incDown: min(inc), expUp: max(exp), expDown: min(exp) };
}

// ── The dashboard, as data ───────────────────────────────────────────────────

export interface Kpi { label: string; value: string; delta: string; deltaPct: string | null; positive: boolean }
export interface Series { current: number[]; prior: number[]; trend: number[] }
export interface AnalysisRow { metric: string; amount: number; variance: number | null; variancePct: number | null }
export interface InsightCard { title: string; value: string; sub: string; note: string }

export interface Dashboard {
  label: string;
  isForecast: boolean;
  income: number; expense: number; net: number; margin: number;
  kpis: Kpi[];
  incomeSeries: Series; expenseSeries: Series;
  incomeRows: AnalysisRow[]; expenseRows: AnalysisRow[];
  incomeComment: string; expenseComment: string;
  balanceCards: InsightCard[]; ratioCards: InsightCard[];
}

export function buildDashboard(f: Fsr, m: number): Dashboard {
  const inc = income26(f, m), exp = expense26(f, m), net = inc - exp;
  const pI = m === 0 ? income25(f, 11) : income26(f, m - 1);
  const pE = m === 0 ? expense25(f, 11) : expense26(f, m - 1);
  const pN = pI - pE;
  const label = MONTHS[m] + ' 2026';

  const kpi = (name: string, cur: number, prev: number, value: string, positive: boolean): Kpi => ({
    label: name,
    value,
    delta: prev ? `vs ${priorLabel(m)}` : '',
    deltaPct: prev ? `${cur - prev >= 0 ? '▲' : '▼'} ${pct(Math.abs(div(cur - prev, prev)))}` : null,
    positive,
  });

  // Series stop at the selected month: a chart should not draw months the
  // reader has not opened yet.
  const i26 = MONTHS.map((_, i) => (i <= m ? income26(f, i) : 0));
  const e26 = MONTHS.map((_, i) => (i <= m ? expense26(f, i) : 0));

  const rows = (a: number, p: number, ly: number, yc: number, yp: number): AnalysisRow[] => [
    { metric: `Month Actual (${label})`, amount: a, variance: null, variancePct: null },
    { metric: `vs Prior Month (${priorLabel(m)})`, amount: p, variance: a - p, variancePct: div(a - p, p) },
    { metric: `vs Same Month LY (${lyLabel(m)})`, amount: ly, variance: a - ly, variancePct: div(a - ly, ly) },
    { metric: `YTD 2026 (Jan-${MONTHS[m]}) vs same period 2025`, amount: yc, variance: yc - yp, variancePct: div(yc - yp, yp) },
  ];
  const y26i = sumTo(i => income26(f, i), m), y25i = sumTo(i => income25(f, i), m);
  const y26e = sumTo(i => expense26(f, i), m), y25e = sumTo(i => expense25(f, i), m);

  const d = drivers(f, m), dI = inc - pI, dE = exp - pE;
  const incomeComment = inc === 0
    ? `No income has been posted for ${label} yet — select a closed month to see commentary.`
    : `Income closed at ${kfmt(inc)} for ${label}, ${dI >= 0 ? 'higher' : 'lower'} by ${pct(Math.abs(div(dI, pI)))} `
      + `(${money(Math.abs(dI))}) vs ${priorLabel(m)}, mainly due to ${dI >= 0 ? 'higher' : 'lower'} `
      + `${(dI >= 0 ? d.incUp : d.incDown).label} (${money(Math.abs((dI >= 0 ? d.incUp : d.incDown).change))}). `
      + `Against ${lyLabel(m)}, income is ${inc >= income25(f, m) ? 'up' : 'down'} ${pct(Math.abs(div(inc - income25(f, m), income25(f, m))))}, `
      + `while YTD 2026 of ${kfmt(y26i)} is ${pct(Math.abs(div(y26i - y25i, y25i)))} ${y26i >= y25i ? 'ahead of' : 'behind'} the same period in 2025.`;

  let expenseComment: string;
  if (exp === 0) {
    expenseComment = `No expenses have been posted for ${label} yet — select a closed month to see commentary.`;
  } else {
    const up = dE >= 0, drv = up ? d.expUp : d.expDown, off = up ? d.expDown : d.expUp;
    let s = `Expenses closed at ${kfmt(exp)} for ${label}, ${up ? 'higher' : 'lower'} by ${pct(Math.abs(div(dE, pE)))} `
          + `(${money(Math.abs(dE))}) vs ${priorLabel(m)}, mainly due to ${up ? 'higher' : 'lower'} ${drv.label} (${money(Math.abs(drv.change))})`;
    // Only named when a line actually moved the other way — as the workbook does.
    if (up && off.change < 0) s += `, partially offset by lower ${off.label} (${money(Math.abs(off.change))})`;
    if (!up && off.change > 0) s += `, partially offset by higher ${off.label} (${money(off.change)})`;
    s += `. Against ${lyLabel(m)}, spend is ${exp >= expense25(f, m) ? 'up' : 'down'} ${pct(Math.abs(div(exp - expense25(f, m), expense25(f, m))))}, `
       + `and YTD 2026 spend of ${kfmt(y26e)} is ${pct(Math.abs(div(y26e - y25e, y25e)))} ${y26e >= y25e ? 'above' : 'below'} 2025`
       + `, leaving ${net >= 0 ? 'net income' : 'a net loss'} for the month of ${kfmt(Math.abs(net))}.`;
    expenseComment = s;
  }

  const cash = r26(f, ROW.cash, m), cards = r26(f, ROW.cards, m), equity = r26(f, ROW.equity, m);
  const pay = payrollOf(f, m);
  const ca = r26(f, ROW.currentAssets, m), cl = r26(f, ROW.currentLiabilities, m);
  const draws = -r26(f, ROW.draws, m);
  const prev = (row: number) => (m === 0 ? r25(f, row, 11) : r26(f, row, m - 1));
  const days = div(cash, pay / 30);

  return {
    label,
    isForecast: m > LAST_ACTUAL,
    income: inc, expense: exp, net, margin: div(net, inc),
    kpis: [
      kpi('Total Income', inc, pI, money(inc), inc - pI >= 0),
      kpi('Total Expense', exp, pE, money(exp), exp - pE <= 0),
      kpi('Net Income', net, pN, money(net), net >= 0),
      { label: 'Net Margin', value: pct(div(net, inc)), delta: `Prior month ${pct(div(pN, pI))}`, deltaPct: null, positive: net >= 0 },
    ],
    incomeSeries: {
      current: i26,
      prior: MONTHS.map((_, i) => income25(f, i)),
      trend: i26.map((v, i) => (i > m ? 0 : i < 2 ? v : (i26[i] + i26[i - 1] + i26[i - 2]) / 3)),
    },
    expenseSeries: {
      current: e26,
      prior: MONTHS.map((_, i) => expense25(f, i)),
      trend: e26.map(v => v * 1.4),
    },
    incomeRows: rows(inc, pI, income25(f, m), y26i, y25i),
    expenseRows: rows(exp, pE, expense25(f, m), y26e, y25e),
    incomeComment,
    expenseComment,
    balanceCards: [
      {
        title: 'Cash & Bank', value: money(cash),
        sub: `Prior month ${money(prev(ROW.cash))} (${pct(div(cash, prev(ROW.cash)) - 1)})`,
        note: `Covers about ${days.toFixed(1)} days of payroll. ` + (cash < pay / 2
          ? 'That is under half a month — fund payroll and payroll taxes before any other spend.'
          : 'Hold at least 15 days of payroll as a floor.'),
      },
      {
        title: 'Credit Cards', value: money(cards), sub: `Prior month ${money(prev(ROW.cards))}`,
        note: `Card balances are ${pct(div(cards, cash))} of cash on hand. ` + (div(cards, cash) > 0.25
          ? 'Pay down monthly to avoid interest.'
          : 'Comfortably covered — keep clearing the balance in full each month.'),
      },
      {
        title: 'Total Equity', value: money(equity), sub: `Prior month ${money(prev(ROW.equity))}`,
        note: `Book equity after owner draws of ${money(draws)} YTD. ` + (equity > 0
          ? 'Positive and building.'
          : 'Negative — retained losses exceed contributed capital.'),
      },
      {
        title: 'Payroll Cost (Month)', value: money(pay), sub: `Revenue ${money(inc)}   |   Target 50%`,
        note: `Payroll, benefits and contract labour are ${pct(div(pay, inc))} of this month's revenue. ` + (div(pay, inc) > 0.6
          ? 'Well above the 50% goal — the main margin lever.'
          : 'At or near the 50% goal.'),
      },
    ],
    ratioCards: [
      {
        title: 'Current Ratio', value: div(ca, cl).toFixed(2) + 'x',
        sub: `Prior month ${div(prev(ROW.currentAssets), prev(ROW.currentLiabilities)).toFixed(2)}x   |   Target 1.20x`,
        note: 'Current assets divided by current liabilities — can the company pay what falls due within a year? '
          + (div(ca, cl) < 1
            ? 'Below 1.00x it cannot, and lenders or bonding agents decline at this level.'
            : 'At or above 1.00x — keep building toward 1.20x.'),
      },
      {
        title: 'Payroll % of Revenue', value: pct(div(pay, inc)), sub: 'Target 50.0%',
        note: 'Payroll, benefits and contract labour as a share of revenue — the single biggest margin lever for a clinician-led practice.',
      },
      {
        title: 'Working Capital', value: money(ca - cl),
        sub: `Prior mo. ${money(prev(ROW.currentAssets) - prev(ROW.currentLiabilities))}  |  Target: 1 mo payroll`,
        note: 'Current assets less current liabilities — the cash cushion for running the business. '
          + (ca - cl < 0
            ? 'Negative, which means payroll taxes and loans are financing operations, so growth has to come from margin rather than cash.'
            : 'Positive — hold at least one month of payroll here.'),
      },
      {
        title: 'Days of Payroll Covered', value: days.toFixed(1),
        sub: `Monthly payroll ${money(pay)}   |   Target 15 days`,
        note: "How long the bank balance would cover payroll at this month's payroll cost.",
      },
    ],
  };
}

// ── Recommendations ──────────────────────────────────────────────────────────

export interface Recommendation { n: number; action: string; why: string; metric: string; priority: string }

export const RECOMMENDATIONS: Recommendation[] = [
  {
    n: 1, action: 'Split clinician wages into direct service delivery and admin',
    why: 'Gross Profit currently equals revenue because no cost of revenue is classified, so true service margin is invisible. Without it you cannot tell whether a full schedule is actually profitable, or price sessions and payer contracts with confidence.',
    metric: 'Service margin % / Direct labour ratio', priority: 'CRITICAL',
  },
  {
    n: 2, action: 'Clinician-level P&L (billable hours, utilisation, direct pay, margin)',
    why: 'Growth only helps if each clinician is profitable. Clinician-level margin shows whose caseload to rebuild, whose rate to revisit, and where spare session capacity actually sits before hiring again.',
    metric: 'Margin % per clinician / Utilisation', priority: 'CRITICAL',
  },
  {
    n: 3, action: 'Bill rate vs pay rate spread and unbilled-hour tracking',
    why: 'The spread between the billed rate and clinician pay per session hour, plus no-shows, late cancellations and the roughly 92 unbilled clinician hours per week, is where the payroll-to-revenue ratio is decided.',
    metric: 'Spread $/hr / Unbilled hours recovered', priority: 'CRITICAL',
  },
];

// ── Assumptions tab, as data ─────────────────────────────────────────────────

export interface LeverDef { label: string; unit: string; key: LeverKey; isPct: boolean }

export const LEVERS: LeverDef[] = [
  { label: 'A · % of unbilled clinician hours recovered', unit: '%', key: 'recovered', isPct: true },
  { label: 'A · supervisors to hire', unit: 'count', key: 'supervisors', isPct: false },
  { label: 'B · capture all-time recovery', unit: '$/yr', key: 'capture', isPct: false },
  { label: 'C · move-to-salary labor savings', unit: '$/yr', key: 'salarySave', isPct: false },
  { label: 'D · base monthly revenue growth', unit: '%/mo', key: 'revGrowth', isPct: true },
  { label: 'E · non-payroll cost growth', unit: '%/mo', key: 'costGrowth', isPct: true },
];

export const SHARED_INPUTS: { label: string; key: SharedKey }[] = [
  { label: 'Blended billable rate ($/hr)', key: 'rate' },
  { label: 'Unbilled clinician hours / week', key: 'unbilledHrs' },
  { label: 'Weeks per month', key: 'weeks' },
  { label: 'Loaded cost per supervisor ($/yr)', key: 'supervisorCost' },
];

/** 1 · Historical basis — the last six actual months. */
export function historicalBasis(m: Model) {
  return [
    { label: 'Fee for service revenue', amount: m.baseRev, share: null as number | null },
    { label: 'Payroll block (wages, taxes, benefits, contract labor)', amount: m.payBlock, share: div(m.payBlock, m.baseRev) },
    { label: 'Non-payroll operating cost', amount: m.totalOpex - m.payBlock, share: div(m.totalOpex - m.payBlock, m.baseRev) },
    { label: 'Total operating cost', amount: m.totalOpex, share: div(m.totalOpex, m.baseRev) },
    { label: 'Net other income / (expense)', amount: m.netOther, share: null },
    {
      label: 'Net income — current run-rate',
      amount: m.baseRev - m.totalOpex + m.netOther,
      share: div(m.baseRev - m.totalOpex + m.netOther, m.baseRev),
    },
  ];
}

/** 5 · Monthly impact by scenario — the same arithmetic run for all three columns. */
export function monthlyImpact(a: Assumptions) {
  const unlocked = (i: number) => a.recovered[i] * a.unbilledHrs * a.weeks * a.rate;
  const capture = (i: number) => a.capture[i] / 12;
  const supervisor = (i: number) => (a.supervisors[i] * a.supervisorCost) / 12;
  const salary = (i: number) => a.salarySave[i] / 12;
  return [
    { label: 'Unlocked billing / month', fn: unlocked, strong: false },
    { label: 'Capture recovery / month', fn: capture, strong: false },
    { label: 'Revenue uplift / month', fn: (i: number) => unlocked(i) + capture(i), strong: true },
    { label: 'Supervisor cost / month', fn: supervisor, strong: false },
    { label: 'Salary savings / month', fn: salary, strong: false },
    { label: 'Added payroll / month (net)', fn: (i: number) => supervisor(i) - salary(i), strong: true },
  ];
}

/** 6 · What actually feeds the FS-R forecast. */
export function appliedToForecast(m: Model) {
  return [
    { label: 'Revenue uplift / month — applied', value: money(m.revUplift) },
    { label: 'Added payroll / month — applied', value: money(m.addedPayroll) },
    { label: 'Base monthly revenue run-rate', value: money(m.baseRev) },
    { label: 'Base monthly revenue growth — applied', value: pct(m.revGrowth) },
    { label: 'Non-payroll cost growth — applied', value: pct(m.costGrowth) },
  ];
}

/** 8 · Forecast outcome — live from the rebuilt FS-R. */
export function forecastOutcome(f: Fsr) {
  return [
    { label: 'Jan–Jul 2026 net income (actual, already booked)', amount: sumRange(f, ROW.netIncome, 0, LAST_ACTUAL), strong: false },
    { label: 'Aug–Dec 2026 revenue (forecast)', amount: sumRange(f, ROW.totalIncome, LAST_ACTUAL + 1, 11), strong: false },
    { label: 'Aug–Dec 2026 net income (forecast)', amount: sumRange(f, ROW.netIncome, LAST_ACTUAL + 1, 11), strong: false },
    { label: 'FY2026 revenue (actual + forecast)', amount: sumRange(f, ROW.totalIncome, 0, 11), strong: true },
    { label: 'FY2026 net income (actual + forecast)', amount: sumRange(f, ROW.netIncome, 0, 11), strong: true },
  ];
}

export { ROW };
