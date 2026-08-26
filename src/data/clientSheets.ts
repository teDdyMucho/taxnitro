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

export interface ClientSheets {
  'Findings for Review': GridRow[];
  'TL;DR': GridRow[];
  ASSUMPTIONS: GridRow[];
  'Balance Sheet': GridRow[];
  'Profit and Loss': GridRow[];
  'FS-R': StatementRow[];
  'FS-A': StatementRow[];
}
