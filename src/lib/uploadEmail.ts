import { folderTableLabel } from '../db/requirements';

// Camaree, app notes 9: "enable email notifications for clients when FTG does
// an Internal Upload and email notification to FTG when client uploads."
//
// The app cannot send email, so it tells n8n and n8n sends it — the flow is
// automation/n8n/ftg-upload-email.json. One call per upload batch, so ten files
// make one email rather than ten.
//
// The webhook is open to anyone, so the flow trusts little of what it is sent:
// a client upload only ever goes to FTG's own inbox, and the email to a client
// goes only to an address n8n finds itself, of a client who has signed in or
// been invited (email_ready_clients), with nothing from this request in it but
// the number of files.

const WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/ftg-upload-email';
// A client writing to FTG on a file (automation/n8n/ftg-client-message.json).
const MESSAGE_WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/ftg-client-message';

const escapeHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tell n8n about a finished upload. Never holds up or fails the upload itself. */
export async function emailAboutUploads(args: {
  /** client_upload → FTG is told. internal_upload → the client is told. */
  event: 'client_upload' | 'internal_upload';
  clientEmail: string | null | undefined;
  clientName?: string | null;
  uploadedBy?: string | null;
  files: { name: string; table: string | null | undefined }[];
  /** A client's note on the batch. It goes in FTG's email, under the files. */
  note?: string | null;
}): Promise<void> {
  if (!args.clientEmail || args.files.length === 0) return;
  const files = args.files.map(f => ({ name: f.name, folder: folderTableLabel(f.table) }));
  const note = args.note?.trim();
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: args.event,
        client_email: args.clientEmail,
        client_name: args.clientName ?? '',
        uploaded_by: args.uploadedBy ?? '',
        count: files.length,
        files,
        // Ready to drop into the email to FTG, escaped here so a file name
        // cannot write into it.
        file_list_html: files
          .map(f => `<li>${escapeHtml(f.name)} <span style="color:#6B5E52">(${escapeHtml(f.folder)})</span></li>`)
          .join('')
          // The flow puts this list straight into its email, so the note rides
          // in it as a last line rather than needing a change to the flow.
          + (note ? `<li style="list-style:none;margin-top:12px"><b>Their note:</b> ${escapeHtml(note)}</li>` : ''),
        sent_at: new Date().toISOString(),
      }),
    });
  } catch (e: any) {
    console.warn('Upload email notify failed (non-fatal):', e?.message);
  }
}

/**
 * Tell FTG a client wrote to them on a file: in its chat, or as the reason
 * they rejected it. Camaree wanted these in FTG's email, not only in the staff
 * bell. Staff replies send nothing; FTG writing to itself needs no email.
 *
 * It only ever reaches FTG's own inbox, and the flow escapes everything in it,
 * since anyone can call the webhook. Never holds up or fails the message.
 */
export async function emailAboutMessage(args: {
  kind: 'message' | 'rejected';
  clientEmail: string | null | undefined;
  clientName?: string | null;
  fileName: string;
  table: string | null | undefined;
  message: string;
}): Promise<void> {
  const message = args.message.trim();
  if (!args.clientEmail || !message) return;
  try {
    await fetch(MESSAGE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: args.kind,
        client_email: args.clientEmail,
        client_name: args.clientName ?? '',
        file_name: args.fileName,
        folder: folderTableLabel(args.table),
        message,
        sent_at: new Date().toISOString(),
      }),
    });
  } catch (e: any) {
    console.warn('Message email notify failed (non-fatal):', e?.message);
  }
}
