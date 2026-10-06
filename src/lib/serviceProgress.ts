import type { ClientService } from '../context/AuthContext';

// Where FTG's own work stands for a client, one label per service.
//
// Camaree, app notes 3b: "Add a Progress Label for services to track where we
// are on our end. The data entered here will inform the dashboard."
//
// Written once here because three places read it — the Update Profile tray
// that sets it, the client list that sorts by it, and the dashboard that
// counts it — and the monthly rollover below has to mean the same thing in
// all three. Stored in profiles.service_progress
// (database/profiles_service_progress.sql).

export type WorkProgress = 'not_started' | 'in_progress' | 'completed' | 'current';

export interface ServiceProgressEntry {
  status: WorkProgress;
  /** 'YYYY-MM'. Set alongside Current, which only holds for the month it was set in. */
  month?: string | null;
}

export type ServiceProgress = Partial<Record<ClientService, ServiceProgressEntry>>;

/**
 * Services that are done afresh every month. Their finished state is Current —
 * caught up for this month — rather than Completed, which TAX and YER reach once.
 */
const MONTHLY: ClientService[] = ['BK', 'CFO'];

export const isMonthlyService = (svc: ClientService) => MONTHLY.includes(svc);

export const PROGRESS_LABEL: Record<WorkProgress, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed:   'Completed',
  current:     'Current',
};

/** Grey, amber, green — not started, under way, done. */
export const PROGRESS_COLOR: Record<WorkProgress, string> = {
  not_started: '#94A3B8',
  in_progress: '#E8B923',
  completed:   '#22C55E',
  current:     '#22C55E',
};

/** The three labels a service can carry, in the order they are worked through. */
export function progressOptions(svc: ClientService): WorkProgress[] {
  return isMonthlyService(svc)
    ? ['not_started', 'in_progress', 'current']
    : ['not_started', 'in_progress', 'completed'];
}

export const thisMonth = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/**
 * What a service's label reads today.
 *
 * "If possible, have 'Current' default back to 'Not Started' every 1st of the
 * month." Current is saved with the month it was set in, and from the first of
 * the next month it reads as Not Started. Nothing has to run on the 1st for
 * that to happen, so nothing can forget to.
 *
 * A service never given a label, or holding one that does not belong to it,
 * reads Not Started.
 */
export function effectiveProgress(
  progress: ServiceProgress | null | undefined,
  svc: ClientService,
  now: Date = new Date(),
): WorkProgress {
  const entry = progress?.[svc];
  if (!entry || !progressOptions(svc).includes(entry.status)) return 'not_started';
  if (entry.status === 'current' && entry.month !== thisMonth(now)) return 'not_started';
  return entry.status;
}

/** Set one service's label, stamping the month on Current. Leaves the others alone. */
export function withProgress(
  progress: ServiceProgress | null | undefined,
  svc: ClientService,
  status: WorkProgress,
  now: Date = new Date(),
): ServiceProgress {
  return {
    ...(progress ?? {}),
    [svc]: status === 'current' ? { status, month: thisMonth(now) } : { status },
  };
}

/** Whatever came back from the database, as a ServiceProgress — never null. */
export function normalizeServiceProgress(raw: unknown): ServiceProgress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ServiceProgress = {};
  for (const [svc, entry] of Object.entries(raw as Record<string, any>)) {
    if (entry && typeof entry === 'object' && typeof entry.status === 'string') {
      out[svc as ClientService] = {
        status: entry.status as WorkProgress,
        month: typeof entry.month === 'string' ? entry.month : null,
      };
    }
  }
  return out;
}
