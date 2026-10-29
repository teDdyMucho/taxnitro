// Camaree: "please let me know when email notifications for all activity and
// updates for Team One, Clients, and Staff are implemented."
//
// What the app did not email yet, it tells n8n here, and n8n sends it from info@
// (automation/n8n/ftg-activity-email.json):
//   - a client: FTG accepted or sent back their upload, replied on one of their
//     files, or left them a note;
//   - Team One: FTG wrote in a client's chat, reviewed their links and files, or
//     gave them a client;
//   - FTG, at accounting@: Team One sent an update or wrote in a client's chat.
//
// The webhook is open to anyone, so an email to a client or to Team One holds
// nothing from this request but how many of each: n8n finds the address itself
// (database/activity_emails.sql) and writes every word. Only FTG's own inbox
// gets what someone typed, and the flow escapes it.
//
// Ten approvals in a row make one email, not ten. What happens for the same
// person is held until a minute passes with nothing new, five at most, and
// leaving the page sends what is waiting. Never holds up or fails what it is
// about.

const WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/ftg-activity-email';

/** Send once this long passes with nothing new for the same person… */
const QUIET_MS = 60 * 1000;
/** …or this long after the first thing, whichever comes first. */
const MOST_MS = 5 * 60 * 1000;

/** What a client hears about. */
export type ClientNews = 'accepted' | 'declined' | 'replies' | 'notes';
/** What Team One hears about. sent_back is denied, or sent back by Daja to revise. */
export type TeamOneNews = 'messages' | 'approved' | 'sent_back' | 'escalated' | 'noted' | 'access';

type Audience = 'client' | 'team_one' | 'ftg';

interface Batch {
  audience: Audience;
  clientEmail: string;
  clientName: string;
  counts: Record<string, number>;
  /** FTG only: Team One's update, a line per service. */
  updates: string[];
  /** FTG only: Team One's chat messages. */
  messages: string[];
  since: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const waiting = new Map<string, Batch>();

function send(key: string, leaving = false): void {
  const b = waiting.get(key);
  if (!b) return;
  waiting.delete(key);
  if (b.timer) clearTimeout(b.timer);
  try {
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Lets the request finish after the page is gone.
      keepalive: leaving,
      body: JSON.stringify({
        audience: b.audience,
        client_email: b.clientEmail,
        client_name: b.clientName,
        counts: b.counts,
        updates: b.updates,
        messages: b.messages,
        sent_at: new Date().toISOString(),
      }),
    }).catch((e: any) => console.warn('Activity email notify failed (non-fatal):', e?.message));
  } catch (e: any) {
    console.warn('Activity email notify failed (non-fatal):', e?.message);
  }
}

function hold(
  audience: Audience,
  clientEmail: string | null | undefined,
  add: (b: Batch) => void,
  clientName?: string | null,
): void {
  const email = clientEmail?.trim().toLowerCase();
  if (!email) return;
  const key = `${audience}|${email}`;
  let b = waiting.get(key);
  if (!b) {
    b = { audience, clientEmail: email, clientName: '', counts: {}, updates: [], messages: [], since: Date.now(), timer: null };
    waiting.set(key, b);
  }
  add(b);
  if (clientName?.trim()) b.clientName = clientName.trim();
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => send(key), Math.max(0, Math.min(QUIET_MS, b.since + MOST_MS - Date.now())));
}

const tally = (what: string) => (b: Batch) => { b.counts[what] = (b.counts[what] ?? 0) + 1; };

/** Tell the client, by email to the address on their profile. */
export function emailClientAbout(clientEmail: string | null | undefined, what: ClientNews): void {
  hold('client', clientEmail, tally(what));
}

/** Tell Team One about one of its clients. */
export function emailTeamOneAbout(clientEmail: string | null | undefined, what: TeamOneNews): void {
  hold('team_one', clientEmail, tally(what));
}

/** Tell FTG Team One sent an update: a line per service, as it reads in the email. */
export function emailFtgTeamOneUpdate(clientEmail: string | null | undefined, clientName: string | null | undefined, lines: string[]): void {
  const kept = lines.map(l => l.trim()).filter(Boolean);
  if (kept.length) hold('ftg', clientEmail, b => { b.updates.push(...kept); }, clientName);
}

/** Tell FTG Team One wrote in a client's chat. */
export function emailFtgTeamOneMessage(clientEmail: string | null | undefined, clientName: string | null | undefined, message: string): void {
  const text = message.trim();
  if (text) hold('ftg', clientEmail, b => { b.messages.push(text); }, clientName);
}

// Leaving or hiding the page sends what is waiting, rather than losing it.
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.addEventListener === 'function') {
  const leave = () => { for (const key of [...waiting.keys()]) send(key, true); };
  window.addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
}
