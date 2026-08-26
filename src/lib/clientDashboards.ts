import type { ClientSheets } from '../data/clientSheets';
import { UE_ROWS, type ForecastMode, type RowMap } from './ueModel';

// Which clients have a financial dashboard, and where its figures come from.
//
// A dashboard is built from that client's own workbook, so a client only has one
// once that work is done. Everyone else simply has no dashboard — never somebody
// else's, which is why this is an explicit list rather than a default.
//
// Adding a client is three steps and no new screen: put their workbook here as
// src/data/<name>Sheets.ts, read their row map off the workbook, then add an
// entry below. The screen that draws it does not know or care which client it is
// showing.
//
// The row map is per-client and cannot be skipped. FTG's template is not
// numbered identically for everyone — Uniquely Enough keeps Total Income on FS-R
// row 34, 1st Step to Greatness on row 36 — and a wrong map reports the
// neighbouring line rather than failing, so it has to be read off each workbook
// and checked against it.
//
// Clients are matched on their name or email rather than an id, because the same
// practice appears under slightly different names across the books and the portal
// ("Uniquely Enough LLC" in one, a person's name and a company email in the other).

export interface ClientDashboard {
  /** Stable id for this dashboard. */
  key: string;
  /** Shown on the button that opens it. */
  label: string;
  /** The business, as it should read at the top of their report. */
  name: string;
  /** The line under it — usually the rest of the legal name. */
  subtitle: string;
  /**
   * That client's workbook. A function rather than the data itself, so one
   * client's financials load only when their report is opened rather than
   * riding along in the bundle every other user downloads.
   */
  load: () => Promise<ClientSheets>;
  /**
   * Where the figures sit in THIS client's FS-R / FS-A. Read off their workbook;
   * see RowMap. Never reuse another client's.
   */
  rows: RowMap;
  /**
   * Where their Aug–Dec 2026 figures come from. 'rebuild' recomputes them from
   * the scenario levers, which only holds for a workbook that forecasts the way
   * this model does; 'workbook' shows the figures their own workbook computed
   * and leaves the scenario picker inert, which the Assumptions tab says plainly.
   */
  forecast: ForecastMode;
}

/**
 * 1st Step to Greatness.
 *
 * Read off their workbook, which is laid out differently from Uniquely Enough's
 * in more than its numbering: three revenue lines rather than one, and a
 * cost-of-services block that belongs in total spend — their TOTAL EXPENSE card
 * is rows 42 + 69 + 79, and dropping row 42 would understate every month.
 *
 * Their forecast is theirs too: cost of services is priced as a share of
 * revenue and the payroll rows are paid out of a pool, neither of which this
 * model does. Hence 'workbook' below.
 */
/**
 * 2G3B Eats LLC.
 *
 * Same family as 1st Step to Greatness — a cost-of-services block ahead of the
 * expenses — but wider: five revenue lines and a payroll pool of five rows,
 * which is what their own FS-R row 29 counts as payroll and labour.
 *
 * Their forecast is seasonal: revenue is an event index applied to a monthly
 * base, cost of services is a share of that revenue, and payroll runs through
 * the same index. None of that is what this model does, so their figures come
 * from their workbook.
 *
 * They have no 2025 in the books, so the prior-year comparisons read as blank
 * rather than as a fall — which is what their own workbook shows too.
 */
/**
 * Access Granted Education.
 *
 * The plainest statement of the four: revenue, expenses, net income, and
 * nothing between them. No cost-of-services block, no other income or expense,
 * and no operating-income subtotal — so those fields are simply absent rather
 * than pointed at a row that means something else.
 *
 * Their forecast switches on a control in the workbook and nets scenario
 * savings off each payroll line, so their figures come from the workbook.
 */
/**
 * Battle Protection Agency.
 *
 * Same shape as Uniquely Enough — no cost-of-services block — on different rows,
 * with two revenue lines that grow at their own rates and payroll priced as a
 * share of revenue, so their figures come from their workbook.
 *
 * One deliberate departure from their Dashboard tab: its TOTAL INCOME card is
 * revenue alone, so its NET INCOME card (income less expense) drops the other
 * income that its own FS-R row 76 includes — they disagree by up to $147 in the
 * months where other income is not nil. Counting other income here keeps this
 * screen tying to the statement rather than to a card that contradicts it. July
 * 2026, the month on the report, has no other income, so both read $106,777.
 */
/**
 * STEER LLC.
 *
 * Revenue, expenses, net income — no cost of services and no other-income block.
 * The one thing to watch is row 45, "Total Payroll Block": a subtotal sitting in
 * the middle of the expense range. Their own TOTAL EXPENSES steps over it
 * (SUM(AA40:AA44)+SUM(AA46:AA64)), so it is skipped here too.
 *
 * Their forecast drives the payroll block from an assumption and then splits it
 * across the individual payroll lines, which is the reverse of how this model
 * works, so their figures come from their workbook.
 */
const STEER_ROWS: RowMap = {
  income: [33, 34], totalIncome: 35,
  headlineIncome: [35], headlineExpense: [65],
  payroll: [40, 41, 42, 43, 44],
  opexFirst: 40, opexLast: 64, opexSkip: [45], totalOpex: 65, grossProfit: 67,
  netIncome: 68,
  cash: 72, currentAssets: 74, cards: 78, currentLiabilities: 80,
  draws: 88, equity: 92,
};

const BATTLE_PROTECTION_ROWS: RowMap = {
  income: [35, 36, 37], totalIncome: 38,
  headlineIncome: [38, 69], headlineExpense: [64, 74],
  payroll: [48, 49, 50],
  opexFirst: 43, opexLast: 63, totalOpex: 64, grossProfit: 66,
  otherIncome: [68], totalOtherIncome: 69,
  otherExpense: [71, 72, 73], totalOtherExpense: 74, netOther: 75,
  netIncome: 76,
  cash: 84, currentAssets: 87, cards: 95, currentLiabilities: 97,
  draws: 101, equity: 105,
};

const ACCESS_GRANTED_ROWS: RowMap = {
  income: [33, 34, 35], totalIncome: 36,
  headlineIncome: [36], headlineExpense: [61],
  payroll: [39, 40, 41, 42, 43],
  opexFirst: 39, opexLast: 60, totalOpex: 61,
  netIncome: 63,
  cash: 68, currentAssets: 71, cards: 76, currentLiabilities: 79,
  draws: 85, equity: 88,
};

const TWO_G_THREE_B_ROWS: RowMap = {
  income: [33, 34, 35, 36, 37], totalIncome: 38,
  headlineIncome: [38], headlineExpense: [48, 93, 103],
  payroll: [52, 53, 54, 55, 56],
  opexFirst: 52, opexLast: 92, totalOpex: 93, grossProfit: 95,
  otherIncome: [97, 98], totalOtherIncome: 99,
  otherExpense: [101, 102], totalOtherExpense: 103, netOther: 104,
  netIncome: 105,
  cash: 110, currentAssets: 112, cards: 126, currentLiabilities: 128,
  draws: 140, equity: 146,
};

const FIRST_STEP_ROWS: RowMap = {
  income: [33, 34, 35], totalIncome: 36,
  headlineIncome: [36], headlineExpense: [42, 69, 79],
  payroll: [46, 47, 48, 49],
  opexFirst: 46, opexLast: 68, totalOpex: 69, grossProfit: 71,
  otherIncome: [73, 74], totalOtherIncome: 75,
  otherExpense: [77, 78], totalOtherExpense: 79, netOther: 80,
  netIncome: 81,
  cash: 86, currentAssets: 88, cards: 97, currentLiabilities: 98,
  draws: 108, equity: 111,
};

interface Entry {
  match: RegExp;
  dashboard: ClientDashboard;
}

const ENTRIES: Entry[] = [
  {
    match: /uniquely\s*enough/i,
    dashboard: {
      key: 'uniquely-enough',
      label: 'Financial Dashboard',
      name: 'UNIQUELY ENOUGH',
      subtitle: 'Behavioral Health LLC',
      load: () => import('../data/ueSheets').then(m => m.UE_SHEETS),
      rows: UE_ROWS,
      forecast: 'rebuild',
    },
  },
  {
    match: /1st\s*step|first\s*step|1sg/i,
    dashboard: {
      key: 'first-step-to-greatness',
      label: 'Financial Dashboard',
      name: '1ST STEP TO GREATNESS',
      subtitle: 'Childcare & Early Education',
      load: () => import('../data/firstStepSheets').then(m => m.FIRST_STEP_SHEETS),
      rows: FIRST_STEP_ROWS,
      forecast: 'workbook',
    },
  },
  {
    match: /2g3b|2\s*g\s*3\s*b/i,
    dashboard: {
      key: '2g3b-eats',
      label: 'Financial Dashboard',
      name: '2G3B EATS LLC',
      subtitle: 'Event Catering',
      load: () => import('../data/twoG3BSheets').then(m => m.TWO_G_THREE_B_SHEETS),
      rows: TWO_G_THREE_B_ROWS,
      forecast: 'workbook',
    },
  },
  {
    match: /access\s*granted/i,
    dashboard: {
      key: 'access-granted-education',
      label: 'Financial Dashboard',
      name: 'ACCESS GRANTED',
      subtitle: 'Education',
      load: () => import('../data/accessGrantedSheets').then(m => m.ACCESS_GRANTED_SHEETS),
      rows: ACCESS_GRANTED_ROWS,
      forecast: 'workbook',
    },
  },
  {
    match: /battle\s*protection|bpa/i,
    dashboard: {
      key: 'battle-protection-agency',
      label: 'Financial Dashboard',
      name: 'BATTLE PROTECTION',
      subtitle: 'Agency',
      load: () => import('../data/battleProtectionSheets').then(m => m.BATTLE_PROTECTION_SHEETS),
      rows: BATTLE_PROTECTION_ROWS,
      forecast: 'workbook',
    },
  },
  {
    match: /steer/i,
    dashboard: {
      key: 'steer-llc',
      label: 'Financial Dashboard',
      name: 'STEER',
      subtitle: 'LLC',
      load: () => import('../data/steerSheets').then(m => m.STEER_SHEETS),
      rows: STEER_ROWS,
      forecast: 'workbook',
    },
  },
];

/** The client's dashboard, or null when none has been built for them. */
export function dashboardForClient(
  client: { full_name?: string | null; email?: string | null } | null | undefined,
): ClientDashboard | null {
  if (!client) return null;
  const haystack = `${client.full_name ?? ''} ${client.email ?? ''}`;
  return ENTRIES.find(e => e.match.test(haystack))?.dashboard ?? null;
}

/** Every dashboard that exists — used to list who has one. */
export function allDashboards(): ClientDashboard[] {
  return ENTRIES.map(e => e.dashboard);
}
