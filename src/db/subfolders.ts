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
  /** The subfolder this one sits inside; null when it sits in the folder itself. */
  parent_subfolder_id: string | null;
  name: string;
  created_by: string | null;
  created_at: string;
}

// The tree helpers live in lib/subfolderTree.ts, which imports nothing — the
// screens that draw the tree need them and should not have to reach through a
// database module to get there.
export { buildSubfolderTree, subfolderPath, descendantIds, type SubfolderNode } from '../lib/subfolderTree';

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
  /** The subfolder to create this one inside; null puts it in the folder itself. */
  parentSubfolderId: string | null = null,
): Promise<Subfolder | null> {
  const { data, error } = await supabase
    .from('custom_subfolders')
    .insert({
      parent_table: parentTable,
      name: name.trim(),
      created_by: createdBy,
      owner_email: ownerEmail,
      parent_subfolder_id: parentSubfolderId,
    })
    .select('*')
    .single();
  if (error) { console.error('createSubfolder:', error.message); return null; }
  return data as Subfolder;
}

/**
 * Rename a subfolder. Returns the row, or null if it could not be renamed —
 * most often because the client already has one by that name in this folder,
 * which the unique index refuses.
 *
 * Renaming moves nothing: the files keep pointing at the same id.
 */
export async function renameSubfolder(id: string, name: string): Promise<Subfolder | null> {
  const clean = name.trim();
  if (!id || !clean) return null;
  const { data, error } = await supabase
    .from('custom_subfolders')
    .update({ name: clean })
    .eq('id', id)
    .select('*')
    .single();
  if (error) { console.error('renameSubfolder:', error.message); return null; }
  return data as Subfolder;
}

// Delete a subfolder, and everything inside it — the database cascades to the
// children. Files are NOT deleted: their subfolder_id is reset by the ON DELETE
// SET NULL already on it, so they come back to the folder root.
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
