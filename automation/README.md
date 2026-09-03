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
