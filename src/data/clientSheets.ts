// The shape of a client's financial workbook, as the dashboard reads it.
//
// One file per client under src/data/ holds the values; this is only the shape
// they share. Every tab here is what FTG's own template produces, so a second
// client slots in without touching the screen that draws it.
//
// FS-R and FS-A keep their ORIGINAL row numbers. The workbook's own formulas
// address rows (34 = Total Income, 60 = Total Opex, 72 = Net Income, ...), so
// keeping the numbering is what makes those references checkable against the
// source. See ueModel.ts, which reads rows by exactly those numbers.
//
// Each client's data module is imported lazily (see clientDashboards.ts) so one
// client's financials are not carried in the bundle every other user downloads.

/** A cell in a presentation sheet: text, a figure, or blank. */
export type GridCell = string | number | null;
export type GridRow = GridCell[];

/**
 * A cell of a financial statement.
 *
 * Almost always a figure, but the workbook's reconciliation block at the foot
 * of FS-R reads 'OK' rather than a number, and that is the one line staff most
 * want to see — so text is part of the shape rather than something to discard.
 */
export type StatementCell = number | string | null;

/**
 * A budget tab, kept as the workbook displays it — "FY2027 Budget", which Paul
 * added to every CFO workbook in November 2026.
 *
 * Its figures are of every kind on one sheet: dollars, rates, a month count, a
 * break-even head count, an "OK" check. Stored as bare numbers they would need
 * a format guessed for each, so they arrive as text in the cell's own number
 * format, and automation/lib/convert.py reads every one back against the
 * workbook before it is written.
 */
export interface BudgetTab {
  /** The tab's name, "FY2027 Budget". The year moves on; the key does not. */
  title: string;
  /** Rows of grid, counted from 0, whose label the workbook sets in bold. */
  bold: number[];
  /** The tab from cell A1, figures as displayed ("$1,097,407", "3.0%", "(22.2%)"). */
  grid: (string | null)[][];
}

/**
 * The month's overview — "Oct 2026 Overview", which Paul put at the front of
 * every CFO workbook in November 2026: what happened in the month, where the
 * money went against the month before, a profit walk drawn as a waterfall, and
 * what FTG recommends for the month ahead.
 *
 * Read section by section in the order the sheet reads (overview() in
 * automation/lib/convert.py), then checked back against the workbook and tied
 * to the client's own FS-R before it is written. Table figures arrive as the
 * workbook displays them; chart figures as numbers, for drawing.
 */
export interface MonthOverview {
  /** The tab's name, "Oct 2026 Overview". The month moves on; the key does not. */
  tab: string;
  /** Its title line: "October 2026  |  Monthly Overview". */
  title: string;
  sections: OverviewSection[];
}

/** Where a section sits on the sheet: its heading's row, and which half it takes. */
export interface OverviewPlace {
  r: number;
  side: 'left' | 'right' | 'full';
  heading: string;
}

export interface OverviewPoints extends OverviewPlace {
  kind: 'points';
  /** "1  Revenue was strong. …"; a recommendation has its own title as well. */
  items: { n: string; title: string | null; text: string }[];
}

export interface OverviewTable extends OverviewPlace {
  kind: 'table';
  header: (string | null)[];
  rows: {
    cells: (string | null)[];
    /** Where the workbook paints a figure green ('up') or red ('down'). */
    tones: ('up' | 'down' | null)[];
    bold: boolean;
  }[];
  /** A line under the table, when there is one. */
  note: string | null;
}

/** A bar of the profit walk: a total standing on zero, or a step up or down from the last. */
export interface OverviewStep {
  label: string;
  kind: 'total' | 'up' | 'down';
  from: number;
  to: number;
  /** What the workbook writes over the bar: "$41,693", "+$39,387", "($23,273)". */
  text: string;
}

export interface OverviewWalk extends OverviewPlace {
  kind: 'walk';
  steps: OverviewStep[];
}

/** Columns for one measure and a line for another, month by month. */
export interface OverviewTrend extends OverviewPlace {
  kind: 'trend';
  months: string[];
  bars: { label: string; values: number[] };
  line: { label: string; values: number[] };
}

export type OverviewSection = OverviewPoints | OverviewTable | OverviewWalk | OverviewTrend;

/** A line of a financial statement, keyed by its row number in the workbook. */
export interface StatementRow {
  /** Row number in the source workbook — formulas address these. */
  r: number;
  label: string;
  /** Jan–Dec 2025, one entry per month. */
  y2025: StatementCell[];
  t2025: StatementCell;
  /** Jan–Dec 2026. Aug onward is forecast, rebuilt from the assumptions. */
  y2026: StatementCell[];
  t2026: StatementCell;
}

/**
 * The tabs of a client's workbook that the client themselves may see.
 *
 * Their own statements and the assumptions behind the forecast. Nothing here is
 * anything they do not already have in their books.
 */
export interface ClientSheets {
  /**
   * The month's overview, which clients see: written to them ("what we
   * recommend for November") and first in Paul's workbook. Optional, since only
   * workbooks from October 2026 on have one.
   */
  Overview?: MonthOverview;
  ASSUMPTIONS: GridRow[];
  /**
   * What FTG has asked the client to do, and by when — added to Access Granted
   * Education's workbook in v3. Optional: only some clients have one, and a tab
   * nobody has should not be a tab everybody sees.
   */
  'Financial Roadmap'?: GridRow[];
  'Balance Sheet': GridRow[];
  'Profit and Loss': GridRow[];
  'FS-R': StatementRow[];
  'FS-A': StatementRow[];
  /**
   * The budget, which clients see. Paul cleared it, notes for review and all,
   * on 9 Nov 2026: "oo pre, initial budget naman kasi siya".
   */
  Budget?: BudgetTab;
}

/**
 * FTG's own working notes on a client — kept in a separate module, and fetched
 * only for staff.
 *
 * These are drafts. Paul: "yung mga findings for review, nakahide pa sakanila if
 * ever, for polishing pa siya." They read as blunt assessments of the client's
 * own bookkeeping — 2G3B's names a personal account and counts cards with
 * negative balances — so a client reading an unfinished one would be a real
 * problem.
 *
 * Hiding the tab was not enough. While these travelled in the same module as the
 * statements, every word was in the JavaScript the client's own browser
 * downloaded, readable by anyone who opened the developer tools. Splitting the
 * module is what actually keeps them from being sent.
 */
export interface ClientNotes {
  /**
   * Optional, because a workbook can withdraw it. Paul hid this tab in Access
   * Granted Education's v3 — "wala nang findings for review" — and a tab hidden
   * in the workbook should be hidden here too, rather than this app being the
   * one place it still shows.
   */
  'Findings for Review'?: GridRow[];
  'TL;DR'?: GridRow[];
  /**
   * Where a budget goes instead while it is staff only, which a client's
   * browser never loads. Empty since clients were cleared to see it;
   * BUDGET_FOR_CLIENTS in automation/lib/convert.py moves it back.
   */
  Budget?: BudgetTab;
  /** Where the overview goes if it is ever made staff only (OVERVIEW_FOR_CLIENTS). */
  Overview?: MonthOverview;
}
