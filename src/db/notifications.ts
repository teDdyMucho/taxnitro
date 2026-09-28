import { supabase } from '../lib/supabase';

export type NotificationType = 'new' | 'upload' | 'viewed' | 'reminder' | 'approved' | 'rejected';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) { console.error('getNotifications:', error.message); return []; }
  return data ?? [];
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) { console.error('markNotificationRead:', error.message); return false; }
  return true;
}

export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) { console.error('markAllNotificationsRead:', error.message); return false; }
  return true;
}

/**
 * Both deletes ask for the rows back.
 *
 * A delete that row-level security refuses is not an error — it matches
 * nothing and returns quietly — so these reported success while the table was
 * untouched and every notification came back on the next refresh. Asking which
 * rows went is the difference between "deleted" and "asked politely".
 */
export async function deleteNotification(notificationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .select('id');

  if (error) { console.error('deleteNotification:', error.message); return false; }
  if (!data?.length) { console.error('deleteNotification: nothing was deleted'); return false; }
  return true;
}

export async function deleteAllNotifications(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .select('id');

  if (error) { console.error('deleteAllNotifications:', error.message); return false; }
  // Nothing to clear is a fine outcome; nothing cleared when there was
  // something is not, and the caller can now tell.
  if (!data) { console.error('deleteAllNotifications: nothing was deleted'); return false; }
  return true;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) { console.error('getUnreadCount:', error.message); return 0; }
  return count ?? 0;
}
