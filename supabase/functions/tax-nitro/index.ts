// tax-nitro — bring a client's files and paid invoices over from Tax Nitro (GHL).
//
// Camaree: "Are we able to automate this process upon client account creation
// in the app?" and "Once an invoice is paid could that funnel to the app as
// well?" The app calls this when staff create a client, and from the Update
// Profile tray whenever staff want a client's things pulled again. A schedule
// calls it every hour for invoices paid since.
//
//   pull            what one client has sent through Tax Nitro, and their paid
//                   invoices, into their folders in the app         (staff)
//   sync_invoices   every paid invoice not in the app yet, for everyone who
//                   has a client account                            (the schedule)
//
// A client's uploads live in two places in GHL: their form and survey
// submissions (every upload they made), and the upload fields on their contact
// (the latest upload, and files attached in Tax Nitro itself). Every file link
// in either goes into public.documents the way the n8n flows write them, and the
// database files each one into the client's folders, skipping any it already
// has (database/tax_nitro_documents.sql).
//
// GHL keeps an invoice as data, not as a file, so a paid one is drawn as a PDF
// here, filed in the client's Tax, BK or CFO Invoices folder, and noted in
// public.tax_nitro_invoices so it goes in once (database/tax_nitro_invoices.sql).
//
// GHL is only ever read.
//
// Who may call: active staff or admin, signed in; or the schedule, with the
// SYNC_KEY secret in an x-sync-key header, and then only for sync_invoices.
//
// Deploy: Supabase dashboard → Edge Functions → tax-nitro, with this file.
// Secrets: GHL_TOKEN, the Tax Nitro private integration key, and SYNC_KEY, a
// long random string the schedule sends too (automation/n8n/ftg-invoice-sync.json).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

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

// ── Invoices, as PDFs ────────────────────────────────────────────────────────
// Camaree: "Once an invoice is paid could that funnel to the app as well?"
// GHL keeps an invoice as data, not as a file, so the PDF is drawn here from
// what it holds: the number, the dates, who it was for, the lines, the totals.
// Nothing from Supabase in here either, so it can be tried on its own.

/** The PDF library, handed in, so this runs wherever it is tried. */
export interface PdfLib { PDFDocument: any; StandardFonts: any; rgb: (r: number, g: number, b: number) => any }

export type InvoiceService = 'TAX' | 'BK' | 'CFO';

// What an invoice is for, from its own words. A word can belong to one only.
const INVOICE_WORDS: Record<InvoiceService, RegExp> = {
  TAX: /\btax(es)?\b|\b1040\b|\b1065\b|\b1120s?\b|\b990\b|schedule\s*c|\bw-?2\b|\b1099\b/gi,
  BK:  /bookkeep|\bbk\b|\bbooks\b|payroll|reconcil|backdat|catch[- ]?up|clean[- ]?up/gi,
  CFO: /\bcfo\b|advisory|forecast|budget/gi,
};

/** HTML from GHL, as plain lines. */
export function plainText(html: unknown): string {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Which Invoices folder: the service the invoice's words point to most, among
 * the ones the client takes; ties go TAX, BK, CFO. Nothing to go on, the first
 * they take. Never a folder the client does not see.
 */
export function invoiceService(inv: any, takes: string[]): InvoiceService {
  const words = [inv?.name, inv?.title,
    ...(inv?.invoiceItems ?? []).map((i: any) => `${i?.name ?? ''} ${plainText(i?.description)}`)].join(' ');
  const score = (svc: InvoiceService) => (words.match(INVOICE_WORDS[svc]) ?? []).length;
  const all: InvoiceService[] = ['TAX', 'BK', 'CFO'];
  const mine = all.filter(s => takes.includes(s));
  const pool = mine.length ? mine : all;
  const best = [...pool].sort((a, b) => score(b) - score(a))[0];
  return score(best) > 0 ? best : pool[0];
}

/** "INV-000213". */
export const invoiceNumber = (inv: any) => `${inv?.invoiceNumberPrefix ?? ''}${inv?.invoiceNumber ?? ''}`.trim() || 'Invoice';

// Dates as FTG keeps them: in Phoenix.
const dayOf = (iso: unknown) => iso
  ? new Date(String(iso)).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric' })
  : '';

/** The month an invoice is about, 'YYYY-MM', from its issue date in Phoenix. */
export function invoicePeriod(inv: any): string | null {
  if (!inv?.issueDate) return null;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(inv.issueDate));
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}`;
}

/** What the file is called in the client's folder. */
export const invoiceFileName = (inv: any) => `Invoice ${invoiceNumber(inv)} - ${dayOf(inv?.issueDate) || 'paid'}.pdf`;

// The standard PDF fonts speak Latin-1 only; anything else is said in plain
// letters or left out, rather than failing the whole invoice.
const latin = (s: unknown) => String(s ?? '')
  .replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"')
  .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[•●]/g, '-')
  .replace(/€/g, 'EUR ')
  .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');

export async function invoicePdf(inv: any, lib: PdfLib): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = lib;
  const doc = await PDFDocument.create();
  const number = invoiceNumber(inv);
  doc.setTitle(`Invoice ${number}`);
  doc.setAuthor('Finance Therapy Group');
  doc.setSubject('Paid invoice');
  doc.setCreator('Finance Therapy Group, from Tax Nitro');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.11, 0.09, 0.07), muted = rgb(0.42, 0.37, 0.32), faint = rgb(0.62, 0.57, 0.51);
  const gold = rgb(0.91, 0.73, 0.14), dark = rgb(0.23, 0.19, 0.19), rule = rgb(0.91, 0.88, 0.82);
  const pale = rgb(0.97, 0.95, 0.92), green = rgb(0.09, 0.55, 0.26), greenBg = rgb(0.88, 0.97, 0.91);
  const onDark = rgb(0.86, 0.83, 0.79), white = rgb(1, 1, 1);

  const W = 612, H = 792, M = 48;
  let page = doc.addPage([W, H]);
  const draw = (s: unknown, x: number, y: number, size: number, f = font, color = ink) =>
    page.drawText(latin(s), { x, y, size, font: f, color });
  const drawRight = (s: unknown, xr: number, y: number, size: number, f = font, color = ink) => {
    const t = latin(s);
    page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y, size, font: f, color });
  };
  // Words into lines no wider than `width`.
  const wrap = (s: unknown, width: number, size: number, f = font): string[] => {
    const out: string[] = [];
    for (const para of latin(s).split('\n')) {
      let lineText = '';
      for (const w of para.split(' ').filter(Boolean)) {
        const next = lineText ? `${lineText} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) <= width) { lineText = next; continue; }
        if (lineText) out.push(lineText);
        lineText = w;
      }
      if (lineText) out.push(lineText);
    }
    return out;
  };
  const currency = inv?.currency || 'USD';
  const money = (n: unknown) => {
    const v = Number(n) || 0;
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v); }
    catch { return `${currency} ${v.toFixed(2)}`; }
  };

  // ── The band across the top ──
  page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: dark });
  page.drawRectangle({ x: 0, y: H - 116, width: W, height: 4, color: gold });
  const biz = inv?.businessDetails ?? {};
  draw((biz.name || 'Finance Therapy Group').toUpperCase(), M, H - 50, 17, bold, gold);
  const a = biz.address ?? {};
  const where = [a.addressLine1, [a.city, a.state].filter(Boolean).join(', '), a.postalCode].filter(Boolean).join(' ');
  if (where) draw(where, M, H - 68, 9, font, onDark);
  // "+14439861310" as people write it.
  const digits = String(biz.phoneNo ?? '').replace(/\D/g, '');
  const phone = digits.length === 11 && digits.startsWith('1') ? `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    : digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : biz.phoneNo;
  const reach = [phone, String(biz.website ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean).join('  |  ');
  if (reach) draw(reach, M, H - 82, 9, font, onDark);
  drawRight('INVOICE', W - M, H - 52, 22, bold, white);
  drawRight(number, W - M, H - 72, 11, font, onDark);

  // ── Who it was for, and when ──
  let y = H - 160;
  draw('BILL TO', M, y, 8, bold, faint);
  const cd = inv?.contactDetails ?? {};
  draw(cd.name || cd.email || '', M, y - 17, 13, bold);
  let by = y - 33;
  if (cd.companyName) { draw(cd.companyName, M, by, 10, font, muted); by -= 14; }
  if (cd.email) { draw(cd.email, M, by, 10, font, muted); by -= 14; }

  // "Paid in full", where it cannot be missed.
  const badgeW = 132;
  page.drawRectangle({ x: W - M - badgeW, y: y - 12, width: badgeW, height: 26, color: greenBg, borderColor: green, borderWidth: 1 });
  const paidLabel = 'PAID IN FULL';
  page.drawText(paidLabel, { x: W - M - badgeW / 2 - bold.widthOfTextAtSize(paidLabel, 11) / 2, y: y - 3, size: 11, font: bold, color: green });
  const facts: [string, string][] = [
    ['Issued', dayOf(inv?.issueDate)],
    ['Due', dayOf(inv?.dueDate)],
    ['Paid', dayOf(inv?.lastPaidAt)],
  ].filter(([, v]) => !!v) as [string, string][];
  let fy = y - 34;
  for (const [k, v] of facts) {
    drawRight(k, W - M - 86, fy, 9, font, faint);
    drawRight(v, W - M, fy, 9, bold);
    fy -= 14;
  }

  // ── The lines ──
  const colQty = 372, colPrice = 462, colAmount = W - M - 8;
  const head = (top: number) => {
    page.drawRectangle({ x: M, y: top - 18, width: W - 2 * M, height: 22, color: pale });
    draw('DESCRIPTION', M + 8, top - 11, 8, bold, muted);
    drawRight('QTY', colQty, top - 11, 8, bold, muted);
    drawRight('PRICE', colPrice, top - 11, 8, bold, muted);
    drawRight('AMOUNT', colAmount, top - 11, 8, bold, muted);
    return top - 32;
  };
  y = head(Math.min(by, fy) - 24);
  for (const it of inv?.invoiceItems ?? []) {
    const qty = Number(it?.qty) || 0, price = Number(it?.amount) || 0;
    const nameLines = wrap(it?.name || 'Item', colQty - M - 70, 10, bold);
    const descLines = wrap(plainText(it?.description), colQty - M - 70, 8.5).slice(0, 4);
    const rowH = nameLines.length * 13 + descLines.length * 11 + 10;
    if (y - rowH < 150) { page = doc.addPage([W, H]); y = head(H - M); }
    let ly = y;
    nameLines.forEach(l => { draw(l, M + 8, ly, 10, bold); ly -= 13; });
    descLines.forEach(l => { draw(l, M + 8, ly, 8.5, font, muted); ly -= 11; });
    drawRight(Number.isInteger(qty) ? String(qty) : qty.toFixed(2), colQty, y, 10);
    drawRight(money(price), colPrice, y, 10);
    drawRight(money(qty * price), colAmount, y, 10, bold);
    y = ly - 6;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.6, color: rule });
    y -= 8;
  }

  // ── The totals ──
  if (y < 190) { page = doc.addPage([W, H]); y = H - M; }
  const sum = inv?.totalSummary ?? {};
  const rows: [string, string, boolean][] = [['Subtotal', money(sum.subTotal ?? inv?.total), false]];
  if (Number(sum.discount) > 0) rows.push(['Discount', `- ${money(sum.discount)}`, false]);
  if (Number(sum.tax) > 0) rows.push(['Tax', money(sum.tax), false]);
  rows.push(['Total', money(inv?.total), true]);
  rows.push(['Paid', money(inv?.amountPaid ?? inv?.total), false]);
  rows.push(['Balance due', money(inv?.amountDue ?? 0), true]);
  y -= 6;
  for (const [k, v, strong] of rows) {
    drawRight(k, colPrice - 30, y, strong ? 10.5 : 9.5, strong ? bold : font, strong ? ink : muted);
    drawRight(v, colAmount, y, strong ? 10.5 : 9.5, strong ? bold : font, k === 'Paid' ? green : ink);
    y -= strong ? 18 : 15;
  }

  // ── Notes on it, if any ──
  const notes = wrap(plainText(inv?.termsNotes), W - 2 * M, 9).slice(0, 10);
  if (notes.length) {
    y -= 8;
    if (y - notes.length * 12 < 70) { page = doc.addPage([W, H]); y = H - M; }
    draw('NOTES', M, y, 8, bold, faint);
    y -= 14;
    for (const l of notes) { draw(l, M, y, 9, font, muted); y -= 12; }
  }

  // ── The foot of every page ──
  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.6, color: rule });
    const foot = latin(`${biz.name || 'Finance Therapy Group'}  |  Invoice ${number}  |  Paid in full${inv?.lastPaidAt ? ` on ${dayOf(inv.lastPaidAt)}` : ''}`);
    p.drawText(foot, { x: M, y: 32, size: 8, font, color: faint });
  }
  return await doc.save();
}

// ── end invoices ─────────────────────────────────────────────────────────────

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Enough to catch up in a few runs, little enough to stay well inside a call's time.
const MAX_INVOICES_PER_RUN = 40;

interface ClientRow { id: string; email: string; full_name: string | null; services: string[] | null }

/** Paid invoices: all of them, or one contact's. */
async function paidInvoices(get: GhlGet, location: string, contactId: string | null): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const r = await get('/invoices/', {
      altId: location, altType: 'location', status: 'paid', limit: 100, offset,
      ...(contactId ? { contactId } : {}),
    });
    if (r.status !== 200) throw new Error(`Tax Nitro invoices: ${r.status}`);
    const batch: any[] = r.body?.invoices ?? [];
    out.push(...batch.filter(i => i?.status === 'paid' && !(Number(i?.amountDue) > 0)));
    if (batch.length < 100) return out;
  }
}

/**
 * Draw, store and file each invoice not filed before, into the folder its
 * words point to. Each is claimed in tax_nitro_invoices first, so a second run
 * at the same moment skips it, and a failure lets it go to be tried again.
 */
async function fileInvoices(admin: any, invoices: any[], clientOf: (inv: any) => ClientRow | undefined) {
  if (invoices.length === 0) return { paid: 0, filed: 0, remaining: 0, errors: [] as string[] };
  // Asked a hundred at a time, so the request stays short however many there are.
  const seen = new Set<string>();
  for (let i = 0; i < invoices.length; i += 100) {
    const ids = invoices.slice(i, i + 100).map(inv => inv._id);
    const { data: done, error } = await admin.from('tax_nitro_invoices').select('invoice_id').in('invoice_id', ids);
    if (error) throw new Error(`tax_nitro_invoices: ${error.message}`);
    for (const r of done ?? []) seen.add(r.invoice_id);
  }
  const todo = invoices.filter(i => !seen.has(i._id) && clientOf(i));
  const batch = todo.slice(0, MAX_INVOICES_PER_RUN);
  let filed = 0;
  const errors: string[] = [];
  for (const inv of batch) {
    const client = clientOf(inv)!;
    const number = invoiceNumber(inv);
    const claim = await admin.from('tax_nitro_invoices').insert({
      invoice_id: inv._id, client_email: client.email.toLowerCase(), invoice_number: number, paid_at: inv.lastPaidAt ?? null,
    });
    if (claim.error) {
      // 23505: filed, or being filed, by another run. Anything else is worth saying.
      if (claim.error.code !== '23505') errors.push(`${number}: ${claim.error.message}`);
      continue;
    }
    let stored: string | null = null;
    try {
      const table = `${invoiceService(inv, client.services ?? ['BK']).toLowerCase()}_invoices`;
      const name = invoiceFileName(inv);
      const pdf = await invoicePdf(inv, { PDFDocument, StandardFonts, rgb });
      const path = `${client.id}/${table}/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const up = await admin.storage.from('documents').upload(path, pdf, { contentType: 'application/pdf', upsert: false });
      if (up.error) throw new Error(up.error.message);
      stored = path;
      const url = admin.storage.from('documents').getPublicUrl(path).data.publicUrl;
      const paidAt = inv.lastPaidAt ?? new Date().toISOString();
      // As FTG's own document, already settled: there is nothing to approve.
      const { data: row, error } = await admin.from(table).insert({
        user_id: client.id, email: client.email, name, file_name: name, document_url: url,
        status: 'new', approval_status: 'approved', approved_at: paidAt,
        uploaded_by_role: 'staff', uploaded_by: 'Tax Nitro',
        ...(invoicePeriod(inv) ? { period: invoicePeriod(inv) } : {}),
        created_at: paidAt,
      }).select('id').single();
      if (error) throw new Error(error.message);
      await admin.from('tax_nitro_invoices').update({ filed_table: table, filed_id: row.id }).eq('invoice_id', inv._id);
      filed++;
    } catch (e) {
      // Let go of it all, so the next run starts it again cleanly.
      if (stored) await admin.storage.from('documents').remove([stored]);
      await admin.from('tax_nitro_invoices').delete().eq('invoice_id', inv._id);
      errors.push(`${number}: ${(e as Error).message}`);
    }
  }
  return { paid: invoices.length, filed, remaining: todo.length - batch.length, errors };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only.' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return reply({ error: 'Bad request.' }, 400); }
  if (body.action !== 'pull' && body.action !== 'sync_invoices') return reply({ error: 'Unknown action.' }, 400);

  // The hourly schedule carries its own key, and may only sync invoices.
  const syncKey = Deno.env.get('SYNC_KEY');
  const bySchedule = !!syncKey && syncKey.length >= 24 && req.headers.get('x-sync-key') === syncKey;
  if (bySchedule) {
    if (body.action !== 'sync_invoices') return reply({ error: 'Not allowed.' }, 403);
  } else {
    // Anyone else: their own session, checked by Supabase, and FTG staff only.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth?.user) return reply({ error: 'Please sign in again.' }, 401);
    const { data: me } = await admin
      .from('profiles').select('role, is_active').eq('id', auth.user.id).maybeSingle();
    const isStaff = !!me && (me.role === 'staff' || me.role === 'admin') && me.is_active !== false;
    if (!isStaff) return reply({ error: 'Only FTG staff can do this.' }, 403);
  }

  const ghlToken = Deno.env.get('GHL_TOKEN');
  if (!ghlToken) return reply({ error: 'Tax Nitro is not connected yet (GHL_TOKEN is not set).' }, 500);
  const location = Deno.env.get('GHL_LOCATION_ID') ?? 'mGklHepi2IMyFCEhy0SW';

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

  // ── Every paid invoice not in the app yet, for everyone with an account ──
  if (body.action === 'sync_invoices') {
    const { data: clients } = await admin.from('profiles').select('id, email, full_name, services').eq('role', 'client');
    const byEmail = new Map<string, ClientRow>(
      ((clients ?? []) as ClientRow[]).filter(c => c.email).map(c => [c.email.toLowerCase(), c]));
    const clientOf = (inv: any) => byEmail.get(String(inv?.contactDetails?.email ?? '').trim().toLowerCase());
    let paid: any[];
    try { paid = await paidInvoices(get, location, null); }
    catch (e) { return reply({ error: `Could not read Tax Nitro: ${(e as Error).message}` }, 502); }
    try { return reply(await fileInvoices(admin, paid.filter(clientOf), clientOf)); }
    catch (e) { return reply({ error: (e as Error).message }, 500); }
  }

  // ── One client: their files, and their paid invoices ──
  const email = String(body.email ?? '').trim();
  const { data: client } = await admin
    .from('profiles').select('id, email, full_name, role, services').ilike('email', email.replace(/[\\%_]/g, '\\$&')).maybeSingle();
  if (!email || !client || client.role !== 'client') return reply({ error: 'No client account with that email.' }, 404);

  let gathered: { contactId: string | null; files: TaxNitroFile[] };
  try {
    gathered = await gatherFiles(get, location, client.email, [client.full_name ?? '']);
  } catch (e) {
    return reply({ error: `Could not read Tax Nitro: ${(e as Error).message}` }, 502);
  }
  if (!gathered.contactId) return reply({ found: false, files: 0, added: 0, invoices: 0 });

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

  // Their paid invoices too. A problem here does not undo the files.
  let invoices = 0;
  try {
    const theirs = await paidInvoices(get, location, gathered.contactId);
    invoices = (await fileInvoices(admin, theirs, () => client as ClientRow)).filed;
  } catch (e) {
    console.warn('pull invoices:', (e as Error).message);
  }
  return reply({ found: true, files: gathered.files.length, added: rows.length, invoices });
});
