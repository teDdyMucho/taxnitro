import { supabase } from '../lib/supabase';

// The how-tos (public.sops): what the help chat answers from, shown on the
// How-to page. Rows come back already limited by RLS to what the signed-in
// person may read (database/sops.sql, database/sops_team_one.sql): a client
// the client ones, Team One theirs, staff every one.

export type HowToAudience = 'client' | 'internal' | 'team_one';

export interface HowTo {
  slug: string;
  title: string;
  /** Markdown: **bold**, "- " bullets, "1. " steps. */
  body: string;
  audience: HowToAudience;
  category: string | null;
  tags: string[];
  /** The narrated video, where one has been made. */
  video_url: string | null;
}

/** Every live how-to this person may read. Staff can also read retired ones; those stay out. */
export async function listHowTos(): Promise<HowTo[]> {
  const { data, error } = await supabase
    .from('sops')
    .select('slug, title, body, audience, category, tags, video_url')
    .eq('is_active', true)
    .order('title');
  if (error) { console.warn('listHowTos:', error.message); return []; }
  return (data ?? []).map(r => ({ ...r, tags: r.tags ?? [] })) as HowTo[];
}
