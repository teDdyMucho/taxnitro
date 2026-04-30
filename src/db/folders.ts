import { supabase } from '../lib/supabase';

export type FolderStatus = 'new' | 'viewed' | 'not_viewed';

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  status: FolderStatus;
  created_at: string;
  updated_at: string;
}

export async function getFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) { console.error('getFolders:', error.message); return []; }
  return data ?? [];
}

export async function createFolder(userId: string, name: string): Promise<Folder | null> {
  const { data, error } = await supabase
    .from('folders')
    .insert({ user_id: userId, name })
    .select()
    .single();

  if (error) { console.error('createFolder:', error.message); return null; }
  return data;
}

export async function updateFolder(folderId: string, updates: Partial<Pick<Folder, 'name' | 'status'>>) {
  const { data, error } = await supabase
    .from('folders')
    .update(updates)
    .eq('id', folderId)
    .select()
    .single();

  if (error) { console.error('updateFolder:', error.message); return null; }
  return data;
}

export async function deleteFolder(folderId: string): Promise<boolean> {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId);

  if (error) { console.error('deleteFolder:', error.message); return false; }
  return true;
}
