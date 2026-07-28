import { supabase } from '../lib/supabase';

// ── Required recurring monthly uploads (the "Needs from Clients") ─────────────
// NOTE: These are what the CLIENT provides — they drive the upload progress bar.
// Deliverables (Query Sheet, P&L, Cash Flow, etc.) are produced by the firm and
// are intentionally NOT tracked here.
//
// To add / remove a required item, just edit this list. `key` must be unique.

export type RequirementService = 'BK' | 'TAX' | 'CFO';

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
];

export function itemsByService(service: RequirementService): RequiredItem[] {
  return REQUIRED_UPLOADS.filter(i => i.service === service);
}

// Each required item now has its OWN folder table. This maps a folder table →
// the requirement it fulfills, so a plain upload into that folder auto-tags the
// requirement (no picker needed — the folder IS the item).
export const REQUIREMENT_FOR_FOLDER: Record<string, { service: RequirementService; key: string }> = {
  bk_bank_statements:          { service: 'BK',  key: 'bank_statements' },
  bk_credit_card_statements:   { service: 'BK',  key: 'credit_card_statements' },
  bk_loan_statements:          { service: 'BK',  key: 'loan_statements' },
  bk_payroll_reports:          { service: 'BK',  key: 'payroll_reports' },
};

/** The required item a folder fulfills, or null if the folder isn't a requirement folder. */
export function requirementForFolder(folderKey: string): RequiredItem | null {
  const m = REQUIREMENT_FOR_FOLDER[folderKey];
  if (!m) return null;
  return REQUIRED_UPLOADS.find(i => i.service === m.service && i.key === m.key) ?? null;
}

// Requirement keys that are only needed when we DON'T already have QBO access.
const QBO_DEPENDENT_KEYS = ['prior_month_bookkeeping'];

/**
 * The required items that actually apply to a given client, based on:
 *   - services       → only items for services the client has (BK / CFO)
 *   - hasQboAccess   → drop QBO-dependent items when we already have access
 * This is the single source of truth for the client's checklist + progress total.
 */
export function itemsForClient(
  services: RequirementService[] | undefined,
  hasQboAccess: boolean | undefined,
): RequiredItem[] {
  const svc = (services && services.length > 0 ? services : ['BK']) as RequirementService[];
  return REQUIRED_UPLOADS.filter(i =>
    svc.includes(i.service) &&
    !(hasQboAccess && QBO_DEPENDENT_KEYS.includes(i.key))
  );
}

/** Is this folder visible to the client, given their services + QBO access? */
export function requirementFolderVisible(
  folderKey: string,
  services: RequirementService[] | undefined,
  hasQboAccess: boolean | undefined,
): boolean {
  const req = REQUIREMENT_FOR_FOLDER[folderKey];
  if (!req) return true;  // not a requirement folder → always visible
  const applicable = itemsForClient(services, hasQboAccess);
  return applicable.some(i => i.service === req.service && i.key === req.key);
}

/** Stable set-key for a fulfilled requirement. */
export function reqKey(service: RequirementService, key: string): string {
  return `${service}:${key}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type RequirementStatus = 'pending' | 'approved' | 'rejected';

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
 * approval). Upsert on the same unique key.
 *
 * We do NOT overwrite a slot that is already 'approved' (green) or 'rejected'
 * (red). A declined item stays red until an admin approves a new file for it —
 * re-uploading alone must not clear the "Declined" state.
 */
export async function createPendingRequirement(params: {
  clientEmail: string;
  documentId: string;
  documentTable: string;
  service: RequirementService;
  requirementKey: string;
  month: string;
}): Promise<boolean> {
  const { data: existing } = await supabase
    .from('document_requirements')
    .select('status')
    .eq('client_email', params.clientEmail)
    .eq('month', params.month)
    .eq('service', params.service)
    .eq('requirement_key', params.requirementKey)
    .maybeSingle();

  // Already accepted (green) → nothing to do.
  if (existing?.status === 'approved') return true;

  if (existing?.status === 'rejected') {
    // Declined item: STAY red, but repoint the slot at the newly-uploaded file so
    // the admin can approve this re-upload (which clears the red). No status change.
    const { error } = await supabase
      .from('document_requirements')
      .update({ document_id: params.documentId, document_table: params.documentTable })
      .eq('client_email', params.clientEmail)
      .eq('month', params.month)
      .eq('service', params.service)
      .eq('requirement_key', params.requirementKey);
    if (error) { console.error('createPendingRequirement (rejected repoint):', error.message); return false; }
    return true;
  }

  // No slot yet (or a leftover pending) → (re)create as pending (yellow).
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
 * When a file is DELETED, drop the requirement slot it was fulfilling so the
 * dashboard radio goes back to grey and the progress % drops — regardless of
 * status (pending/yellow, rejected/red, or approved/green). No file → no credit.
 */
export async function clearPendingRequirementForDocument(documentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('document_requirements')
    .delete()
    .eq('document_id', documentId);
  if (error) { console.error('clearPendingRequirementForDocument:', error.message); return false; }
  return true;
}

/**
 * Admin-side: when a doc is DECLINED (rejected), mark its requirement slot
 * 'rejected' so the dashboard radio turns RED with a "Declined" label. Stays red
 * until an admin approves a new file for the item. Returns true if a slot changed.
 */
export async function rejectRequirementForDocument(documentId: string, rejectedBy: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('document_requirements')
    .update({ status: 'rejected', tagged_by: rejectedBy })
    .eq('document_id', documentId)
    .in('status', ['pending', 'approved'])
    .select('id');
  if (error) { console.error('rejectRequirementForDocument:', error.message); return false; }
  return (data?.length ?? 0) > 0;
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
 * Admin-side: when a doc is approved, flip its requirement slot to 'approved'
 * (green). Works whether the slot was 'pending' (yellow) or 'rejected' (red) —
 * approving a re-uploaded file clears the "Declined" state. Returns true if a slot
 * was updated — the caller can skip the manual "tag which item" prompt then.
 */
export async function approveRequirementForDocument(documentId: string, approvedBy: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('document_requirements')
    .update({ status: 'approved', tagged_by: approvedBy })
    .eq('document_id', documentId)
    .in('status', ['pending', 'rejected'])
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
