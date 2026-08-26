import type { StatementCell, StatementRow, ClientSheets } from '../data/clientSheets';

// An FTG client workbook, as calculation rather than presentation.
//
// Everything here is pure: give it the sheets, a set of assumptions and the
// client's row map, and it hands back figures. No DOM, no state, no formatting
// decisions that belong to the screen — so the arithmetic can be checked on its
// own.
//
// Row numbers are the workbook's own, and THEY DIFFER BY CLIENT. Uniquely
// Enough puts Total Income on FS-R row 34; 1st Step to Greatness puts it on 36
// and carries a cost-of-services block Uniquely Enough has no equivalent for.
// So the map is an argument, never a constant here — reading row 34 of a
// workbook that keeps revenue on 36 produces figures that look entirely
// plausible and are wrong, which is the worst way for this to fail.
//
// Every entry point demands a map for that reason. There is deliberately no
// default: forgetting to pass one is a compile error rather than a silent
// mis-read.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Jul 2026 is the last booked month — August onward is forecast. */
export const LAST_ACTUAL = 6;

/**
 * Where each figure lives in one client's FS-R / FS-A.
 *
 * Read it off the workbook's own column B/C labels. Getting one of these wrong
 * does not throw — it quietly reports the neighbouring line — so check it
 * against the sheet rather than assuming another client's numbering carries
 * over.
 */
export interface RowMap {
  /** The revenue detail lines, in workbook order — what the commentary names. */
  income: number[];
  /**
   * The single revenue line a rebuilt forecast grows. Absent where revenue does
   * not work that way: 1st Step to Greatness carries three revenue lines on
   * three different rules, which is one of the reasons their figures come
   * straight from their workbook instead of being rebuilt here.
   */
  growRow?: number;
  totalIncome: number;
  /**
   * The rows the workbook's own TOTAL INCOME card adds up, read off its Dashboard
   * formula. It is not always the revenue total: Uniquely Enough's card adds
   * other income, 1st Step to Greatness' does not — so this is stated per client
   * rather than assumed.
   */
  headlineIncome: number[];
  /**
   * The rows behind the TOTAL EXPENSE card and the expense analysis, likewise
   * read off the workbook. 1st Step to Greatness has a cost-of-services block
   * that belongs here and that Uniquely Enough has no equivalent of; leaving it
   * out would understate their spend by the whole block.
   */
  headlineExpense: number[];
  /** Wages, taxes, benefits, contract labour — the rows added payroll splits across. */
  payroll: number[];
  /** The operating-expense block, first row to last, inclusive. */
  opexFirst: number;
  opexLast: number;
  /**
   * Rows inside that range that are subtotals rather than spending lines.
   *
   * STEER carries a "Total Payroll Block" at row 45, in the middle of its own
   * expenses, and its TOTAL EXPENSES formula steps over it —
   * SUM(AA40:AA44)+SUM(AA46:AA64). Counting it would double the payroll and would
   * name a subtotal as the month's biggest mover in the commentary.
   */
  opexSkip?: number[];
  totalOpex: number;
  // ── Below here: only where the workbook has them ──────────────────────────
  // Not every client's statement carries these. Access Granted Education runs
  // straight from total expenses to net income with no other-income block and no
  // operating-income subtotal at all. They are needed to REBUILD a forecast, so
  // a client missing them is shown their workbook's own figures instead.
  /** Net operating income: revenue less the opex block. */
  grossProfit?: number;
  otherIncome?: number[];
  totalOtherIncome?: number;
  otherExpense?: number[];
  totalOtherExpense?: number;
  netOther?: number;
  netIncome: number;
  cash: number;
  currentAssets: number;
  cards: number;
  currentLiabilities: number;
  draws: number;
  equity: number;
}

/** Uniquely Enough Behavioral Health LLC. Verified against their v2 workbook. */
export const UE_ROWS: RowMap = {
  income: [33], growRow: 33, totalIncome: 34,
  headlineIncome: [34, 66], headlineExpense: [60, 70],
  payroll: [37, 38, 39, 40],
  opexFirst: 37, opexLast: 59, totalOpex: 60, grossProfit: 62,
  otherIncome: [64, 65], totalOtherIncome: 66,
  otherExpense: [68, 69], totalOtherExpense: 70, netOther: 71,
  netIncome: 72,
  cash: 77, currentAssets: 78, cards: 85, currentLiabilities: 86,
  draws: 91, equity: 94,
};

/**
 * Where a client's Aug–Dec 2026 figures come from.
 *
 * 'rebuild' recomputes them here from the scenario levers, which requires the
 * client's workbook to forecast the way this model does.
 *
 * 'workbook' takes the figures the client's own workbook already computed. It is
 * for clients whose forecast works differently — 1st Step to Greatness prices
 * cost of services as a percentage of revenue and pays its payroll rows out of a
 * pool, neither of which this model does — where rebuilding would produce
 * confident, wrong numbers. Their scenario picker does nothing, and the
 * Assumptions tab says so.
 */
export type ForecastMode = 'rebuild' | 'workbook';

/** A map plus the row lists that follow from it, worked out once per call. */
interface Rows extends RowMap {
  /** Every operating-expense line. */
  opex: number[];
  /** The opex lines that are not payroll — these scale with cost growth. */
  grow: number[];
  /** Other income and other expense, which the forecast holds flat. */
  flat: number[];
}

const derive = (m: RowMap): Rows => {
  const skip = m.opexSkip ?? [];
  const opex = Array
    .from({ length: m.opexLast - m.opexFirst + 1 }, (_, k) => m.opexFirst + k)
    .filter(r => !skip.includes(r));
  return {
    ...m,
    opex,
    grow: opex.filter(r => !m.payroll.includes(r)),
    flat: [...(m.otherIncome ?? []), ...(m.otherExpense ?? [])],
  };
};

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

export function buildModel(sheets: ClientSheets, a: Assumptions, map: RowMap): Model {
  const R = derive(map);
  const fsa = byRow(sheets['FS-A']);
  const avg = (row: number) => avgFebJul(fsa, row);
  const i = SCENARIOS.indexOf(a.scenario);
  // 1 · historical basis
  const baseRev = avg(R.totalIncome);
  const payBlock = R.payroll.reduce((s, r) => s + avg(r), 0);
  const totalOpex = avg(R.totalOpex);
  // 5 · monthly impact
  const unlocked = a.recovered[i] * a.unbilledHrs * a.weeks * a.rate;
  const captureM = a.capture[i] / 12;
  const supCost = (a.supervisors[i] * a.supervisorCost) / 12;
  const salarySave = a.salarySave[i] / 12;
  // 7 · shares that split the added payroll across the four payroll rows
  const shares: Record<number, number> = {};
  R.payroll.forEach(r => { shares[r] = payBlock ? avg(r) / payBlock : 0; });
  return {
    index: i, baseRev, payBlock, totalOpex,
    netOther: R.netOther == null ? 0 : avg(R.netOther),
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
export function buildForecast(
  sheets: ClientSheets, a: Assumptions, map: RowMap, mode: ForecastMode = 'rebuild',
): Fsr {
  const R = derive(map);

  // Copied either way, so a caller can never write back into the source sheets.
  const asWorkbook = (): Fsr => {
    const out: Fsr = {};
    sheets['FS-R'].forEach(r => { out[r.r] = { ...r, y2025: [...r.y2025], y2026: [...r.y2026] }; });
    return out;
  };

  // The rebuild needs every one of these. Missing any of them means this model
  // cannot honestly produce the client's forecast, so their workbook's own
  // figures stand rather than a partial rebuild that looks complete.
  if (
    mode === 'workbook' ||
    R.growRow == null || R.grossProfit == null || R.netOther == null ||
    R.totalOtherIncome == null || R.totalOtherExpense == null ||
    R.otherIncome == null || R.otherExpense == null
  ) return asWorkbook();

  const m = buildModel(sheets, a, map);
  const fsa = byRow(sheets['FS-A']);
  const avg = (row: number) => avgFebJul(fsa, row);
  const fsr: Fsr = asWorkbook();
  const growRow = R.growRow;

  const set = (row: number, mo: number, v: number) => { if (fsr[row]) fsr[row].y2026[mo] = v; };
  const get = (row: number, mo: number) => (fsr[row]?.y2026?.[mo] ?? 0) as number;

  for (let mo = LAST_ACTUAL + 1; mo < 12; mo++) {
    const n = mo - LAST_ACTUAL;                      // 1..5, the workbook's row-6 offset
    set(growRow, mo, m.baseRev * Math.pow(1 + m.revGrowth, n) + m.revUplift);
    set(R.totalIncome, mo, get(growRow, mo));
    R.payroll.forEach(r => set(r, mo, avg(r) + m.addedPayroll * m.shares[r]));
    R.grow.forEach(r => set(r, mo, avg(r) * Math.pow(1 + m.costGrowth, n)));
    set(R.totalOpex, mo, R.opex.reduce((s, r) => s + get(r, mo), 0));
    set(R.grossProfit, mo, get(R.totalIncome, mo) - get(R.totalOpex, mo));
    R.flat.forEach(r => set(r, mo, avg(r)));
    set(R.totalOtherIncome, mo, R.otherIncome.reduce((s, r) => s + get(r, mo), 0));
    set(R.totalOtherExpense, mo, R.otherExpense.reduce((s, r) => s + get(r, mo), 0));
    set(R.netOther, mo, get(R.totalOtherIncome, mo) - get(R.totalOtherExpense, mo));
    set(R.netIncome, mo, get(R.grossProfit, mo) + get(R.netOther, mo));
  }
  return fsr;
}

// ── Reading the restated statements ──────────────────────────────────────────

/**
 * A statement cell is only a figure when it is actually a number.
 *
 * Battle Protection's workbook carries '#DIV/0!' across its whole Aug–Dec 2026
 * forecast, and a spreadsheet error must never become arithmetic here: adding it
 * produces NaN, and NaN formatted as money reads as a real, wrong figure.
 */
const num = (v: StatementCell | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

export const r26 = (fsr: Fsr, row: number, m: number) => num(fsr[row]?.y2026?.[m]);
export const r25 = (fsr: Fsr, row: number, m: number) => num(fsr[row]?.y2025?.[m]);

/** Whether the workbook actually states this figure, as opposed to erroring. */
export const stated = (fsr: Fsr, row: number, m: number): boolean => {
  const v = fsr[row]?.y2026?.[m];
  return typeof v === 'number' && Number.isFinite(v);
};

const income26 = (R: Rows, f: Fsr, m: number) => r26(f, R.totalIncome, m);
const income25 = (R: Rows, f: Fsr, m: number) => r25(f, R.totalIncome, m);
const expense26 = (R: Rows, f: Fsr, m: number) => R.headlineExpense.reduce((s, r) => s + r26(f, r, m), 0);
const expense25 = (R: Rows, f: Fsr, m: number) => R.headlineExpense.reduce((s, r) => s + r25(f, r, m), 0);
const payrollOf = (R: Rows, f: Fsr, m: number) => R.payroll.reduce((s, r) => s + r26(f, r, m), 0);
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
function drivers(R: Rows, f: Fsr, m: number) {
  const mk = (rows: number[]): Driver[] => rows
    .map(r => ({
      label: f[r]?.label || '',
      change: r26(f, r, m) - (m === 0 ? r25(f, r, 11) : r26(f, r, m - 1)),
    }))
    .filter(x => x.label);
  const exp = mk(R.opex), inc = mk(R.income);
  const max = (a: Driver[]) => a.reduce((x, y) => (y.change > x.change ? y : x), a[0]);
  const min = (a: Driver[]) => a.reduce((x, y) => (y.change < x.change ? y : x), a[0]);
  return { incUp: max(inc), incDown: min(inc), expUp: max(exp), expDown: min(exp) };
}

// ── The dashboard, as data ───────────────────────────────────────────────────

export interface Kpi { label: string; value: string; delta: string; deltaPct: string | null; positive: boolean }
export interface Series { current: number[]; prior: number[]; trend: number[] }
/**
 * A line of the income or expense analysis.
 *
 * A null means the workbook has nothing to compare against, not that the figure
 * is zero — 2G3B Eats and STEER posted the whole of 2025 as a single December
 * catch-up, so eleven of their prior-year months are simply absent.
 */
export interface AnalysisRow { metric: string; amount: number | null; variance: number | null; variancePct: number | null }
export interface InsightCard { title: string; value: string; sub: string; note: string }

export interface Dashboard {
  label: string;
  isForecast: boolean;
  /**
   * How many months of the prior year the books actually contain. Where this is
   * one, the year-on-year chart is a single bar and comparisons against it mean
   * nothing — the screen says so rather than leaving it to be misread.
   */
  priorYearMonths: number;
  /**
   * False when the workbook does not state this month's bottom line — it errored
   * rather than computing. The screen shows that plainly instead of drawing
   * cards from zeroes, which would read as a month of no costs and no profit.
   */
  available: boolean;
  income: number; expense: number; net: number; margin: number;
  kpis: Kpi[];
  incomeSeries: Series; expenseSeries: Series;
  incomeRows: AnalysisRow[]; expenseRows: AnalysisRow[];
  incomeComment: string; expenseComment: string;
  balanceCards: InsightCard[]; ratioCards: InsightCard[];
}

export function buildDashboard(f: Fsr, m: number, map: RowMap): Dashboard {
  const R = derive(map);
  const inc = income26(R, f, m), exp = expense26(R, f, m);
  const pI = m === 0 ? income25(R, f, 11) : income26(R, f, m - 1);
  const pE = m === 0 ? expense25(R, f, 11) : expense26(R, f, m - 1);

  // The workbook uses two definitions of income and shows both on one page.
  //
  // Its headline TOTAL INCOME card is revenue PLUS other income — Dashboard!C7
  // is 'Working Sheet'!AA12 + AA20 — while its Income Analysis table below is
  // revenue alone. Following only one of them would put this screen out of step
  // with the workbook the client is also reading, so both are kept: `head` for
  // the cards, `inc` for the table, the chart and the commentary.
  //
  // It also makes net income agree with FS-R row 72, which is revenue plus other
  // income less both expense blocks. Taking the card figure from revenue alone
  // understated it by exactly the month's other income.
  const headOf = (mm: number, ly = false) =>
    R.headlineIncome.reduce((t, r) => t + (ly ? r25(f, r, mm) : r26(f, r, mm)), 0);
  const head = headOf(m);
  const pH = m === 0 ? headOf(11, true) : headOf(m - 1);

  // Net income is the statement's own bottom line rather than income less
  // expense. For Uniquely Enough the two agree; for 1st Step to Greatness they
  // sit $0.31 apart, because their headline income card leaves out the other
  // income that their NET INCOME line includes. Reporting a figure the FS-R tab
  // contradicts is the thing worth avoiding.
  const net = r26(f, R.netIncome, m);
  const pN = m === 0 ? r25(f, R.netIncome, 11) : r26(f, R.netIncome, m - 1);
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
  const i26 = MONTHS.map((_, i) => (i <= m ? income26(R, f, i) : 0));
  const e26 = MONTHS.map((_, i) => (i <= m ? expense26(R, f, i) : 0));

  // Nothing on the prior-year side means nothing to compare to. Reporting a rise
  // "against" an absent month reads as growth that did not happen, and a
  // percentage off a zero base is not a percentage at all.
  //
  // The two rows carry different figures: the like-for-like row shows last
  // year's, which is what goes missing, while the year-to-date row shows this
  // year's, which stands on its own — so only its comparison is withheld.
  const rows = (a: number, p: number, ly: number, yc: number, yp: number): AnalysisRow[] => [
    { metric: `Month Actual (${label})`, amount: a, variance: null, variancePct: null },
    { metric: `vs Prior Month (${priorLabel(m)})`, amount: p, variance: a - p, variancePct: div(a - p, p) },
    ly === 0
      ? { metric: `vs Same Month LY (${lyLabel(m)})`, amount: null, variance: null, variancePct: null }
      : { metric: `vs Same Month LY (${lyLabel(m)})`, amount: ly, variance: a - ly, variancePct: div(a - ly, ly) },
    yp === 0
      ? { metric: `YTD 2026 (Jan-${MONTHS[m]}) vs same period 2025`, amount: yc, variance: null, variancePct: null }
      : { metric: `YTD 2026 (Jan-${MONTHS[m]}) vs same period 2025`, amount: yc, variance: yc - yp, variancePct: div(yc - yp, yp) },
  ];
  const y26i = sumTo(i => income26(R, f, i), m), y25i = sumTo(i => income25(R, f, i), m);
  const y26e = sumTo(i => expense26(R, f, i), m), y25e = sumTo(i => expense25(R, f, i), m);

  const d = drivers(R, f, m), dI = inc - pI, dE = exp - pE;
  const incomeComment = inc === 0
    ? `No income has been posted for ${label} yet — select a closed month to see commentary.`
    : `Income closed at ${kfmt(inc)} for ${label}, ${dI >= 0 ? 'higher' : 'lower'} by ${pct(Math.abs(div(dI, pI)))} `
      + `(${money(Math.abs(dI))}) vs ${priorLabel(m)}, mainly due to ${dI >= 0 ? 'higher' : 'lower'} `
      + `${(dI >= 0 ? d.incUp : d.incDown).label} (${money(Math.abs((dI >= 0 ? d.incUp : d.incDown).change))}). `
      + `Against ${lyLabel(m)}, income is ${inc >= income25(R, f, m) ? 'up' : 'down'} ${pct(Math.abs(div(inc - income25(R, f, m), income25(R, f, m))))}, `
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
    s += `. Against ${lyLabel(m)}, spend is ${exp >= expense25(R, f, m) ? 'up' : 'down'} ${pct(Math.abs(div(exp - expense25(R, f, m), expense25(R, f, m))))}, `
       + `and YTD 2026 spend of ${kfmt(y26e)} is ${pct(Math.abs(div(y26e - y25e, y25e)))} ${y26e >= y25e ? 'above' : 'below'} 2025`
       + `, leaving ${net >= 0 ? 'net income' : 'a net loss'} for the month of ${kfmt(Math.abs(net))}.`;
    expenseComment = s;
  }

  const cash = r26(f, R.cash, m), cards = r26(f, R.cards, m), equity = r26(f, R.equity, m);
  const pay = payrollOf(R, f, m);
  const ca = r26(f, R.currentAssets, m), cl = r26(f, R.currentLiabilities, m);
  const draws = -r26(f, R.draws, m);
  const prev = (row: number) => (m === 0 ? r25(f, row, 11) : r26(f, row, m - 1));
  const days = div(cash, pay / 30);

  return {
    label,
    isForecast: m > LAST_ACTUAL,
    priorYearMonths: MONTHS.reduce(
      (n, _, i) => n + (Math.abs(income25(R, f, i)) > 0.5 ? 1 : 0), 0),
    available: stated(f, R.netIncome, m),
    income: head, expense: exp, net, margin: div(net, head),
    kpis: [
      kpi('Total Income', head, pH, money(head), head - pH >= 0),
      kpi('Total Expense', exp, pE, money(exp), exp - pE <= 0),
      kpi('Net Income', net, pN, money(net), net >= 0),
      { label: 'Net Margin', value: pct(div(net, head)), delta: `Prior month ${pct(div(pN, pH))}`, deltaPct: null, positive: net >= 0 },
    ],
    incomeSeries: {
      current: i26,
      prior: MONTHS.map((_, i) => income25(R, f, i)),
      trend: i26.map((v, i) => (i > m ? 0 : i < 2 ? v : (i26[i] + i26[i - 1] + i26[i - 2]) / 3)),
    },
    expenseSeries: {
      current: e26,
      prior: MONTHS.map((_, i) => expense25(R, f, i)),
      trend: e26.map(v => v * 1.4),
    },
    incomeRows: rows(inc, pI, income25(R, f, m), y26i, y25i),
    expenseRows: rows(exp, pE, expense25(R, f, m), y26e, y25e),
    incomeComment,
    expenseComment,
    balanceCards: [
      {
        title: 'Cash & Bank', value: money(cash),
        sub: `Prior month ${money(prev(R.cash))} (${pct(div(cash, prev(R.cash)) - 1)})`,
        note: `Covers about ${days.toFixed(1)} days of payroll. ` + (cash < pay / 2
          ? 'That is under half a month — fund payroll and payroll taxes before any other spend.'
          : 'Hold at least 15 days of payroll as a floor.'),
      },
      {
        title: 'Credit Cards', value: money(cards), sub: `Prior month ${money(prev(R.cards))}`,
        note: `Card balances are ${pct(div(cards, cash))} of cash on hand. ` + (div(cards, cash) > 0.25
          ? 'Pay down monthly to avoid interest.'
          : 'Comfortably covered — keep clearing the balance in full each month.'),
      },
      {
        title: 'Total Equity', value: money(equity), sub: `Prior month ${money(prev(R.equity))}`,
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
        sub: `Prior month ${div(prev(R.currentAssets), prev(R.currentLiabilities)).toFixed(2)}x   |   Target 1.20x`,
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
        sub: `Prior mo. ${money(prev(R.currentAssets) - prev(R.currentLiabilities))}  |  Target: 1 mo payroll`,
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
export function forecastOutcome(f: Fsr, map: RowMap) {
  return [
    { label: 'Jan–Jul 2026 net income (actual, already booked)', amount: sumRange(f, map.netIncome, 0, LAST_ACTUAL), strong: false },
    { label: 'Aug–Dec 2026 revenue (forecast)', amount: sumRange(f, map.totalIncome, LAST_ACTUAL + 1, 11), strong: false },
    { label: 'Aug–Dec 2026 net income (forecast)', amount: sumRange(f, map.netIncome, LAST_ACTUAL + 1, 11), strong: false },
    { label: 'FY2026 revenue (actual + forecast)', amount: sumRange(f, map.totalIncome, 0, 11), strong: true },
    { label: 'FY2026 net income (actual + forecast)', amount: sumRange(f, map.netIncome, 0, 11), strong: true },
  ];
}

