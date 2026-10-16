// tax-nitro — bring a client's files over from Tax Nitro (GHL).
//
// Camaree: "Are we able to automate this process upon client account creation
// in the app?" The app calls this when staff create a client, and from the
// Update Profile tray whenever staff want a client's files pulled again.
//
//   pull   everything the client has sent through Tax Nitro, into their
//          folders in the app
//
// A client's uploads live in two places in GHL: their form and survey
// submissions (every upload they made), and the upload fields on their contact
// (the latest upload, and files attached in Tax Nitro itself). Every file link
// in either goes into public.documents the way the n8n flows write them, and the
// database files each one into the client's folders, skipping any it already
// has (database/tax_nitro_documents.sql). GHL is only ever read.
//
// The caller must be signed in as active staff or admin.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function, named
// tax-nitro, with this file. Then Edge Functions → Secrets → GHL_TOKEN: the Tax
// Nitro private integration key (the one typed into the old n8n HTTP Request
// node). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

// ── Gathering the files from GHL ─────────────────────────────────────────────
// Nothing from Supabase in here, so it can be tried on its own.

/** One read from the GHL API: its status and parsed body. */
export type GhlGet = (path: string, params: Record<string, string | number>) => Promise<{ status: number; body: any }>;

export interface TaxNitroFile {
  url: string;
  /** 'Internal' when it came in FTG's internal upload field; 'External' otherwise. */
  kind: 'External' | 'Internal';
  /** The file's own name, as GHL keeps it. */
  name: string | null;
  /** When it was submitted; null for files only found on the contact. */
  when: string | null;
}

// FTG's internal upload form. Every other upload field is the client's.
export const INTERNAL_FIELD_NAMES = ['File Upload 25hwl'];
// Only GHL's own file links.
const FILE = /^https:\/\/services\.leadconnectorhq\.com\/documents\/download\/[A-Za-z0-9_-]+$/;

/** Every file link in a value, with the field it sat under. */
function linksIn(v: unknown, field: string | null, out: { field: string | null; name: string | null; url: string }[]) {
  if (typeof v === 'string') {
    if (FILE.test(v.trim())) out.push({ field, name: null, url: v.trim() });
  } else if (Array.isArray(v)) {
    v.forEach(x => linksIn(x, field, out));
  } else if (v && typeof v === 'object') {
    const o = v as Record<string, any>;
    if (typeof o.url === 'string' && FILE.test(o.url.trim())) {
      // A signature drawn on a form is kept as a file too. It is not a document.
      if (!o.meta?.isSignature) out.push({ field, name: o.meta?.originalname ?? null, url: o.url.trim() });
    } else {
      for (const [k, x] of Object.entries(o)) linksIn(x, field ?? k, out);
    }
  }
}

/**
 * Every file the contact with this email has in Tax Nitro. Submissions are
 * searched by the email and by each name given, and kept only when they are
 * this contact's.
 */
export async function gatherFiles(get: GhlGet, location: string, email: string, names: string[]):
  Promise<{ contactId: string | null; files: TaxNitroFile[] }> {
  const found = await get('/contacts/search/duplicate', { locationId: location, email });
  const contact = found.status === 200 ? found.body?.contact : null;
  if (!contact?.id) return { contactId: null, files: [] };
  const cid: string = contact.id;

  const fields = await get(`/locations/${location}/customFields`, {});
  if (fields.status !== 200) throw new Error(`Tax Nitro fields: ${fields.status}`);
  const internal = new Set<string>((fields.body?.customFields ?? [])
    .filter((f: any) => INTERNAL_FIELD_NAMES.includes(f.name)).map((f: any) => f.id));

  const queries = new Set([email, ...names.filter(Boolean),
    `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()].filter(Boolean));
  const subs = new Map<string, any>();
  for (const kind of ['forms', 'surveys']) {
    for (const q of queries) {
      for (let page = 1; ; page++) {
        const r = await get(`/${kind}/submissions`, { locationId: location, q, limit: 100, page });
        // A survey list the key cannot read gives nothing rather than failing.
        if (r.status !== 200) {
          if (kind === 'surveys') break;
          throw new Error(`Tax Nitro ${kind} submissions: ${r.status}`);
        }
        for (const s of r.body?.submissions ?? []) if (s.contactId === cid) subs.set(s.id, s);
        if (!r.body?.meta?.nextPage) break;
      }
    }
  }

  const files = new Map<string, TaxNitroFile>();
  const sorted = [...subs.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const s of sorted) {
    const out: { field: string | null; name: string | null; url: string }[] = [];
    linksIn(s.others ?? {}, null, out);
    for (const f of out) {
      if (!files.has(f.url)) files.set(f.url, {
        url: f.url, kind: f.field && internal.has(f.field) ? 'Internal' : 'External', name: f.name, when: s.createdAt ?? null,
      });
    }
  }

  // What sits in the contact's upload fields now.
  const full = await get(`/contacts/${cid}`, {});
  for (const f of full.status === 200 ? full.body?.contact?.customFields ?? [] : []) {
    if (!f?.value || typeof f.value !== 'object' || Array.isArray(f.value)) continue;
    const out: { field: string | null; name: string | null; url: string }[] = [];
    linksIn(f.value, f.id, out);
    for (const x of out) {
      if (!files.has(x.url)) files.set(x.url, {
        url: x.url, kind: internal.has(f.id) ? 'Internal' : 'External', name: x.name, when: null,
      });
    }
  }
  return { contactId: cid, files: [...files.values()] };
}

// ── end gathering ────────────────────────────────────────────────────────────

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
  if (body.action !== 'pull') return reply({ error: 'Unknown action.' }, 400);

  const ghlToken = Deno.env.get('GHL_TOKEN');
  if (!ghlToken) return reply({ error: 'Tax Nitro is not connected yet (GHL_TOKEN is not set).' }, 500);
  const location = Deno.env.get('GHL_LOCATION_ID') ?? 'mGklHepi2IMyFCEhy0SW';

  // Only a client's files, and only into their own account.
  const email = String(body.email ?? '').trim();
  const { data: client } = await admin
    .from('profiles').select('id, email, full_name, role').ilike('email', email.replace(/[\\%_]/g, '\\$&')).maybeSingle();
  if (!email || !client || client.role !== 'client') return reply({ error: 'No client account with that email.' }, 404);

  const get: GhlGet = async (path, params) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`https://services.leadconnectorhq.com${path}${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${ghlToken}`, Version: '2021-07-28', Accept: 'application/json', 'User-Agent': 'FTG-App/1.0' },
      });
      // GHL allows so many reads a second; wait a moment rather than give up.
      if (r.status === 429 && attempt < 3) { await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); continue; }
      let parsed: any = null;
      try { parsed = await r.json(); } catch { /* not JSON */ }
      return { status: r.status, body: parsed };
    }
  };

  let gathered: { contactId: string | null; files: TaxNitroFile[] };
  try {
    gathered = await gatherFiles(get, location, client.email, [client.full_name ?? '']);
  } catch (e) {
    return reply({ error: `Could not read Tax Nitro: ${(e as Error).message}` }, 502);
  }
  if (!gathered.contactId) return reply({ found: false, files: 0, added: 0 });

  // Not what is already here: n8n's rows and earlier pulls.
  const { data: have } = await admin
    .from('documents').select('document_url').ilike('email', client.email.replace(/[\\%_]/g, '\\$&'));
  const known = new Set((have ?? []).map(r => r.document_url));
  const rows = gathered.files.filter(f => !known.has(f.url)).map(f => ({
    document_url: f.url,
    name: client.full_name || 'Document',
    file_name: f.name ?? '',
    email: client.email,
    user_id: client.id,
    contact_id: gathered.contactId,
    document_type: f.kind,
    status: 'new',
    ...(f.when ? { created_at: f.when } : {}),
  }));
  if (rows.length) {
    const { error } = await admin.from('documents').insert(rows);
    if (error) return reply({ error: `Could not save the files: ${error.message}` }, 500);
  }
  return reply({ found: true, files: gathered.files.length, added: rows.length });
});
