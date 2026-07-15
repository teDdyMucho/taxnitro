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

// Which required-item services each "Required Documents" folder collects.
//   Bookkeeping folder → the 4 Bookkeeping (BK) items
//   Tax folder         → the 2 CFO items (Prior Month Bookkeeping / QBO Access, AR / AP Aging)
const FOLDER_REQUIREMENT_SERVICES: Record<string, RequirementService[]> = {
  bk_required_documents:  ['BK'],
  tax_required_documents: ['CFO'],
};

/** Required items shown in a folder's upload picker (empty = not a required-docs folder). */
export function itemsForFolder(folderKey: string): RequiredItem[] {
  const services = FOLDER_REQUIREMENT_SERVICES[folderKey];
  if (!services) return [];
  return REQUIRED_UPLOADS.filter(i => services.includes(i.service));
}

/** Stable set-key for a fulfilled requirement. */
export function reqKey(service: RequirementService, key: string): string {
  return `${service}:${key}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type RequirementStatus = 'pending' | 'approved';

export interface FulfilledRequirement {
  service: RequirementService;
  requirement_key: string;
  document_id: string | null;
  tagged_by: string | null;
  status: RequirementStatus;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * All requirement slots for a client in a month — both client-uploaded ('pending')
 * and admin-approved ('approved'). The dashboard uses `status` to colour the radio:
 * pending → yellow, approved → green.
 */
export async function getFulfilledRequirements(email: string, month: string): Promise<FulfilledRequirement[]> {
  const { data, error } = await supabase
    .from('document_requirements')
    .select('service, requirement_key, document_id, tagged_by, status')
    .eq('client_email', email)
    .eq('month', month);
  if (error) { console.error('getFulfilledRequirements:', error.message); return []; }
  return (data ?? []).map(r => ({ ...r, status: (r.status ?? 'approved') as RequirementStatus })) as FulfilledRequirement[];
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

/** Tag an approved document as fulfilling a required item (admin only) → marks it 'approved' (green). */
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
      status:          'approved',
      tagged_by:       params.taggedBy,
    }, { onConflict: 'client_email,month,service,requirement_key' });
  if (error) { console.error('tagDocumentRequirement:', error.message); return false; }
  return true;
}

/**
 * Client-side: when a client uploads a file against a required item, record a
 * 'pending' slot so the dashboard radio turns yellow immediately (before admin
 * approval). Upsert on the same unique key — if a slot already exists we don't
 * downgrade an already-'approved' row back to pending.
 */
export async function createPendingRequirement(params: {
  clientEmail: string;
  documentId: string;
  documentTable: string;
  service: RequirementService;
  requirementKey: string;
  month: string;
}): Promise<boolean> {
  // Don't overwrite an already-approved slot for this item/month.
  const { data: existing } = await supabase
    .from('document_requirements')
    .select('status')
    .eq('client_email', params.clientEmail)
    .eq('month', params.month)
    .eq('service', params.service)
    .eq('requirement_key', params.requirementKey)
    .maybeSingle();
  if (existing?.status === 'approved') return true;

  const { error } = await supabase
    .from('document_requirements')
    .upsert({
      client_email:    params.clientEmail,
      document_id:     params.documentId,
      document_table:  params.documentTable,
      service:         params.service,
      requirement_key: params.requirementKey,
      month:           params.month,
      status:          'pending',
    }, { onConflict: 'client_email,month,service,requirement_key' });
  if (error) { console.error('createPendingRequirement:', error.message); return false; }
  return true;
}

/**
 * Admin-side: when a doc is REJECTED, drop the pending requirement slot the client
 * tagged it with so the dashboard radio goes yellow → grey again (not fulfilled).
 * Only removes 'pending' rows — never an already-approved slot.
 */
export async function clearPendingRequirementForDocument(documentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('document_requirements')
    .delete()
    .eq('document_id', documentId)
    .eq('status', 'pending');
  if (error) { console.error('clearPendingRequirementForDocument:', error.message); return false; }
  return true;
}

/**
 * Admin-side: which required item (if any) the CLIENT tagged this upload with.
 * Returns the matching RequiredItem so the approve modal can show it read-only.
 */
export async function getRequirementForDocument(documentId: string): Promise<RequiredItem | null> {
  const { data, error } = await supabase
    .from('document_requirements')
    .select('service, requirement_key')
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) { console.error('getRequirementForDocument:', error.message); return null; }
  if (!data) return null;
  return REQUIRED_UPLOADS.find(i => i.service === data.service && i.key === data.requirement_key) ?? null;
}

/**
 * Admin-side: when a doc is approved, flip any pending requirement slot the client
 * tagged it with to 'approved' (green). Returns true if a slot was updated — the
 * caller can skip the manual "tag which item" prompt when this succeeds.
 */
export async function approveRequirementForDocument(documentId: string, approvedBy: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('document_requirements')
    .update({ status: 'approved', tagged_by: approvedBy })
    .eq('document_id', documentId)
    .eq('status', 'pending')
    .select('id');
  if (error) { console.error('approveRequirementForDocument:', error.message); return false; }
  return (data?.length ?? 0) > 0;
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
