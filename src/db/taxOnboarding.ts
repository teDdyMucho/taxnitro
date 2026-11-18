import { supabase } from '../lib/supabase';
import type { TaxOnboarding, TaxSlotStatus } from '../lib/taxOnboarding';

// Reading and writing a client's tax onboarding (database/tax_onboarding.sql).
// The questions, the checklist and the rules are in lib/taxOnboarding.ts,
// re-exported here so a screen can take everything from one import.
export * from '../lib/taxOnboarding';

/** A client's onboarding for a season, or null if they have not started it. */
export async function getTaxOnboarding(clientEmail: string, season: string): Promise<TaxOnboarding | null> {
  if (!clientEmail) return null;
  const { data, error } = await supabase
    .from('tax_onboarding')
    .select('*')
    .eq('client_email', clientEmail)
    .eq('season', season)
    .maybeSingle();
  if (error) { console.error('getTaxOnboarding:', error.message); return null; }
  return data ? (data as TaxOnboarding) : null;
}

/**
 * Write part of a client's onboarding, starting it if need be. Only the
 * fields passed are written, so welcoming them never touches their answers
 * and saving answers never touches when they were welcomed.
 */
export async function saveTaxOnboarding(
  clientEmail: string,
  season: string,
  patch: Partial<Pick<TaxOnboarding, 'answers' | 'status' | 'welcomed_at' | 'submitted_at' | 'docs_confirmed_at'>>,
): Promise<TaxOnboarding | null> {
  if (!clientEmail) return null;
  const { data, error } = await supabase
    .from('tax_onboarding')
    .upsert({ client_email: clientEmail, season, ...patch }, { onConflict: 'client_email,season' })
    .select('*')
    .single();
  if (error) { console.error('saveTaxOnboarding:', error.message); return null; }
  return data as TaxOnboarding;
}

/** One checklist document's slot: service 'TAX', the season in the month column. */
export interface TaxSlot {
  requirement_key: string;
  status: TaxSlotStatus;
  document_id: string | null;
  document_table: string | null;
}

/** Where each of a client's tax documents stands this season. */
export async function getTaxSlots(clientEmail: string, season: string): Promise<TaxSlot[]> {
  if (!clientEmail) return [];
  const { data, error } = await supabase
    .from('document_requirements')
    .select('requirement_key, status, document_id, document_table')
    .eq('client_email', clientEmail)
    .eq('service', 'TAX')
    .eq('month', season);
  if (error) { console.error('getTaxSlots:', error.message); return []; }
  return (data ?? []).map(r => ({ ...r, status: (r.status ?? 'pending') as TaxSlotStatus })) as TaxSlot[];
}

/** The file a slot points at: the first of the latest batch sent for it. */
export interface SlotFile {
  name: string;
  url: string;
  approval_status: 'pending' | 'approved' | 'rejected';
}

/** The files these slots point at, by document id. One query per folder table. */
export async function slotFiles(slots: TaxSlot[]): Promise<Map<string, SlotFile>> {
  const out = new Map<string, SlotFile>();
  const byTable = new Map<string, string[]>();
  slots
    .filter(sl => sl.document_id && sl.document_table)
    .forEach(sl => byTable.set(sl.document_table!, [...(byTable.get(sl.document_table!) ?? []), sl.document_id!]));
  await Promise.all([...byTable.entries()].map(async ([table, ids]) => {
    const { data, error } = await supabase
      .from(table)
      .select('id, name, file_name, document_url, approval_status')
      .in('id', ids);
    if (error) { console.error('slotFiles:', error.message); return; }
    (data ?? []).forEach((d: any) => out.set(d.id, {
      name: d.file_name || d.name || 'Document',
      url: d.document_url,
      approval_status: d.approval_status ?? 'pending',
    }));
  }));
  return out;
}

/**
 * The ids, among these sent-back slots, whose file is one FTG has not
 * reviewed yet: the client has already sent a new one. A declined slot stays
 * declined until FTG accepts the new file, so this is how the client's page
 * can say "sent again" instead of asking them for it twice.
 */
export async function unreviewedFiles(slots: TaxSlot[]): Promise<Set<string>> {
  const files = await slotFiles(slots.filter(sl => sl.status === 'rejected'));
  return new Set([...files.entries()].filter(([, f]) => f.approval_status === 'pending').map(([id]) => id));
}

/** Every client's onboarding for a season — the staff list. */
export async function listTaxOnboardings(season: string): Promise<TaxOnboarding[]> {
  const { data, error } = await supabase
    .from('tax_onboarding')
    .select('*')
    .eq('season', season);
  if (error) { console.error('listTaxOnboardings:', error.message); return []; }
  return (data ?? []) as TaxOnboarding[];
}
