import { supabase } from '../lib/supabase';

export type CustomRequestStatus = 'pending' | 'uploaded' | 'approved' | 'rejected';

export interface CustomRequest {
  id: string;
  client_email: string;
  title: string;
  note: string | null;
  month: string;
  status: CustomRequestStatus;
  document_id: string | null;
  document_table: string | null;
  requested_by: string | null;
  created_at: string;
}

/** All custom requests for a client in a month (client + admin views). */
export async function getCustomRequests(clientEmail: string, month: string): Promise<CustomRequest[]> {
  const { data, error } = await supabase
    .from('custom_document_requests')
    .select('*')
    .eq('client_email', clientEmail)
    .eq('month', month)
    .order('created_at', { ascending: true });
  if (error) { console.error('getCustomRequests:', error.message); return []; }
  return (data ?? []) as CustomRequest[];
}

/** Staff creates a one-off document request for a client. */
export async function createCustomRequest(params: {
  clientEmail: string;
  title: string;
  note?: string;
  month: string;
  requestedBy: string;
}): Promise<boolean> {
  const { error } = await supabase.from('custom_document_requests').insert({
    client_email: params.clientEmail,
    title:        params.title,
    note:         params.note ?? null,
    month:        params.month,
    requested_by: params.requestedBy,
    status:       'pending',
  });
  if (error) { console.error('createCustomRequest:', error.message); return false; }
  return true;
}

/** Client marks a request 'uploaded' after attaching a file. */
export async function fulfillCustomRequest(requestId: string, documentId: string, documentTable: string): Promise<boolean> {
  const { error } = await supabase
    .from('custom_document_requests')
    .update({ status: 'uploaded', document_id: documentId, document_table: documentTable })
    .eq('id', requestId);
  if (error) { console.error('fulfillCustomRequest:', error.message); return false; }
  return true;
}

/** Staff approves or rejects a fulfilled custom request. */
export async function setCustomRequestStatus(requestId: string, status: 'approved' | 'rejected'): Promise<boolean> {
  const { error } = await supabase
    .from('custom_document_requests')
    .update({ status })
    .eq('id', requestId);
  if (error) { console.error('setCustomRequestStatus:', error.message); return false; }
  return true;
}

/** Staff deletes a custom request. */
export async function deleteCustomRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase.from('custom_document_requests').delete().eq('id', requestId);
  if (error) { console.error('deleteCustomRequest:', error.message); return false; }
  return true;
}
