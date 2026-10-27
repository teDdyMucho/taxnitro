# Keeping the client dashboards in step with Paul's workbooks

When Paul shares a client workbook, that client's dashboard updates itself.

    Paul shares a workbook
      → Gmail trigger picks it up
      → Drive downloads it as .xlsx  (with the account he shares with)
      → the converter reads it and checks every figure
      → n8n commits the result
      → Netlify rebuilds

## What it will not do

It will not wire up a client the app has never seen.

Everything else here is checkable against the workbook — every figure, and where
each figure sits. Which portal login a business belongs to is not, and getting
that wrong shows one client another's books. A new client stops at a message with
the entry to add and a note that someone has to set the email.

## The pieces

    automation/sync_workbook.py   one command: read a workbook, write the modules
    automation/lib/convert.py     the conversion, shared with scripts/xlsx2ts.py
    automation/lib/derive_rowmap.py  where each figure sits, found by its label
    automation/service/           the same thing over HTTP, for n8n to call
    automation/n8n/               the workflow to import

### Why a service at all

n8n runs in its own container. It has neither Python nor a checkout of this
repository, so it cannot do the conversion itself. The service is that gap and
nothing more: it reads a workbook and hands back what it says. It commits
nothing.

### Why the row map is derived rather than written down

FTG's template is not numbered the same for every client — Uniquely Enough keeps
Total Income on FS-R row 34, 1st Step to Greatness on row 36 — and a map that is
one row out does not fail. It reports the line next door, and looks right.

So rows are found by what they are called. The labels hold steady where the
numbers do not: every workbook says TOTAL REVENUE and NET INCOME wherever those
land.

    python scripts/check_rowmap.py

reproduces all six maps that were read by hand. That is the only ground truth
there is, and it is what makes a seventh client safe to add without one.

## Setting it up

**1 — deploy the converter** (Railway, from this repo)

    Dockerfile   automation/service/Dockerfile
    CONVERTER_TOKEN   any long random string

**2 — tell n8n where it is**

Set these on the n8n instance:

    FTG_CONVERTER_URL     https://<the service>.up.railway.app
    FTG_CONVERTER_TOKEN   the same string

**3 — import the workflow**

`automation/n8n/ftg-workbook-sync.json`, then fill in what it asks for:

  - **Google Drive** — the account Paul shares with. Without this the download
    gets a 401: these files are shared, not public.
  - **GitHub** — write access to `teDdyMucho/taxnitro`
  - **Slack** — and a channel id in the three notify nodes

**4 — try it before trusting it**

Run it by hand on a workbook that is already in the app. It should report
`updated`, name the right module, and commit a change of nothing much. If it
reports `new` for a client that exists, the registry match is off and that is
worth fixing before it runs unattended.

## Running it by hand

    python automation/sync_workbook.py --file workbook.xlsx --dry-run

`--dry-run` writes nothing. Drop it to update the modules in place. It prints
what it did, and what it refused, as JSON.

---

# Upload emails

Camaree, app notes 9: when FTG makes an Internal Upload the client gets an
email, and when a client uploads FTG gets one at accounting@financetherapygroup.com.

    an upload batch finishes in the app      (src/lib/uploadEmail.ts)
      → POST .../webhook/ftg-upload-email    one call per batch, not per file
      → client uploaded  → email to accounting@, with the file list
      → FTG uploaded     → find the client's profile → email to that client

The webhook is open to anyone, so the flow decides where mail goes, not the
request. FTG's email only ever goes to accounting@. The client's goes only to
an address found on a client profile, and holds nothing from the request but a
number — no file names — so nobody can use it to send their own words as FTG.

**Set up:** import `automation/n8n/ftg-upload-email.json`, connect

  - **Microsoft Outlook** — signed in as info@financetherapygroup.com ("FTG n8n Outlook")
  - **Supabase** — the service role key, as the documents flow uses

and activate it. Until it is active the app's calls fail quietly and uploads
carry on as before.

---

# Paid invoices

Camaree: "Once an invoice is paid could that funnel to the app as well?"

    every hour                                (automation/n8n/ftg-invoice-sync.json)
      → POST .../functions/v1/tax-nitro { action: "sync_invoices" }
      → each paid Tax Nitro invoice not filed yet, for a client with an account
      → drawn as a PDF, filed in their Tax, BK or CFO Invoices folder

GHL keeps invoices as data, so the PDF is made in the function. Which folder
follows the invoice's own words (tax, bookkeeping, CFO) among the services the
client takes. public.tax_nitro_invoices notes what is filed, so nothing goes
in twice (database/tax_nitro_invoices.sql). At most 40 a run; the rest follow.

**Set up:** run `database/tax_nitro_invoices.sql`; add the Edge Function
secret `SYNC_KEY` (a long random string); deploy `supabase/functions/tax-nitro`;
import the workflow with the anon key and the same `SYNC_KEY` in its headers,
and activate it. The function refuses the key for anything but this sync.

---

# Account emails: invites and password resets

Camaree: "can we create an Invite button to allow us to invite clients to the
app directly from the app?" and "how soon until the forgot password button
becomes operational?" Both go out from info@ (automation/n8n/ftg-account-email.json):

    client profile → Invite                    sign-in page → Forgot Password?
      → admin-users, invite_client               → Supabase Auth's Send Email hook
      → a one-time link (?welcome=1)             → auth-email, checking Supabase signed it
                         ↘                       ↙
             POST /webhook/ftg-account-email   (x-ftg-key header)
               → Write the email   (only links into this project's own sign-in)
               → Send it from info@

The link signs the person in and the app asks for their password: a welcome
for an invite, "Choose a new password" for a reset. Supabase's own sender only
mails the project's team, so it sends nothing itself once the hook is on.

**Set up:**
1. n8n: a Header Auth credential named "FTG account email key" (Name
   `x-ftg-key`, Value a long random string). Import the workflow, pick that
   credential on its webhook and the info@ Outlook credential on its send, and
   publish.
2. Supabase Edge Function secret `N8N_EMAIL_KEY`: the same string.
3. Deploy `supabase/functions/auth-email` with "Verify JWT" off, and redeploy
   `supabase/functions/admin-users`.
4. Authentication → Hooks → Send Email hook → HTTPS →
   `<supabase url>/functions/v1/auth-email`. Generate its secret and save it as
   the secret `SEND_EMAIL_HOOK_SECRET`.
5. Run `database/client_invites.sql` (when each client was last invited).
6. Authentication → Email → "Email OTP Expiration": 86400, so an invite's link
   lasts a day rather than an hour.

---

# Client messages

Camaree: when a client writes to FTG in the app, FTG should hear about it by
email too, not only in the staff bell.

    a client sends a message on a file        (FileConversationPanel)
    or rejects a file, giving their reason     (DocumentsScreen)
      → POST .../webhook/ftg-client-message   (src/lib/uploadEmail.ts, emailAboutMessage)
      → Write the email   (escapes everything it is sent)
      → Email FTG, at accounting@

Like the upload emails, the webhook is open, so the flow only ever writes to
accounting@ and escapes every field. Staff replies send nothing. A note a
client adds to an upload goes in the "uploaded a file" email, under its files.

**Set up:** import `automation/n8n/ftg-client-message.json`, pick the info@
Outlook credential ("FTG n8n Outlook") on **Email FTG**, and publish. Until it
is published the app's calls fail quietly and messages send as before.
