import { supabase } from '../lib/supabase';

// ── Required recurring monthly uploads (the "Needs from Clients") ─────────────
// NOTE: These are what the CLIENT provides — they drive the upload progress bar.
// Deliverables (Query Sheet, P&L, Cash Flow, etc.) are produced by the firm and
// are intentionally NOT tracked here.
//
// To add / remove a required item, just edit this list. `key` must be unique.

export type RequirementService = 'BK' | 'CFO';

export interface RequiredItem {
  key: string;
  label: string;
  service: RequirementService;
}

export const REQUIRED_UPLOADS: RequiredItem[] = [
  // ── Bookkeeping ──
  { service: 'BK',  key: 'bank_statements',        label: 'Bank Statements (all accounts)' },
  { service: 'BK',  key: 'credit_card_statements', label: 'Credit Card Statements' },
  { service: 'BK',  key: 'loan_statements',        label: 'Loan Statements' },
  { service: 'BK',  key: 'payroll_reports',        label: 'Payroll Reports' },
  // ── CFO ──
  { service: 'CFO', key: 'prior_month_bookkeeping', label: 'Prior Month Bookkeeping / QBO Access' },
  { service: 'CFO', key: 'ar_ap_aging',             label: 'AR / AP Aging' },
];

export function itemsByService(service: RequirementService): RequiredItem[] {
  return REQUIRED_UPLOADS.filter(i => i.service === service);
}

/** Stable set-key for a fulfilled requirement. */
export function reqKey(service: RequirementService, key: string): string {
  return `${service}:${key}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface FulfilledRequirement {
  service: RequirementService;
  requirement_key: string;
  document_id: string | null;
  tagged_by: string | null;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** All requirement slots the admin has accepted + tagged for a client in a month. */
export async function getFulfilledRequirements(email: string, month: string): Promise<FulfilledRequirement[]> {
  const { data, error } = await supabase
    .from('document_requirements')
    .select('service, requirement_key, document_id, tagged_by')
    .eq('client_email', email)
    .eq('month', month);
  if (error) { console.error('getFulfilledRequirements:', error.message); return []; }
  return (data ?? []) as FulfilledRequirement[];
}

/** Accepted-item counts per client for a month → { client_email: count }. Admin/staff only. */
export async function getRequirementCountsForMonth(month: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('document_requirements')
    .select('client_email')
    .eq('month', month);
  if (error) { console.error('getRequirementCountsForMonth:', error.message); return {}; }
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { client_email: string }[]) {
    counts[r.client_email] = (counts[r.client_email] ?? 0) + 1;
  }
  return counts;
}

/** Total number of required items (the progress denominator). */
export const REQUIRED_TOTAL = REQUIRED_UPLOADS.length;

/** Tag an approved document as fulfilling a required item (admin only). */
export async function tagDocumentRequirement(params: {
  clientEmail: string;
  documentId: string;
  documentTable: string;
  service: RequirementService;
  requirementKey: string;
  month: string;
  taggedBy: string;
}): Promise<boolean> {
  const { error } = await supabase
    .from('document_requirements')
    .upsert({
      client_email:    params.clientEmail,
      document_id:     params.documentId,
      document_table:  params.documentTable,
      service:         params.service,
      requirement_key: params.requirementKey,
      month:           params.month,
      tagged_by:       params.taggedBy,
    }, { onConflict: 'client_email,month,service,requirement_key' });
  if (error) { console.error('tagDocumentRequirement:', error.message); return false; }
  return true;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** 'YYYY-MM' for the given date (defaults to now). */
export function monthOf(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
