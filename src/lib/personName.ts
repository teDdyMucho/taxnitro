// First and last name, kept beside full_name. See database/profiles_first_last_name.sql.

/** "First Last", with either half allowed to be missing. */
export const joinName = (first: string, last: string) =>
  [first.trim(), last.trim()].filter(Boolean).join(' ');

/**
 * A first guess at the split, offered in the form for a person to confirm.
 *
 * Only ever used to fill the two boxes on screen — never written without
 * someone seeing it. The last word is taken as the last name, which is right
 * for most names and plainly wrong for some ("Mary Ann Smith" is fine, a
 * surname of two words is not), which is why a person checks it.
 */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const words = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { first: words[0] ?? '', last: '' };
  return { first: words.slice(0, -1).join(' '), last: words[words.length - 1] };
}
