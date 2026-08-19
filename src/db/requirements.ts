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

// ── CLIENT-upload items (blue in the spec) — client picks the label, then uploads.
// These go into each suite's "Monthly Reporting → Required Info" collector folder.
export const REQUIRED_UPLOADS: RequiredItem[] = [
  // ── Bookkeeping (Required Info) ──
  { service: 'BK',  key: 'bank_statements',         label: 'Bank Statements (all accounts)' },
  { service: 'BK',  key: 'credit_card_statements',  label: 'Credit Card Statements' },
  { service: 'BK',  key: 'loan_statements',         label: 'Loan Statements' },
  { service: 'BK',  key: 'payroll_reports',         label: 'Payroll Reports' },
  // ── CFO (Required Info) — same as BK plus the two below ──
  { service: 'CFO', key: 'bank_statements',         label: 'Bank Statements (all accounts)' },
  { service: 'CFO', key: 'credit_card_statements',  label: 'Credit Card Statements' },
  { service: 'CFO', key: 'loan_statements',         label: 'Loan Statements' },
  { service: 'CFO', key: 'payroll_reports',         label: 'Payroll Reports' },
  { service: 'CFO', key: 'prior_month_bookkeeping', label: 'Prior Month Bookkeeping / QBO Access' },
  { service: 'CFO', key: 'ar_ap_aging',             label: 'AR / AP Aging' },
];

export function itemsByService(service: RequirementService): RequiredItem[] {
  return REQUIRED_UPLOADS.filter(i => i.service === service);
}

// ── Bank accounts (per client) ───────────────────────────────────────────────
// A client can be asked for statements from SEVERAL bank accounts. Staff/admin
// configure the list on the client's profile (profiles.bank_accounts); each
// account then becomes its OWN required item — its own upload slot, radio and
// approve/reject — instead of one generic "Bank Statements (all accounts)" row.
//
// With NO accounts configured the generic item is kept, so clients created
// before this feature behave exactly as before.

// The type and its rules live in lib/bankAccounts.ts, which pulls in nothing —
// the questionnaire needs them and must not drag a database client along.
// Re-exported here for everything that already takes them from this file.
import {
  isCompleteBankAccount, hasIncompleteBankAccount, cleanBankAccounts,
  type BankAccount,
} from '../lib/bankAccounts';
export { isCompleteBankAccount, hasIncompleteBankAccount, cleanBankAccounts };
export type { BankAccount };

/** The base requirement key that per-account items expand from. */
export const BANK_STATEMENTS_KEY = 'bank_statements';

const BANK_KEY_SEP = '__';

/** Requirement key for one account, e.g. 'bank_statements__ba_1a2b3c4d'. */
export function bankAccountKey(accountId: string): string {
  return `${BANK_STATEMENTS_KEY}${BANK_KEY_SEP}${accountId}`;
}

/** The account id inside a per-account key, or null if it isn't one. */
export function bankAccountIdOf(requirementKey: string): string | null {
  const prefix = BANK_STATEMENTS_KEY + BANK_KEY_SEP;
  if (!requirementKey.startsWith(prefix)) return null;
  return requirementKey.slice(prefix.length) || null;
}

/** Display label for one account, e.g. 'Bank Statements — BDO ••••4821'. */
export function bankAccountLabel(acct: BankAccount): string {
  const bank  = acct.bank?.trim() || 'Bank';
  const last4 = acct.last4?.trim();
  return last4 ? `Bank Statements — ${bank} ••••${last4}` : `Bank Statements — ${bank}`;
}

/** A fresh id for a new account row. Generated once, then stored forever. */
export function newBankAccountId(): string {
  return 'ba_' + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
}

/** Coerce whatever is stored in profiles.bank_accounts into a clean array. */
export function normalizeBankAccounts(raw: any): BankAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(a => a && typeof a === 'object')
    .map(a => ({
      id:    String(a.id ?? '').trim(),
      bank:  String(a.bank ?? '').trim(),
      last4: String(a.last4 ?? '').trim(),
    }))
    .filter(a => a.id && a.bank);
}

/**
 * Replace the generic `bank_statements` row with one row per configured
 * account. Empty account list → items pass through untouched.
 */
function expandBankStatements(items: RequiredItem[], accounts: BankAccount[]): RequiredItem[] {
  if (accounts.length === 0) return items;
  return items.flatMap(item =>
    item.key === BANK_STATEMENTS_KEY
      ? accounts.map(a => ({
          service: item.service,
          key:     bankAccountKey(a.id),
          label:   bankAccountLabel(a),
        }))
      : [item],
  );
}

/** Display label for a service (used in checklist group headers). */
export function serviceLabel(service: RequirementService): string {
  return service === 'BK' ? 'Bookkeeping' : service === 'TAX' ? 'Tax' : 'CFO';
}

// A "required-docs" collector folder — the CLIENT uploads here and tags which
// required item the file is for (Required Info folders, one per suite).
const FOLDER_REQUIREMENT_ITEMS: Record<string, RequirementService> = {
  bk_mr_required_info:  'BK',
  cfo_mr_required_info: 'CFO',
};

/** True if this folder is a required-docs collector (shows the item picker on upload). */
export function isRequirementFolder(folderKey: string): boolean {
  return folderKey in FOLDER_REQUIREMENT_ITEMS;
}

/** The collector folder a service's required uploads land in (reverse lookup). */
export function collectorFolderForService(service: RequirementService): string | null {
  const hit = Object.entries(FOLDER_REQUIREMENT_ITEMS).find(([, svc]) => svc === service);
  return hit ? hit[0] : null;
}

/** The required items a collector folder gathers (empty if not a collector folder). */
export function itemsForFolder(folderKey: string): RequiredItem[] {
  const svc = FOLDER_REQUIREMENT_ITEMS[folderKey];
  if (!svc) return [];
  return REQUIRED_UPLOADS.filter(i => i.service === svc);
}

// ── STAFF-upload items (purple in the spec) — staff picks the label, then uploads.
// These are the deliverables FTG provides TO the client in the For Client Review
// and Final Statements folders. The client only approves/rejects/comments.
export const STAFF_UPLOAD_ITEMS: Record<string, string[]> = {
  // For Client Review (BK + CFO share the same three)
  bk_mr_client_review:      ['Query Sheet', 'P&L Statement', 'Balance Sheet'],
  cfo_mr_client_review:     ['Query Sheet', 'P&L Statement', 'Balance Sheet'],
  // Final Statements — BK
  bk_mr_final_statements:   ['FINAL P&L Statement', 'FINAL Balance Sheet'],
  // Final Statements & Insights — CFO (richer set)
  cfo_mr_final_statements:  [
    'FINAL P&L Statement',
    'FINAL Balance Sheet',
    'Cash Flow Statement / Cash Flow Forecast',
    'KPI Dashboard / Financial Model Update',
    'Monthly TLDR Summary Email',
    'Budget vs Actual Variance',
  ],
};

/** True if a folder is a staff-deliverable that uses a label picker on upload. */
export function isStaffLabelFolder(folderKey: string): boolean {
  return folderKey in STAFF_UPLOAD_ITEMS;
}

/** The label options a staff-deliverable folder offers (empty if none). */
export function staffLabelsForFolder(folderKey: string): string[] {
  return STAFF_UPLOAD_ITEMS[folderKey] ?? [];
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
  bankAccounts: BankAccount[] = [],
): RequiredItem[] {
  const svc = (services && services.length > 0 ? services : ['BK']) as RequirementService[];
  const base = REQUIRED_UPLOADS.filter(i =>
    svc.includes(i.service) &&
    !(hasQboAccess && QBO_DEPENDENT_KEYS.includes(i.key))
  );
  return expandBankStatements(base, bankAccounts);
}

/** Items a collector folder gathers, narrowed to what applies to this client. */
export function itemsForFolderAndClient(
  folderKey: string,
  services: RequirementService[] | undefined,
  hasQboAccess: boolean | undefined,
  bankAccounts: BankAccount[] = [],
): RequiredItem[] {
  const svc = FOLDER_REQUIREMENT_ITEMS[folderKey];
  if (!svc) return [];
  // itemsForClient is already expanded per bank account — just scope it to the
  // service this collector folder gathers for.
  return itemsForClient(services, hasQboAccess, bankAccounts).filter(i => i.service === svc);
}

/** Stable set-key for a fulfilled requirement. */
export function reqKey(service: RequirementService, key: string): string {
  return `${service}:${key}`;
}

// ── Regrouping uploads by what the CLIENT chose ──────────────────────────────
// Several distinct client-facing types land in ONE table: every BK required item
// (each bank account, Credit Card, Loan, Payroll) is written to
// bk_mr_required_info, CFO's to cfo_mr_required_info. Grouping by table would
// erase exactly the distinction the client made, so staff regroup by the label
// the client picked — which the upload prefixes onto the filename as
// "<label> — <original filename>".

/** Friendly name for a folder table, for anything that isn't a required item. */
export const FOLDER_TABLE_LABELS: Record<string, string> = {
  tax_client_uploads:      'Client Uploads',
  tax_additional_docs:     'Additional Tax Docs',
  tax_contracts:           'Tax Contracts',
  tax_invoices:            'Tax Invoices',
  tax_return_information:  'Tax Returns',
  bk_contracts:            'BK Contracts',
  bk_invoices:             'BK Invoices',
  bk_final_pnl:            'Additional BK Docs',
  bk_mr_required_info:     'Monthly Reporting (Required Info)',
  bk_mr_client_review:     'Monthly Reporting (For Client Review)',
  bk_mr_final_statements:  'Monthly Reporting (Final Statements)',
  cfo_contracts:           'CFO Contracts',
  cfo_invoices:            'CFO Invoices',
  cfo_additional_docs:     'Additional CFO Docs',
  cfo_mr_required_info:    'Monthly Reporting (Required Info)',
  cfo_mr_client_review:    'Monthly Reporting (For Client Review)',
  cfo_mr_final_statements: 'Monthly Reporting (Final Statements & Insights)',
};

export function folderTableLabel(table: string | null | undefined): string {
  if (!table) return 'Uncategorised';
  return FOLDER_TABLE_LABELS[table] ?? table.replace(/_/g, ' ');
}

/**
 * The required item a document was uploaded against, found by matching the
 * label the upload prefixed onto its name. Longest label first, so
 * "Bank Statements — BDO ••••4821" wins over a plain "Bank Statements".
 */
export function requiredItemForDocName(
  docName: string | null | undefined,
  clientItems: RequiredItem[],
): RequiredItem | null {
  if (!docName) return null;
  const candidates = [...clientItems].sort((a, b) => b.label.length - a.label.length);
  return candidates.find(i => docName.startsWith(i.label)) ?? null;
}

/** Strip the item label the upload prefixed, leaving the client's own filename. */
export function stripRequirementPrefix(docName: string, item: RequiredItem | null): string {
  if (!item) return docName;
  const rest = docName.slice(item.label.length);
  return rest.startsWith(' — ') ? rest.slice(3) : (rest.trim() || docName);
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

/**
 * How many documents are tagged to each requirement item, keyed by `service:key`.
 * Used by the admin dashboard to break down a collector folder (e.g. Required Info)
 * into its individual items. Admin/staff only.
 */
export async function getRequirementDocCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('document_requirements')
    .select('service, requirement_key');
  if (error) { console.error('getRequirementDocCounts:', error.message); return {}; }
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { service: string; requirement_key: string }[]) {
    // Per-account keys roll up into the generic 'bank_statements' row: this view
    // aggregates across ALL clients, where one client's individual accounts
    // aren't meaningful — and the admin item list is the unexpanded one.
    const base = bankAccountIdOf(r.requirement_key) ? BANK_STATEMENTS_KEY : r.requirement_key;
    const k = `${r.service}:${base}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export interface TaggedFile {
  document_id: string;
  document_table: string;
  client_email: string;
  status: RequirementStatus;
  month: string;
  name: string;
  created_at: string;
  document_url: string;
}

/**
 * The actual files tagged to a given required item (service + key). Loads each
 * tag's document from its folder table so the admin can open them. Admin/staff only.
 */
export async function getTaggedFilesForItem(service: RequirementService, key: string): Promise<TaggedFile[]> {
  let q = supabase
    .from('document_requirements')
    .select('document_id, document_table, client_email, status, month')
    .eq('service', service)
    .not('document_id', 'is', null);

  // The generic 'bank_statements' row stands for every client's per-account
  // slots too (bank_statements__<id>), so match the whole family.
  q = key === BANK_STATEMENTS_KEY
    ? q.like('requirement_key', `${BANK_STATEMENTS_KEY}%`)
    : q.eq('requirement_key', key);

  const { data: tags, error } = await q;
  if (error) { console.error('getTaggedFilesForItem:', error.message); return []; }

  const rows = (tags ?? []) as { document_id: string; document_table: string; client_email: string; status: RequirementStatus; month: string }[];

  const files = await Promise.all(rows.map(async (t) => {
    if (!t.document_table) return null;
    const { data: doc } = await supabase
      .from(t.document_table)
      .select('name, file_name, created_at, document_url')
      .eq('id', t.document_id)
      .maybeSingle();
    if (!doc) return null;   // doc was deleted — skip
    return {
      document_id:    t.document_id,
      document_table: t.document_table,
      client_email:   t.client_email,
      status:         t.status,
      month:          t.month,
      name:           doc.file_name || doc.name || 'Document',
      created_at:     doc.created_at,
      document_url:   doc.document_url,
    } as TaggedFile;
  }));

  return files.filter(Boolean).sort(
    (a, b) => new Date(b!.created_at).getTime() - new Date(a!.created_at).getTime(),
  ) as TaggedFile[];
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
    .select('service, requirement_key, client_email')
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) { console.error('getRequirementForDocument:', error.message); return null; }
  if (!data) return null;

  const service = data.service as RequirementService;

  // Per-account bank item → name it from the client's configured accounts.
  const acctId = bankAccountIdOf(data.requirement_key);
  if (acctId) {
    const accounts = await getBankAccountsByEmail(data.client_email);
    const acct = accounts.find(a => a.id === acctId);
    return {
      service,
      key:   data.requirement_key,
      // Account removed since the upload → still name it, so the approve modal
      // shows what the client tagged instead of falling back to the picker.
      label: acct ? bankAccountLabel(acct) : 'Bank Statements — (removed account)',
    };
  }

  return REQUIRED_UPLOADS.find(i => i.service === service && i.key === data.requirement_key) ?? null;
}

/** A client's configured bank accounts, by email. Used by the admin screens. */
export async function getBankAccountsByEmail(email: string): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('bank_accounts')
    .eq('email', email)
    .maybeSingle();
  if (error) { console.error('getBankAccountsByEmail:', error.message); return []; }
  return normalizeBankAccounts(data?.bank_accounts);
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
