export type DocStatus = 'new' | 'viewed' | 'not_viewed';

export interface Document {
  id: string;
  user_id: string | null;
  name: string;
  file_name: string | null;
  document_url: string;
  document_type: string | null;
  email: string | null;
  contact_id: string | null;
  status: DocStatus;
  created_at: string;
}
