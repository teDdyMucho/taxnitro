import { supabase } from '../lib/supabase';

export type DocumentStatus = 'new' | 'viewed' | 'not_viewed';

export interface Document {
  id: string;
  user_id: string | null;
  name: string;
  file_name: string | null;
  document_url: string;
  document_type: string | null;
  email: string | null;
  contact_id: string | null;
  status: DocumentStatus;
  created_at: string;
}

export async function getDocumentsByEmail(email: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('email', email)
    .order('created_at', { ascending: false });

  if (error) { console.error('getDocumentsByEmail:', error.message); return []; }
  return data ?? [];
}

export async function updateDocumentStatus(documentId: string, status: DocumentStatus): Promise<boolean> {
  const { error } = await supabase
    .from('documents')
    .update({ status })
    .eq('id', documentId);

  if (error) { console.error('updateDocumentStatus:', error.message); return false; }
  return true;
}
