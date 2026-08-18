// Which clients have a financial dashboard built for them.
//
// Each dashboard is made from that client's own workbook, so a client only has
// one once the work has been done. Everyone else simply has no dashboard —
// never somebody else's, which is why this is an explicit list rather than a
// default.
//
// Clients are matched on their name or email rather than an id, because the
// same practice appears under slightly different names across the books and the
// portal ("Uniquely Enough LLC", "Uniquely Enough Behavioral Health LLC").

export type DashboardKey = 'uniquely-enough';

export interface ClientDashboard {
  key: DashboardKey;
  /** Shown on the button that opens it. */
  label: string;
}

interface Entry {
  match: RegExp;
  dashboard: ClientDashboard;
}

const ENTRIES: Entry[] = [
  {
    match: /uniquely\s*enough/i,
    dashboard: { key: 'uniquely-enough', label: 'Financial Dashboard' },
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
