// admin-users — the three things the app did with the service-role key, done
// here instead, so that key can leave the web bundle.
//
//   create_client   make a client's login and profile        (Clients → Add Client)
//   set_password    change a client's password                (Update Profile tray)
//   delete_staff    remove a staff or Team One login          (Staff page)
//   invite_client   email a client a link to set a password   (client profile → Invite)
//
// Anyone could read the key out of the bundle and use it to read every client's
// files, which also made Team One's limits meaningless. Here the key stays on
// Supabase's side, and every call is checked: the caller must be signed in as
// active staff or admin, and deleting is admin only.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function, named
// admin-users, with this file. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided to it by Supabase. Invites also need N8N_EMAIL_KEY, the same value
// as the n8n "FTG account email key" credential.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Where an invite's link comes back to, and the n8n flow that emails it from
// info@ (automation/n8n/ftg-account-email.json).
const APP_URL = 'https://financetherapygroup.netlify.app';
const N8N_EMAIL_URL = 'https://primary-production-6722.up.railway.app/webhook/ftg-account-email';

// What a new client's profile may carry. Role and active are set here, never
// taken from the request.
const PROFILE_FIELDS = [
  'first_name', 'last_name', 'company_name', 'client_id', 'plan',
  'services', 'has_qbo_access', 'bank_accounts',
] as const;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only.' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Who is asking — their own session, checked by Supabase.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return reply({ error: 'Please sign in again.' }, 401);
  const { data: me } = await admin
    .from('profiles').select('role, is_active').eq('id', auth.user.id).maybeSingle();
  const isStaff = !!me && (me.role === 'staff' || me.role === 'admin') && me.is_active !== false;
  if (!isStaff) return reply({ error: 'Only FTG staff can do this.' }, 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return reply({ error: 'Bad request.' }, 400); }

  // The profile of whoever is being acted on.
  const target = async (userId: string) =>
    (await admin.from('profiles').select('id, role').eq('id', userId).maybeSingle()).data;

  switch (body.action) {
    case 'create_client': {
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');
      const fullName = String(body.full_name ?? '').trim();
      if (!email || password.length < 8 || !fullName) {
        return reply({ error: 'Email, a password of 8 or more characters, and a name are needed.' }, 400);
      }
      const { data: made, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (error || !made?.user) return reply({ error: error?.message ?? 'Could not create the account.' }, 400);

      const extra: Record<string, unknown> = {};
      for (const f of PROFILE_FIELDS) if (body.profile?.[f] !== undefined) extra[f] = body.profile[f];
      const { error: profErr } = await admin.from('profiles').upsert(
        { id: made.user.id, email, full_name: fullName, ...extra, role: 'client', is_active: true },
        { onConflict: 'id' },
      );
      // The login exists either way; say so if the details did not all save.
      return reply({ id: made.user.id, profileError: profErr?.message ?? null });
    }

    case 'set_password': {
      const userId = String(body.user_id ?? '');
      const password = String(body.password ?? '');
      if (password.length < 8) return reply({ error: 'Passwords need 8 or more characters.' }, 400);
      const who = await target(userId);
      // A client's password, not a colleague's.
      if (!who || who.role !== 'client') return reply({ error: 'Only a client’s password can be changed here.' }, 403);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return reply({ error: error.message }, 400);
      return reply({ ok: true });
    }

    case 'delete_staff': {
      if (me.role !== 'admin') return reply({ error: 'Only an admin can remove a member.' }, 403);
      const userId = String(body.user_id ?? '');
      if (userId === auth.user.id) return reply({ error: 'You cannot remove yourself.' }, 400);
      const who = await target(userId);
      if (!who || (who.role !== 'staff' && who.role !== 'team_one')) {
        return reply({ error: 'Only staff and Team One logins can be removed here.' }, 403);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        // A foreign key in the way means something still points at them.
        const linked = /foreign key|violates/i.test(error.message);
        return reply({ error: linked ? 'This member is still linked to workflow records and cannot be deleted.' : error.message }, 400);
      }
      return reply({ ok: true });
    }

    // Camaree: "can we create an Invite button to allow us to invite clients
    // to the app directly from the app?" A one-time link that signs them in
    // and asks for a password, emailed from info@. A reset link underneath;
    // ?welcome=1 makes the page greet them as new. It sends nothing through
    // Supabase's own mailer, so its hourly email limit does not apply.
    case 'invite_client': {
      const userId = String(body.user_id ?? '');
      const { data: who } = await admin
        .from('profiles').select('id, role, email, full_name').eq('id', userId).maybeSingle();
      if (!who || who.role !== 'client' || !who.email) return reply({ error: 'Only a client can be invited.' }, 403);
      const key = Deno.env.get('N8N_EMAIL_KEY');
      if (!key) return reply({ error: 'Invites are not set up yet (N8N_EMAIL_KEY).' }, 500);

      const { data: made, error } = await admin.auth.admin.generateLink({
        type: 'recovery', email: who.email, options: { redirectTo: `${APP_URL}/?welcome=1` },
      });
      const link = made?.properties?.action_link;
      if (error || !link) return reply({ error: error?.message ?? 'Could not make the invite link.' }, 400);

      const sent = await fetch(N8N_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ftg-key': key },
        body: JSON.stringify({ kind: 'invite', to: who.email, name: who.full_name ?? '', link }),
      }).catch(() => null);
      if (!sent?.ok) return reply({ error: 'The invite email could not be sent. Please try again in a minute.' }, 502);

      // For "Invite again" on their profile. Absent until database/client_invites.sql is run.
      await admin.from('profiles').update({ invited_at: new Date().toISOString() }).eq('id', userId);
      return reply({ ok: true, email: who.email });
    }

    default:
      return reply({ error: 'Unknown action.' }, 400);
  }
});
