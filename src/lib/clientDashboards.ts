import type { ClientSheets } from '../data/clientSheets';

// Which clients have a financial dashboard, and where its figures come from.
//
// A dashboard is built from that client's own workbook, so a client only has one
// once that work is done. Everyone else simply has no dashboard — never somebody
// else's, which is why this is an explicit list rather than a default.
//
// Adding a client is two steps and no new screen: put their workbook here as
// src/data/<name>Sheets.ts, then add an entry below. The screen that draws it
// does not know or care which client it is showing.
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
}

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
