import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export type DocumentStatus   = 'new' | 'viewed' | 'not_viewed';
export type ApprovalStatus   = 'pending' | 'approved' | 'rejected';

export interface Document {
  id: string;
  user_id: string | null;
  name: string;
  file_name: string | null;
  document_url: string;
  document_type: string | null;
  email: string | null;
  status: DocumentStatus;
  approval_status: ApprovalStatus;
  approval_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at?: string;
}

// All folder tables — matches the subfolder keys in DocumentsScreen
export const FOLDER_TABLES = [
  'tax_client_uploads',
  'tax_required_documents',
  'tax_contracts',
  'tax_invoices',
  'tax_return_information',
  'bk_required_documents',
  'bk_contracts',
  'bk_invoices',
  'bk_for_client_review',
  'bk_final_pnl',
] as const;

export type FolderTable = typeof FOLDER_TABLES[number];

// ── Fetch from all 8 tables and merge ────────────────────────────────────────

export async function getDocumentsByEmail(email: string): Promise<Document[]> {
  const settled = await Promise.allSettled(
    FOLDER_TABLES.map(async (table) => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false });

      if (error) { console.error(`getDocumentsByEmail [${table}]:`, error.message); return [] as Document[]; }
      return (data ?? []).map(d => ({
        ...d,
        document_type: table,
        approval_status: d.approval_status ?? 'approved', // default for pre-migration rows
        approval_note: d.approval_note ?? null,
      } as Document));
    })
  );

  // Also try the legacy documents table so old data still appears
  const legacySettled = await Promise.allSettled([
    supabase.from('documents').select('*').eq('email', email).order('created_at', { ascending: false }),
  ]);

  const legacyDocs: Document[] = [];
  if (legacySettled[0].status === 'fulfilled') {
    const { data } = legacySettled[0].value;
    (data ?? []).forEach(d => legacyDocs.push({
      ...d,
      approval_status: 'approved',
      approval_note: null,
    } as Document));
  }

  const newDocs = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  const seen = new Set<string>();
  const merged: Document[] = [];
  for (const d of [...newDocs, ...legacyDocs]) {
    if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); }
  }

  return merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ── Fetch ALL documents across all tables (admin only) ───────────────────────

export async function getAllDocuments(): Promise<Document[]> {
  const settled = await Promise.allSettled(
    FOLDER_TABLES.map(async (table) => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) { console.error(`getAllDocuments [${table}]:`, error.message); return [] as Document[]; }
      return (data ?? []).map(d => ({
        ...d,
        document_type: table,
        approval_status: d.approval_status ?? 'approved',
        approval_note: d.approval_note ?? null,
      } as Document));
    })
  );
  const docs = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  return docs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ── Fetch only PENDING documents across all tables (admin only) ──────────────

export async function getPendingDocuments(): Promise<Document[]> {
  const settled = await Promise.allSettled(
    FOLDER_TABLES.map(async (table) => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false });
      if (error) { console.error(`getPendingDocuments [${table}]:`, error.message); return [] as Document[]; }
      return (data ?? []).map(d => ({
        ...d,
        document_type: table,
        approval_status: 'pending' as ApprovalStatus,
        approval_note: d.approval_note ?? null,
      } as Document));
    })
  );
  const docs = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  return docs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ── Update view status in the correct table ───────────────────────────────────

export async function updateDocumentStatus(
  documentId: string,
  status: DocumentStatus,
  table: string,
): Promise<boolean> {
  const { error } = await supabase
    .from(table)
    .update({ status })
    .eq('id', documentId);

  if (error) { console.error(`updateDocumentStatus [${table}]:`, error.message); return false; }
  return true;
}

// ── Approve a document (via RPC to bypass RLS) ───────────────────────────────

export async function approveDocument(
  documentId: string,
  table: string,
  approvedBy: string,
): Promise<boolean> {
  const { error } = await supabase.rpc('approve_document', {
    p_table:       table,
    p_doc_id:      documentId,
    p_approved_by: approvedBy,
  });
  if (error) { console.error('approveDocument:', error.message); return false; }
  return true;
}

// ── Reject a document (via RPC to bypass RLS) ────────────────────────────────

export async function rejectDocument(
  documentId: string,
  table: string,
  rejectedBy: string,
  note?: string,
): Promise<boolean> {
  const { error } = await supabase.rpc('reject_document', {
    p_table:        table,
    p_doc_id:       documentId,
    p_rejected_by:  rejectedBy,
    p_note:         note ?? null,
  });
  if (error) { console.error('rejectDocument:', error.message); return false; }
  return true;
}

// ── Upload file to Supabase Storage → returns public URL ─────────────────────

export async function uploadDocumentToStorage(
  userId: string,
  documentType: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${userId}/${documentType}/${Date.now()}_${safeName}`;

  try {
    let uploadError: any = null;

    if (Platform.OS === 'web') {
      const res = await fetch(fileUri);
      const blob = await res.blob();
      const { error } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { contentType: mimeType, upsert: false });
      uploadError = error;
    } else {
      const formData = new FormData();
      formData.append('file', { uri: fileUri, name: safeName, type: mimeType } as any);
      const { error } = await supabase.storage
        .from('documents')
        .upload(filePath, formData, { upsert: false });
      uploadError = error;
    }

    if (uploadError) { console.error('uploadToStorage:', uploadError.message); return null; }

    const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err: any) {
    console.error('uploadDocumentToStorage:', err?.message ?? err);
    return null;
  }
}

// ── Delete a document row from its table ─────────────────────────────────────

export async function deleteDocument(documentId: string, table: string): Promise<boolean> {
  const { error } = await supabase.from(table).delete().eq('id', documentId);
  if (error) { console.error(`deleteDocument [${table}]:`, error.message); return false; }
  return true;
}

// ── Rename (update name + file_name) ─────────────────────────────────────────

export async function renameDocument(documentId: string, newName: string, table: string): Promise<boolean> {
  const { error } = await supabase
    .from(table)
    .update({ name: newName, file_name: newName })
    .eq('id', documentId);
  if (error) { console.error(`renameDocument [${table}]:`, error.message); return false; }
  return true;
}

// ── Insert into the correct folder table (starts as 'pending') ───────────────

export async function createDocumentRecord(params: {
  userId: string;
  email: string;
  name: string;
  documentUrl: string;
  documentType: string;
}): Promise<Document | null> {
  const { data, error } = await supabase
    .from(params.documentType)
    .insert({
      user_id: params.userId,
      email: params.email,
      name: params.name,
      file_name: params.name,
      document_url: params.documentUrl,
      status: 'new',
      approval_status: 'pending',
    })
    .select()
    .single();

  if (error) { console.error(`createDocumentRecord [${params.documentType}]:`, error.message); return null; }
  return {
    ...data,
    document_type: params.documentType,
    approval_status: 'pending',
    approval_note: null,
  } as Document;
}
