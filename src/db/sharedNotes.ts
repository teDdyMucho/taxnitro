import { supabase } from '../lib/supabase';
import type { ClientNote } from './clientNotes';

// Notes FTG leaves for a client, which the client reads — Camaree: "Profile Note
// comments requires a place on the STAFF side for FTG to add comments that will
// be visible to clients." They show on the client's dashboard under What's Next.
//
// Unlike client_notes (Business details), which are internal and never shown to
// the client. Stored in client_shared_notes (database/team_one_updates.sql);
// staff write them, the client can only read their own.
//
// Rows come back in ClientNote's shape so the same panel shows both kinds. This
// table keeps no edit time, so updated_at is the created time.

const key = (email: string) => email.trim().toLowerCase();

const asNote = (r: any): ClientNote => ({
  id: r.id,
  client_email: r.client_email,
  body: r.body,
  author_email: r.author_email ?? null,
  author_name: r.author_name ?? null,
  created_at: r.created_at,
  updated_at: r.created_at,
});

/** A client's notes from FTG, newest first. */
export async function listSharedNotes(clientEmail: string): Promise<ClientNote[]> {
  if (!clientEmail) return [];
  const { data, error } = await supabase
    .from('client_shared_notes')
    .select('*')
    .eq('client_email', key(clientEmail))
    .order('created_at', { ascending: false });
  if (error) { console.warn('listSharedNotes:', error.message); return []; }
  return (data ?? []).map(asNote);
}

/** Leave the client a note, and tell them it is there. */
export async function createSharedNote(
  clientEmail: string,
  body: string,
  author: { email?: string | null; name?: string | null },
): Promise<ClientNote | null> {
  const text = body.trim();
  if (!clientEmail || !text) return null;
  const { data, error } = await supabase
    .from('client_shared_notes')
    .insert({
      client_email: key(clientEmail),
      body: text,
      author_email: author.email ?? null,
      author_name: author.name ?? null,
      source: 'staff',
    })
    .select('*')
    .single();
  if (error) { console.error('createSharedNote:', error.message); return null; }
  await supabase.rpc('notify_client', {
    p_email: clientEmail,
    p_title: 'A note from FTG',
    p_message: text.length > 140 ? `${text.slice(0, 137)}…` : text,
  });
  return asNote(data);
}

/** Rewrite a note. The client is not told again. */
export async function updateSharedNote(id: string, body: string): Promise<ClientNote | null> {
  const text = body.trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from('client_shared_notes')
    .update({ body: text })
    .eq('id', id)
    .select('*')
    .single();
  if (error) { console.error('updateSharedNote:', error.message); return null; }
  return asNote(data);
}

export async function deleteSharedNote(id: string): Promise<boolean> {
  const { error } = await supabase.from('client_shared_notes').delete().eq('id', id);
  if (error) { console.error('deleteSharedNote:', error.message); return false; }
  return true;
}
