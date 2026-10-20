-- ============================================================
-- PAID TAX NITRO INVOICES, FILED ONCE
--
-- Camaree: "Would it also work for invoices? ... Once an invoice is paid could
-- that funnel to the app as well?"
--
-- The tax-nitro Edge Function draws each paid invoice as a PDF and files it in
-- the client's Tax, BK or CFO Invoices folder. This is where it notes the ones
-- it has filed, so none goes in twice. The invoice id is the key and is claimed
-- before the file is made, so two runs at once cannot both file the same one;
-- a run that fails lets go of its claim, and the next run tries again.
--
-- Only the function reads and writes it, as the service role. Staff see the
-- invoices themselves, in the client's folders.
--
-- SAFE TO RE-RUN.
-- ============================================================

create table if not exists public.tax_nitro_invoices (
  invoice_id     text        primary key,        -- GHL's invoice id
  client_email   text        not null,
  invoice_number text,                           -- "INV-000213"
  filed_table    text,                           -- set once the PDF is filed
  filed_id       uuid,
  paid_at        timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.tax_nitro_invoices enable row level security;
-- No policies on purpose: nothing in the app reads this table.
