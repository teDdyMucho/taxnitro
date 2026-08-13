import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkflowStatus =
  | 'processor'
  | 'reviewer'
  | 'reprocessor'
  | 'report_sender'
  | 'complete';

export type WorkflowPhase = 'A' | 'B' | 'C' | 'D';
export type AccountingSoftware = 'QBO' | 'QBD' | 'Xero';

export interface WorkflowInstance {
  id: string;
  client_id: string;
  month: string;
  accounting_software: AccountingSoftware;
  status: WorkflowStatus;
  assigned_processor: string | null;
  assigned_reviewer: string | null;
  has_loans: boolean;
  has_fixed_assets: boolean;
  client_notified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  client_name?: string;
  client_email?: string;
  processor_name?: string;
  reviewer_name?: string;
}

export interface ChecklistItem {
  id: string;
  workflow_id: string;
  phase: WorkflowPhase;
  item_key: string;
  is_checked: boolean;
  notes: string | null;
  checked_by: string | null;
  checked_at: string | null;
}

export interface WorkflowNote {
  id: string;
  workflow_id: string;
  note_text: string;
  created_by: string | null;
  created_at: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_text: string | null;
  // joined
  creator_name?: string;
  resolver_name?: string;
}

export interface QueryItem {
  id: string;
  workflow_id: string;
  description: string;
  amount: number | null;
  transaction_date: string | null;
  flagged_by: string | null;
  flagged_at: string;
  needs_client: boolean;
  client_response: string | null;
  responded_at: string | null;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  phase_added: WorkflowPhase;
  // joined
  flagged_by_name?: string;
}

export interface WorkflowMessage {
  id: string;
  workflow_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface DriveLink {
  id: string;
  workflow_id: string;
  storage: 'gdrive' | 'smartvault';
  label: string;
  url: string;
  saved_by: string | null;
  saved_at: string;
}

// ── Checklist Definitions ─────────────────────────────────────────────────────

export const PHASE_A_ITEMS = [
  { key: 'FR-10', label: 'Post all bank and credit card transactions', requires: null },
  { key: 'FR-11', label: 'Verify GL coding on all transactions', requires: null },
  { key: 'FR-12', label: 'Reconcile all bank accounts', requires: null },
  { key: 'FR-13', label: 'Reconcile all credit card accounts', requires: null },
  { key: 'FR-14', label: 'Post split for loan payments', requires: 'has_loans' },
  { key: 'FR-15', label: 'Reconcile loan accounts', requires: 'has_loans' },
  { key: 'FR-16', label: 'Check vendor list for duplicates', requires: null },
  { key: 'FR-17', label: 'Check customer list for duplicates', requires: null },
  { key: 'FR-18', label: 'Check COA for misspelled names', requires: null },
  { key: 'FR-19', label: 'Check COA for missing account numbers', requires: null },
  { key: 'FR-20', label: 'Save all checks to SmartVault', requires: null },
  { key: 'FR-21', label: 'All checks/expenses have a vendor name (0 Transactions Without Payee)', requires: null },
  { key: 'FR-22', label: 'Research uncleared transactions & report outstanding to Daja', requires: null },
  { key: 'FR-23', label: 'Flag transactions that cannot be allocated without client input', requires: null },
  { key: 'FR-24', label: 'Move unreviewed uncategorized transactions to Uncategorized account', requires: null },
  { key: 'FR-25', label: 'Check all uncategorized transactions on General Ledger (GDrive)', requires: null },
] as const;

export const PHASE_B_ITEMS = [
  { key: 'FR-31', label: 'Pull Balance Sheet by Month', requires: null },
  { key: 'FR-31b', label: 'Pull P&L by Month', requires: null },
  { key: 'FR-31c', label: 'Pull P&L Details', requires: null },
  { key: 'FR-31d', label: 'Pull Transaction List by Date', requires: null },
  { key: 'FR-32', label: 'Check Balance Sheet by Month — all accounts accurate', requires: null },
  { key: 'FR-33', label: 'Check fixed assets (if applicable)', requires: 'has_fixed_assets' },
  { key: 'FR-34', label: 'Flag BS accounts with significant changes — forward to Daja if needed', requires: null },
  { key: 'FR-35', label: 'Check P&L by Month for accuracy', requires: null },
  { key: 'FR-36', label: 'Flag significant P&L changes — forward to Daja if needed', requires: null },
  { key: 'FR-37', label: 'Build pivot from Transaction List — check for duplicate vendors/customers', requires: null },
  { key: 'FR-38', label: 'Verify only 1 categorization per vendor (except banks)', requires: null },
  { key: 'FR-39', label: 'Confirm no uncleared transactions older than 3 months', requires: null },
  { key: 'FR-40', label: 'Check undeposited funds — forward to Belly if found', requires: null },
  { key: 'FR-41', label: 'Complete Query Sheet — confirm accurate and ready for client', requires: null },
] as const;

export const PHASE_C_ITEMS = [
  { key: 'FR-50', label: 'Review all Reviewer notes from Query Sheet', requires: null },
  { key: 'FR-52', label: 'Save updated Balance Sheet to GDrive', requires: null },
  { key: 'FR-53', label: 'Save updated Profit & Loss to GDrive', requires: null },
  { key: 'FR-54', label: 'Attach updated Query Sheet to GDrive folder', requires: null },
] as const;

export const PHASE_D_ITEMS = [
  { key: 'FR-60', label: 'Review Query Sheet — confirm ready for client', requires: null },
  { key: 'FR-61', label: 'Save Balance Sheet to SmartVault', requires: null },
  { key: 'FR-62', label: 'Save Profit & Loss to SmartVault', requires: null },
  { key: 'FR-63', label: 'Save Query Sheet to SmartVault', requires: null },
  { key: 'FR-64', label: 'Send client notification: reports updated on SmartVault', requires: null },
] as const;

// ── Workflow Instances ────────────────────────────────────────────────────────

export async function getWorkflowInstances(month?: string): Promise<WorkflowInstance[]> {
  let q = supabase
    .from('workflow_instances')
    .select(`
      *,
      client:profiles!workflow_instances_client_id_fkey(full_name, email),
      processor:profiles!workflow_instances_assigned_processor_fkey(full_name),
      reviewer:profiles!workflow_instances_assigned_reviewer_fkey(full_name)
    `)
    .order('updated_at', { ascending: false });

  if (month) q = q.eq('month', month);

  const { data, error } = await q;
  if (error) { console.error('getWorkflowInstances:', error.message); return []; }

  return (data ?? []).map((r: any) => ({
    ...r,
    client_name:    r.client?.full_name ?? '',
    client_email:   r.client?.email ?? '',
    processor_name: r.processor?.full_name ?? '',
    reviewer_name:  r.reviewer?.full_name ?? '',
  }));
}

export async function getWorkflowById(id: string): Promise<WorkflowInstance | null> {
  const { data, error } = await supabase
    .from('workflow_instances')
    .select(`
      *,
      client:profiles!workflow_instances_client_id_fkey(full_name, email),
      processor:profiles!workflow_instances_assigned_processor_fkey(full_name),
      reviewer:profiles!workflow_instances_assigned_reviewer_fkey(full_name)
    `)
    .eq('id', id)
    .single();

  if (error) { console.error('getWorkflowById:', error.message); return null; }
  return {
    ...data,
    client_name:    (data as any).client?.full_name ?? '',
    client_email:   (data as any).client?.email ?? '',
    processor_name: (data as any).processor?.full_name ?? '',
    reviewer_name:  (data as any).reviewer?.full_name ?? '',
  };
}

export async function createWorkflowInstance(params: {
  client_id: string;
  month: string;
  accounting_software: AccountingSoftware;
  assigned_processor: string | null;
  assigned_reviewer: string | null;
  has_loans: boolean;
  has_fixed_assets: boolean;
  created_by: string;
}): Promise<WorkflowInstance | null> {
  const { data, error } = await supabase
    .from('workflow_instances')
    .insert({ ...params, status: 'processor' })
    .select()
    .single();

  if (error) { console.error('createWorkflowInstance:', error.message); return null; }
  return data;
}

export async function updateWorkflowStatus(id: string, status: WorkflowStatus): Promise<boolean> {
  const { error } = await supabase
    .from('workflow_instances')
    .update({ status })
    .eq('id', id);
  if (error) { console.error('updateWorkflowStatus:', error.message); return false; }
  return true;
}

export async function updateWorkflowSettings(id: string, updates: Partial<Pick<WorkflowInstance, 'month' | 'accounting_software' | 'assigned_processor' | 'assigned_reviewer' | 'has_loans' | 'has_fixed_assets'>>): Promise<boolean> {
  const { error } = await supabase.from('workflow_instances').update(updates).eq('id', id);
  if (error) { console.error('updateWorkflowSettings:', error.message); return false; }
  return true;
}

/**
 * Remove a workflow outright. Its checklist items, notes, query items, messages
 * and drive links are all declared ON DELETE CASCADE, so they go with it — no
 * manual cleanup, and nothing left orphaned.
 */
export async function deleteWorkflowInstance(id: string): Promise<boolean> {
  const { error } = await supabase.from('workflow_instances').delete().eq('id', id);
  if (error) { console.error('deleteWorkflowInstance:', error.message); return false; }
  return true;
}

export async function markClientNotified(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('workflow_instances')
    .update({ client_notified_at: new Date().toISOString(), status: 'complete' })
    .eq('id', id);
  if (error) { console.error('markClientNotified:', error.message); return false; }
  return true;
}

// ── Checklist Items ───────────────────────────────────────────────────────────

export async function getChecklist(workflowId: string, phase: WorkflowPhase): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from('workflow_checklist_items')
    .select('*')
    .eq('workflow_id', workflowId)
    .eq('phase', phase);
  if (error) { console.error('getChecklist:', error.message); return []; }
  return data ?? [];
}

export async function upsertChecklistItem(params: {
  workflow_id: string;
  phase: WorkflowPhase;
  item_key: string;
  is_checked: boolean;
  notes?: string;
  checked_by: string;
}): Promise<boolean> {
  const { error } = await supabase
    .from('workflow_checklist_items')
    .upsert({
      ...params,
      checked_at: params.is_checked ? new Date().toISOString() : null,
    }, { onConflict: 'workflow_id,item_key' });
  if (error) { console.error('upsertChecklistItem:', error.message); return false; }
  return true;
}

// ── Workflow Notes ────────────────────────────────────────────────────────────

export async function getWorkflowNotes(workflowId: string): Promise<WorkflowNote[]> {
  const { data, error } = await supabase
    .from('workflow_notes')
    .select(`*, creator:profiles!workflow_notes_created_by_fkey(full_name), resolver:profiles!workflow_notes_resolved_by_fkey(full_name)`)
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getWorkflowNotes:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    ...r,
    creator_name:  r.creator?.full_name ?? '',
    resolver_name: r.resolver?.full_name ?? '',
  }));
}

export async function addWorkflowNote(params: {
  workflow_id: string;
  note_text: string;
  created_by: string;
}): Promise<WorkflowNote | null> {
  const { data, error } = await supabase
    .from('workflow_notes')
    .insert(params)
    .select()
    .single();
  if (error) { console.error('addWorkflowNote:', error.message); return null; }
  return data;
}

export async function resolveWorkflowNote(id: string, resolved_by: string, resolution_text: string): Promise<boolean> {
  const { error } = await supabase
    .from('workflow_notes')
    .update({ is_resolved: true, resolved_by, resolved_at: new Date().toISOString(), resolution_text })
    .eq('id', id);
  if (error) { console.error('resolveWorkflowNote:', error.message); return false; }
  return true;
}

// ── Query Items ───────────────────────────────────────────────────────────────

export async function getQueryItems(workflowId: string): Promise<QueryItem[]> {
  const { data, error } = await supabase
    .from('workflow_query_items')
    .select(`*, flagged_by_profile:profiles!workflow_query_items_flagged_by_fkey(full_name)`)
    .eq('workflow_id', workflowId)
    .order('flagged_at', { ascending: true });
  if (error) { console.error('getQueryItems:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    ...r,
    flagged_by_name: r.flagged_by_profile?.full_name ?? '',
  }));
}

export async function addQueryItem(params: {
  workflow_id: string;
  description: string;
  amount?: number | null;
  transaction_date?: string | null;
  flagged_by: string;
  needs_client: boolean;
  phase_added: WorkflowPhase;
}): Promise<QueryItem | null> {
  const { data, error } = await supabase
    .from('workflow_query_items')
    .insert(params)
    .select()
    .single();
  if (error) { console.error('addQueryItem:', error.message); return null; }
  return data;
}

export async function resolveQueryItem(id: string, resolved_by: string): Promise<boolean> {
  const { error } = await supabase
    .from('workflow_query_items')
    .update({ is_resolved: true, resolved_by, resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('resolveQueryItem:', error.message); return false; }
  return true;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getWorkflowMessages(workflowId: string): Promise<WorkflowMessage[]> {
  const { data, error } = await supabase
    .from('workflow_messages')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getWorkflowMessages:', error.message); return []; }
  return data ?? [];
}

export async function sendWorkflowMessage(params: {
  workflow_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
}): Promise<boolean> {
  const { error } = await supabase.from('workflow_messages').insert(params);
  if (error) { console.error('sendWorkflowMessage:', error.message); return false; }
  return true;
}

// ── Drive Links ───────────────────────────────────────────────────────────────

export async function getDriveLinks(workflowId: string): Promise<DriveLink[]> {
  const { data, error } = await supabase
    .from('workflow_drive_links')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('saved_at', { ascending: true });
  if (error) { console.error('getDriveLinks:', error.message); return []; }
  return data ?? [];
}

export async function saveDriveLink(params: {
  workflow_id: string;
  storage: 'gdrive' | 'smartvault';
  label: string;
  url: string;
  saved_by: string;
}): Promise<boolean> {
  const { error } = await supabase.from('workflow_drive_links').insert(params);
  if (error) { console.error('saveDriveLink:', error.message); return false; }
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  processor:     'Processing',
  reviewer:      'Review',
  reprocessor:   'Reprocessing',
  report_sender: 'Sending Reports',
  complete:      'Complete',
};

export const STATUS_COLOR: Record<WorkflowStatus, string> = {
  processor:     '#F59E0B',
  reviewer:      '#6366F1',
  reprocessor:   '#EC4899',
  report_sender: '#10B981',
  complete:      '#94A3B8',
};

export const PHASE_LABEL: Record<WorkflowPhase, string> = {
  A: 'Processor',
  B: 'Reviewer',
  C: 'Reprocessor',
  D: 'Report Sender',
};

/** Returns the next status after submitting a phase */
export const NEXT_STATUS: Record<WorkflowStatus, WorkflowStatus | null> = {
  processor:     'reviewer',
  reviewer:      'reprocessor',
  reprocessor:   'report_sender',
  report_sender: 'complete',
  complete:      null,
};

/** Current month string in YYYY-MM format */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  const date = new Date(Number(y), Number(mo) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
