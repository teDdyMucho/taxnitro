import type { ImageSourcePropType } from 'react-native';
import type { ClientNotes, ClientSheets } from '../data/clientSheets';
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
// Clients are matched on their exact sign-in email, listed per dashboard.
//
// This began as a pattern match on name and email, which does not survive contact
// with the real accounts. Two of the six carry nothing a pattern could catch:
// 2G3B Eats signs in as Jody Lopez at a personal gmail address, and STEER's
// domain glues the name to the city (steerphx.com), so a word-boundary match
// misses it. Loosening the patterns to reach them is the wrong direction — a
// pattern loose enough to match "steer" anywhere would eventually match a second
// client, and that failure shows one business another's books.
//
// An exact email cannot collide. If someone's address changes their dashboard
// disappears until it is listed here, which is the safe way round.

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
   * Their mark, lifted out of their own workbook — the same one at the top of
   * the report Paul sends. Optional: 2G3B Eats has none in theirs, and a missing
   * logo should leave the masthead reading normally rather than leave a hole.
   */
  logo?: ImageSourcePropType;
  /**
   * That client's workbook. A function rather than the data itself, so one
   * client's financials load only when their report is opened rather than
   * riding along in the bundle every other user downloads.
   */
  load: () => Promise<ClientSheets>;
  /**
   * FTG's working notes on this client — Findings for Review and TL;DR.
   *
   * A separate module, and a separate fetch, so that a client viewing their own
   * report never downloads them. Hiding the tabs was not enough: while the notes
   * shared a module with the statements, their whole text sat in the JavaScript
   * the client's browser had already loaded.
   */
  loadNotes: () => Promise<ClientNotes>;
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
  /**
   * The last month their workbook has closed, 0-based — 6 is July, which is
   * where every other client stands and what this falls back to. D&J Tropical
   * Sno closes August and forecasts from September.
   */
  lastActual?: number;
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

/**
 * D & J Tropical Sno LLC.
 *
 * A cost-of-goods block ahead of the expenses, like 1st Step to Greatness, but
 * the plainest one yet: a single revenue line, thirteen expense lines, and one
 * labour row — Contract Labor — which is the whole of their payroll.
 *
 * Their balance sheet carries no credit cards, so that card is absent rather
 * than reading nil against a row that does not exist. Their TOTAL INCOME card
 * is revenue alone and TOTAL COST is cost of goods plus operating expenses,
 * which is what headlineIncome and headlineExpense say below: Aug 2026 reads
 * $11,682 and $9,692 here and on their own Dashboard.
 *
 * Their forecast is seasonal — an index on a peak-season run-rate, with food
 * and contract labour priced as a share of the revenue that produces — so
 * their figures come from their workbook.
 */
const DJ_TROPICAL_SNO_ROWS: RowMap = {
  income: [33], totalIncome: 37,
  headlineIncome: [37], headlineExpense: [43, 74],
  payroll: [49],
  opexFirst: 48, opexLast: 60, totalOpex: 74, grossProfit: 76,
  netIncome: 77,
  cash: 81, currentAssets: 84, currentLiabilities: 93,
  draws: 98, equity: 103,
};

/**
 * Strong Little Hands Daycare.
 *
 * STEER's shape on almost the same rows: two revenue lines, no cost-of-services
 * block and no other income, with a payroll subtotal sitting among the expenses
 * — row 45, "Total Payroll & Contract Labour", which their own TOTAL EXPENSES
 * steps over. It is skipped here too, and the four rows it sums are the payroll
 * block: wages, taxes, processing fees and the contractor line.
 *
 * No credit cards on their balance sheet, so that card is absent. Aug 2026
 * reads $13,932 income against $3,564 of expense, a 74.4% margin — the three
 * figures on their own Dashboard.
 */
const STRONG_LITTLE_HANDS_ROWS: RowMap = {
  income: [33, 34], totalIncome: 35,
  headlineIncome: [35], headlineExpense: [65],
  payroll: [40, 41, 42, 43],
  opexFirst: 40, opexLast: 60, opexSkip: [45], totalOpex: 65, grossProfit: 67,
  netIncome: 68,
  cash: 72, currentAssets: 74, currentLiabilities: 80,
  draws: 88, equity: 92,
};

/**
 * Tribal Indemnity, LLC.
 *
 * Four revenue lines into one total, a cost-of-services block that is nil every
 * month so far, and a long operating-expense list — the shape 1st Step to
 * Greatness has, without the other-income block.
 *
 * They employ nobody. There is no wages line, no payroll tax line: the work is
 * bought in, so the payroll block here is their contracted labour — outside
 * services, contract professional fees, and subcontractors within cost of
 * services. That is the same reading D&J Tropical Sno gets, whose payroll is a
 * single Contract Labor row, and it is what makes the payroll card and the days
 * of cover mean anything for them.
 *
 * No credit cards on the balance sheet. Aug 2026 reads $15,798 income against
 * $12,601 of cost at 20.2% — their own Dashboard's three figures.
 */
const TRIBAL_INDEMNITY_ROWS: RowMap = {
  income: [33, 34, 35, 36], totalIncome: 37,
  headlineIncome: [37], headlineExpense: [43, 74],
  payroll: [41, 54, 63],
  opexFirst: 48, opexLast: 73, totalOpex: 74, grossProfit: 76,
  netIncome: 78,
  cash: 82, currentAssets: 85, currentLiabilities: 94,
  draws: 99, equity: 104,
};

/**
 * Finance Therapy Group — FTG's own books.
 *
 * Read the same way a client's are, and worth saying why the numbers look as
 * they do: the work is bought in, so their cost of service delivery is a single
 * contract-labour row, and that row is the payroll block here. Their TOTAL
 * EXPENSE card is that block plus operating expenses — $9,181 and $6,689 in
 * Aug 2026, the $15,869 on their own Dashboard against $15,356 of revenue.
 *
 * Their balance sheet runs negative: cash is overdrawn and the cards carry
 * $62,052, which is their position and not a reading error.
 */
const FTG_ROWS: RowMap = {
  income: [33, 34, 35, 36], totalIncome: 37,
  headlineIncome: [37], headlineExpense: [43, 74],
  payroll: [40],
  opexFirst: 48, opexLast: 67, totalOpex: 74, grossProfit: 76,
  netIncome: 77,
  cash: 81, currentAssets: 84, cards: 89, currentLiabilities: 93,
  draws: 98, equity: 103,
};

interface Entry {
  /** The client's exact sign-in email(s), lower case. */
  emails: string[];
  dashboard: ClientDashboard;
}

const ENTRIES: Entry[] = [
  {
    emails: ['stephanie@uniquelyenough.com'],
    dashboard: {
      key: 'uniquely-enough',
      label: 'Financial Dashboard',
      name: 'UNIQUELY ENOUGH',
      subtitle: 'Behavioral Health LLC',
      logo: require('../../assets/clients/uniquely-enough.png'),
      load: () => import('../data/ueSheets').then(m => m.UE_SHEETS),
      loadNotes: () => import('../data/ueSheetsNotes').then(m => m.UE_NOTES),
      rows: UE_ROWS,
      // Their own workbook's figures, as everyone else's are. They were rebuilt
      // here while v2 forecast the way this model does. v4 does not: the
      // rebuild's basis is a hard-coded Feb–Jul average, so it never sees
      // August — their worst month by a distance — and ran 7% above their own
      // revenue and 34% above their own net income. Staff would have been
      // reading figures the workbook Paul sends them does not contain.
      forecast: 'workbook',
      // v4 closes August; the forecast runs Sep–Dec.
      lastActual: 7,
    },
  },
  {
    emails: ['1ststep2greatness@gmail.com'],
    dashboard: {
      key: 'first-step-to-greatness',
      label: 'Financial Dashboard',
      name: '1ST STEP TO GREATNESS',
      subtitle: 'Childcare & Early Education',
      logo: require('../../assets/clients/first-step-to-greatness.png'),
      load: () => import('../data/firstStepSheets').then(m => m.FIRST_STEP_SHEETS),
      loadNotes: () => import('../data/firstStepSheetsNotes').then(m => m.FIRST_STEP_NOTES),
      rows: FIRST_STEP_ROWS,
      forecast: 'workbook',
    },
  },
  {
    emails: ['jodylopez4@gmail.com'],
    dashboard: {
      key: '2g3b-eats',
      label: 'Financial Dashboard',
      name: '2G3B EATS LLC',
      subtitle: 'Event Catering',
      load: () => import('../data/twoG3BSheets').then(m => m.TWO_G_THREE_B_SHEETS),
      loadNotes: () => import('../data/twoG3BSheetsNotes').then(m => m.TWO_G_THREE_B_NOTES),
      rows: TWO_G_THREE_B_ROWS,
      forecast: 'workbook',
    },
  },
  {
    emails: ['mr.grant@accessgrantededu.com'],
    dashboard: {
      key: 'access-granted-education',
      label: 'Financial Dashboard',
      name: 'ACCESS GRANTED',
      subtitle: 'Education',
      logo: require('../../assets/clients/access-granted-education.png'),
      load: () => import('../data/accessGrantedSheets').then(m => m.ACCESS_GRANTED_SHEETS),
      loadNotes: () => import('../data/accessGrantedSheetsNotes').then(m => m.ACCESS_GRANTED_NOTES),
      rows: ACCESS_GRANTED_ROWS,
      forecast: 'workbook',
    },
  },
  {
    emails: ['kristina@battleprotectionagency.com'],
    dashboard: {
      key: 'battle-protection-agency',
      label: 'Financial Dashboard',
      name: 'BATTLE PROTECTION',
      subtitle: 'Agency',
      logo: require('../../assets/clients/battle-protection-agency.png'),
      load: () => import('../data/battleProtectionSheets').then(m => m.BATTLE_PROTECTION_SHEETS),
      loadNotes: () => import('../data/battleProtectionSheetsNotes').then(m => m.BATTLE_PROTECTION_NOTES),
      rows: BATTLE_PROTECTION_ROWS,
      forecast: 'workbook',
    },
  },
  {
    emails: ['financetherapygroup@gmail.com'],
    dashboard: {
      key: 'finance-therapy-group',
      label: 'Financial Dashboard',
      name: 'FINANCE THERAPY GROUP',
      subtitle: 'Practice accounts',
      logo: require('../../assets/main-logo.png'),
      load: () => import('../data/financeTherapyGroupSheets').then(m => m.FINANCE_THERAPY_GROUP_SHEETS),
      loadNotes: () => import('../data/financeTherapyGroupSheetsNotes').then(m => m.FINANCE_THERAPY_GROUP_NOTES),
      rows: FTG_ROWS,
      forecast: 'workbook',
      // Their actuals run to August; the workbook forecasts Sep–Dec 2026.
      lastActual: 7,
    },
  },
  {
    // Paul, 23 Sep: "tribal indemnity = tribalinsurance@gmail.com". No portal
    // account carries it yet; listed now so their dashboard is theirs the day
    // one is made, rather than waiting on somebody to remember this file.
    emails: ['tribalinsurance@gmail.com'],
    dashboard: {
      key: 'tribal-indemnity',
      label: 'Financial Dashboard',
      name: 'TRIBAL INDEMNITY',
      subtitle: 'LLC',
      logo: require('../../assets/clients/tribal-indemnity.png'),
      load: () => import('../data/tribalIndemnitySheets').then(m => m.TRIBAL_INDEMNITY_SHEETS),
      loadNotes: () => import('../data/tribalIndemnitySheetsNotes').then(m => m.TRIBAL_INDEMNITY_NOTES),
      rows: TRIBAL_INDEMNITY_ROWS,
      forecast: 'workbook',
      // Their actuals run to August; the workbook forecasts Sep–Dec 2026.
      lastActual: 7,
    },
  },
  {
    // Paul, 23 Sep: "Strong Little Hands = armstrong.jen27@gmail.com". Same
    // again — no account under it yet.
    emails: ['armstrong.jen27@gmail.com'],
    dashboard: {
      key: 'strong-little-hands-daycare',
      label: 'Financial Dashboard',
      name: 'STRONG LITTLE HANDS',
      subtitle: 'Daycare',
      load: () => import('../data/strongLittleHandsDaycareSheets').then(m => m.STRONG_LITTLE_HANDS_DAYCARE_SHEETS),
      loadNotes: () => import('../data/strongLittleHandsDaycareSheetsNotes').then(m => m.STRONG_LITTLE_HANDS_DAYCARE_NOTES),
      rows: STRONG_LITTLE_HANDS_ROWS,
      forecast: 'workbook',
      // Their actuals run to August; the workbook forecasts Sep–Dec 2026.
      lastActual: 7,
    },
  },
  {
    emails: ['support@tropicalsnonorthaz.com'],
    dashboard: {
      key: 'd-j-tropical-sno',
      label: 'Financial Dashboard',
      name: 'D & J TROPICAL SNO',
      subtitle: 'LLC',
      load: () => import('../data/dJTropicalSnoSheets').then(m => m.D_J_TROPICAL_SNO_SHEETS),
      loadNotes: () => import('../data/dJTropicalSnoSheetsNotes').then(m => m.D_J_TROPICAL_SNO_NOTES),
      rows: DJ_TROPICAL_SNO_ROWS,
      forecast: 'workbook',
      // Their actuals run to August; the workbook forecasts Sep–Dec 2026.
      lastActual: 7,
    },
  },
  {
    emails: ['corey.benson@steerphx.com'],
    dashboard: {
      key: 'steer-llc',
      label: 'Financial Dashboard',
      name: 'STEER',
      subtitle: 'LLC',
      logo: require('../../assets/clients/steer-llc.png'),
      load: () => import('../data/steerSheets').then(m => m.STEER_SHEETS),
      loadNotes: () => import('../data/steerSheetsNotes').then(m => m.STEER_NOTES),
      rows: STEER_ROWS,
      forecast: 'workbook',
    },
  },
];

/** The client's dashboard, or null when none has been built for them. */
export function dashboardForClient(
  client: { full_name?: string | null; email?: string | null } | null | undefined,
): ClientDashboard | null {
  const email = client?.email?.trim().toLowerCase();
  if (!email) return null;
  return ENTRIES.find(e => e.emails.includes(email))?.dashboard ?? null;
}

/** Every dashboard that exists — used to list who has one. */
export function allDashboards(): ClientDashboard[] {
  return ENTRIES.map(e => e.dashboard);
}
