import { callFunction } from './adminUsers';

// A client's files from Tax Nitro (GHL), through the tax-nitro Edge Function
// (supabase/functions/tax-nitro). Everything they have sent through Tax Nitro
// lands in their Unsorted Uploads. Files already in the app are skipped, so a
// pull can be run as often as wanted.
//
// Camaree: "Are we able to automate this process upon client account creation
// in the app?" Adding a client pulls theirs straight away; the Update Profile
// tray pulls again on request.

export interface TaxNitroPull {
  /** Whether Tax Nitro has a contact with the client's email. */
  found: boolean;
  /** Files the contact has in Tax Nitro. */
  files: number;
  /** Of those, the ones brought over just now. */
  added: number;
}

export function pullFromTaxNitro(email: string) {
  return callFunction<TaxNitroPull>('tax-nitro', { action: 'pull', email });
}

/** What a pull did, in a line. */
export function describePull(r: TaxNitroPull): string {
  if (!r.found) return 'Tax Nitro has no contact with this email.';
  if (r.added > 0) return `Brought over ${r.added} file${r.added === 1 ? '' : 's'} from Tax Nitro, into Unsorted Uploads.`;
  return r.files > 0 ? 'Everything in Tax Nitro is already here.' : 'Nothing in Tax Nitro for this client yet.';
}
