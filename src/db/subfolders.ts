import { supabase } from '../lib/supabase';

// Staff/admin-created subfolders that live inside an existing folder table.
// Scoped to ONE client via `owner_email` — see database/subfolders_per_client.sql.
// A document is filed into one via its `subfolder_id` column.
//
// Rows predating that migration have owner_email = null: shared folders that
// every client still sees. New ones are always owned.

export interface Subfolder {
  id: string;
  parent_table: string;
  /** Client this folder belongs to; null on the legacy shared rows. */
  owner_email: string | null;
  name: string;
  created_by: string | null;
  created_at: string;
}

/**
 * Subfolders inside a folder table (alphabetical).
 *
 * With an owner, returns that client's folders plus the legacy shared ones.
 * Without, returns every subfolder in the table — staff-wide views only.
 */
export async function listSubfolders(
  parentTable: string,
  ownerEmail?: string | null,
): Promise<Subfolder[]> {
  let q = supabase
    .from('custom_subfolders')
    .select('*')
    .eq('parent_table', parentTable)
    .order('name', { ascending: true });

  if (ownerEmail) q = q.or(`owner_email.eq.${ownerEmail},owner_email.is.null`);

  const { data, error } = await q;
  if (error) { console.error('listSubfolders:', error.message); return []; }
  return (data ?? []) as Subfolder[];
}

/**
 * Every subfolder belonging to one client, across all folder tables.
 *
 * The per-table version answers "what is in this folder"; a client's document
 * list spans many tables at once, so it needs the whole set keyed by id.
 */
export async function listSubfoldersForClient(ownerEmail: string): Promise<Subfolder[]> {
  if (!ownerEmail) return [];
  const { data, error } = await supabase
    .from('custom_subfolders')
    .select('*')
    .or(`owner_email.eq.${ownerEmail},owner_email.is.null`)
    .order('name', { ascending: true });
  if (error) { console.error('listSubfoldersForClient:', error.message); return []; }
  return (data ?? []) as Subfolder[];
}

/**
 * Create a subfolder for one client. Returns the row, or null on failure —
 * most often a duplicate name, which is unique per (table, owner).
 */
export async function createSubfolder(
  parentTable: string,
  name: string,
  createdBy: string | null,
  ownerEmail: string | null,
): Promise<Subfolder | null> {
  const { data, error } = await supabase
    .from('custom_subfolders')
    .insert({
      parent_table: parentTable,
      name: name.trim(),
      created_by: createdBy,
      owner_email: ownerEmail,
    })
    .select('*')
    .single();
  if (error) { console.error('createSubfolder:', error.message); return null; }
  return data as Subfolder;
}

// Delete a subfolder. Files inside it keep existing; their subfolder_id is
// reset to null by the ON DELETE SET NULL FK.
export async function deleteSubfolder(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('custom_subfolders')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) { console.error('deleteSubfolder:', error.message); return false; }
  return !!data && data.length > 0;
}

// File (or unfile with null) a document into a subfolder.
export async function moveDocumentToSubfolder(
  table: string,
  documentId: string,
  subfolderId: string | null,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .update({ subfolder_id: subfolderId })
    .eq('id', documentId)
    .select('id');
  if (error) { console.error(`moveDocumentToSubfolder [${table}]:`, error.message); return false; }
  return !!data && data.length > 0;
}
