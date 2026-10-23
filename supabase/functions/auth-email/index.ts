// auth-email — the account emails Supabase sends itself (Forgot Password, and
// any other sign-in email), sent from info@ through n8n instead.
//
// Supabase's own sender only mails the project's team, a few an hour, so a
// client never got a reset email (database/SOP-GAPS.md, item 3). With this as
// its "Send Email" hook, Supabase hands every such email here: this checks
// Supabase signed it, builds the link, and passes it to the n8n flow that sends
// it from info@ (automation/n8n/ftg-account-email.json).
//
// Deploy: Edge Functions → Deploy a new function, named auth-email, with this
// file, and turn OFF "Verify JWT": Supabase Auth calls it, not a person.
// Secrets:
//   SEND_EMAIL_HOOK_SECRET  from Authentication → Hooks → Send Email hook (v1,whsec_…)
//   N8N_EMAIL_KEY           the same value as the n8n "FTG account email key" credential
// Then in Authentication → Hooks, point the Send Email hook (HTTPS) at
// <supabase url>/functions/v1/auth-email. SUPABASE_URL is provided by Supabase.

import { Webhook } from 'npm:standardwebhooks@1.0.0';

const N8N_URL = 'https://primary-production-6722.up.railway.app/webhook/ftg-account-email';

// What Supabase calls each email, and the n8n template for it.
const KIND: Record<string, string> = {
  recovery: 'reset',
  invite: 'invite',
  magiclink: 'magiclink',
  signup: 'signup',
  email: 'signup',
  // Not used by the app: emails are changed by staff, never by the person.
  email_change: 'email_change',
  reauthentication: 'code',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// Supabase reads { error: { http_code, message } } back as the reason it failed.
const fail = (status: number, message: string) => json(status, { error: { http_code: status, message } });

export async function handle(req: Request, env: (k: string) => string | undefined, send: typeof fetch = fetch) {
  if (req.method !== 'POST') return fail(405, 'POST only.');
  const secret = (env('SEND_EMAIL_HOOK_SECRET') ?? '').replace(/^v1,whsec_/, '');
  const key = env('N8N_EMAIL_KEY') ?? '';
  const base = (env('SUPABASE_URL') ?? '').replace(/\/$/, '');
  if (!secret || !key || !base) return fail(500, 'Account emails are not set up yet.');

  // Only Supabase, which signs every call with the hook's secret.
  let payload: any;
  try {
    payload = new Webhook(secret).verify(await req.text(), Object.fromEntries(req.headers));
  } catch {
    return fail(401, 'Not signed by Supabase.');
  }

  const user = payload?.user ?? {};
  const d = payload?.email_data ?? {};
  const kind = KIND[d.email_action_type];
  if (!kind) return fail(400, `No email for "${d.email_action_type}".`);
  const to = kind === 'email_change' ? (user.new_email || user.email) : user.email;
  if (!to) return fail(400, 'No address to send to.');

  const link = kind === 'code' ? '' : `${base}/auth/v1/verify?token=${encodeURIComponent(d.token_hash ?? '')}`
    + `&type=${encodeURIComponent(d.email_action_type)}&redirect_to=${encodeURIComponent(d.redirect_to || d.site_url || '')}`;

  const r = await send(N8N_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ftg-key': key },
    body: JSON.stringify({ kind, to, name: user.user_metadata?.full_name ?? '', link, code: d.token ?? '' }),
  }).catch(() => null);
  if (!r?.ok) return fail(502, 'The email could not be sent. Please try again in a minute.');
  return json(200, {});
}

Deno.serve(req => handle(req, k => Deno.env.get(k)));
