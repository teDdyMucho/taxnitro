import { supabase } from '../lib/supabase';

// Staff/admin-created subfolders that live inside an existing folder table.
// Global per folder table (not per client). A document is filed into one via
// its `subfolder_id` column.

export interface Subfolder {
  id: string;
  parent_table: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

// List subfolders for a folder table (alphabetical).
export async function listSubfolders(parentTable: string): Promise<Subfolder[]> {
  const { data, error } = await supabase
    .from('custom_subfolders')
    .select('*')
    .eq('parent_table', parentTable)
    .order('name', { ascending: true });
  if (error) { console.error('listSubfolders:', error.message); return []; }
  return (data ?? []) as Subfolder[];
}

// Create a subfolder. Returns the row, or null on failure (e.g. duplicate name).
export async function createSubfolder(
  parentTable: string,
  name: string,
  createdBy: string | null,
): Promise<Subfolder | null> {
  const { data, error } = await supabase
    .from('custom_subfolders')
    .insert({ parent_table: parentTable, name: name.trim(), created_by: createdBy })
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
