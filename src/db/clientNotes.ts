import { supabase } from '../lib/supabase';

// Business details on a client's profile — context the team writes down as it
// learns it, so whoever opens that client's files next knows what the last
// person knew. See database/client_notes.sql.
//
// Internal: staff and admin only, enforced by RLS. The client never sees these.

export interface ClientNote {
  id: string;
  client_email: string;
  body: string;
  /** Who wrote it, captured at write time so it survives them leaving. */
  author_email: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

/** A client's notes, newest first. */
export async function listClientNotes(clientEmail: string): Promise<ClientNote[]> {
  if (!clientEmail) return [];
  const { data, error } = await supabase
    .from('client_notes')
    .select('*')
    .eq('client_email', clientEmail)
    .order('created_at', { ascending: false });
  if (error) { console.error('listClientNotes:', error.message); return []; }
  return (data ?? []) as ClientNote[];
}

/** Add a note. Returns the row, or null if it could not be written. */
export async function createClientNote(
  clientEmail: string,
  body: string,
  author: { email?: string | null; name?: string | null },
): Promise<ClientNote | null> {
  const text = body.trim();
  if (!clientEmail || !text) return null;
  const { data, error } = await supabase
    .from('client_notes')
    .insert({
      client_email: clientEmail,
      body: text,
      author_email: author.email ?? null,
      author_name: author.name ?? null,
    })
    .select('*')
    .single();
  if (error) { console.error('createClientNote:', error.message); return null; }
  return data as ClientNote;
}

/** Rewrite a note. The author is left as it was — it records who first knew this. */
export async function updateClientNote(id: string, body: string): Promise<ClientNote | null> {
  const text = body.trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from('client_notes')
    .update({ body: text })
    .eq('id', id)
    .select('*')
    .single();
  if (error) { console.error('updateClientNote:', error.message); return null; }
  return data as ClientNote;
}

export async function deleteClientNote(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('client_notes')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) { console.error('deleteClientNote:', error.message); return false; }
  return !!data && data.length > 0;
}
