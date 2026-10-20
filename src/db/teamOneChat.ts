import { supabase } from '../lib/supabase';

// The chat between Team One and FTG on a client's profile
// (database/team_one_chat.sql). Daja, through Camaree: "a chat inside of each
// client profile that will allow them to communicate with FTG. This chat will
// only be visible to Team 1 and FTG. clients will not be able to see this on
// their end."
//
// The database decides who sees which thread: FTG all of them, Team One its
// assigned clients', the client none. Nothing here widens that.

export interface ChatMessage {
  id: string;
  client_email: string;
  sender_id: string;
  sender_name: string | null;
  sender_role: 'team_one' | 'staff' | 'admin';
  message: string;
  /** Read by the other side. */
  is_read: boolean;
  created_at: string;
}

const key = (email: string) => email.trim().toLowerCase();

/** Whose messages someone in this role reads, and is told about. */
export const otherSide = (role: string | null | undefined): ChatMessage['sender_role'][] =>
  role === 'team_one' ? ['staff', 'admin'] : ['team_one'];

/** A client's thread, oldest first. */
export async function listChat(clientEmail: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('team_one_chat')
    .select('*')
    .eq('client_email', key(clientEmail))
    .order('created_at', { ascending: true });
  if (error) { console.warn('listChat:', error.message); return []; }
  return (data ?? []) as ChatMessage[];
}

export async function sendChat(
  clientEmail: string,
  message: string,
  me: { id: string; name?: string | null; role: string },
): Promise<ChatMessage | null> {
  const text = message.trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from('team_one_chat')
    .insert({
      client_email: key(clientEmail),
      sender_id: me.id,
      sender_name: me.name ?? null,
      sender_role: me.role,
      message: text,
    })
    .select('*')
    .single();
  if (error) { console.error('sendChat:', error.message); return null; }
  return data as ChatMessage;
}

/** The other side's messages in this thread, as read. */
export async function markChatRead(clientEmail: string): Promise<void> {
  const { error } = await supabase.rpc('read_team_one_chat', { p_email: key(clientEmail) });
  if (error) console.warn('markChatRead:', error.message);
}

export interface UnreadThread { client_email: string; count: number; last: ChatMessage }

/** Threads with unread messages from the other side, newest first. */
export async function unreadChats(role: string | null | undefined): Promise<UnreadThread[]> {
  const { data, error } = await supabase
    .from('team_one_chat')
    .select('*')
    .eq('is_read', false)
    .in('sender_role', otherSide(role))
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return [];
  const m = new Map<string, UnreadThread>();
  for (const row of (data ?? []) as ChatMessage[]) {
    const t = m.get(row.client_email);
    if (t) t.count += 1;
    else m.set(row.client_email, { client_email: row.client_email, count: 1, last: row });
  }
  return [...m.values()];
}

/** How many unread messages wait for someone in this role. */
export async function countUnreadChat(role: string | null | undefined): Promise<number> {
  const { count, error } = await supabase
    .from('team_one_chat')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .in('sender_role', otherSide(role));
  if (error) return 0;
  return count ?? 0;
}
