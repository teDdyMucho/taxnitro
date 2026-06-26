-- ─────────────────────────────────────────────────────────────────
-- BOOKKEEPING WORKFLOW MANAGEMENT SYSTEM — Supabase Migration
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- 1. WORKFLOW INSTANCES
-- One record per client per month. Tracks which phase the client is in.
CREATE TABLE IF NOT EXISTS workflow_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month               TEXT NOT NULL,                        -- Format: 'YYYY-MM' e.g. '2026-06'
  accounting_software TEXT NOT NULL DEFAULT 'QBO',          -- QBO | QBD | Xero
  status              TEXT NOT NULL DEFAULT 'processor'     -- processor | reviewer | reprocessor | report_sender | complete
                      CHECK (status IN ('processor','reviewer','reprocessor','report_sender','complete')),
  assigned_processor  UUID REFERENCES profiles(id),
  assigned_reviewer   UUID REFERENCES profiles(id),
  has_loans           BOOLEAN NOT NULL DEFAULT false,
  has_fixed_assets    BOOLEAN NOT NULL DEFAULT false,
  client_notified_at  TIMESTAMPTZ,
  created_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, month)
);

-- 2. WORKFLOW CHECKLIST ITEMS
-- One row per checklist item per workflow instance.
-- item_key maps to the FR numbers in the PRD (e.g. 'FR-10', 'FR-31', etc.)
CREATE TABLE IF NOT EXISTS workflow_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  phase        TEXT NOT NULL CHECK (phase IN ('A','B','C','D')),
  item_key     TEXT NOT NULL,       -- e.g. 'FR-10', 'FR-21', etc.
  is_checked   BOOLEAN NOT NULL DEFAULT false,
  notes        TEXT,
  checked_by   UUID REFERENCES profiles(id),
  checked_at   TIMESTAMPTZ,
  UNIQUE(workflow_id, item_key)
);

-- 3. WORKFLOW NOTES (Reviewer → Reprocessor)
-- Notes created by Reviewer during Phase B. Reprocessor resolves each one.
CREATE TABLE IF NOT EXISTS workflow_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  note_text        TEXT NOT NULL,
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_by      UUID REFERENCES profiles(id),
  resolved_at      TIMESTAMPTZ,
  resolution_text  TEXT
);

-- 4. QUERY SHEET ITEMS
-- Items flagged during processing that need client input or review.
-- Created by Processor, reviewed by Reviewer, visible to client if flagged.
CREATE TABLE IF NOT EXISTS workflow_query_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  amount          NUMERIC(12,2),
  transaction_date DATE,
  flagged_by      UUID REFERENCES profiles(id),
  flagged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  needs_client    BOOLEAN NOT NULL DEFAULT false,    -- true = goes to client
  client_response TEXT,
  responded_at    TIMESTAMPTZ,
  is_resolved     BOOLEAN NOT NULL DEFAULT false,
  resolved_by     UUID REFERENCES profiles(id),
  resolved_at     TIMESTAMPTZ,
  phase_added     TEXT NOT NULL DEFAULT 'A' CHECK (phase_added IN ('A','B'))
);

-- 5. WORKFLOW MESSAGES (in-app staff messaging per workflow)
CREATE TABLE IF NOT EXISTS workflow_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES profiles(id),
  sender_name TEXT NOT NULL,
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. WORKFLOW DRIVE LINKS (GDrive + SmartVault)
CREATE TABLE IF NOT EXISTS workflow_drive_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  storage     TEXT NOT NULL CHECK (storage IN ('gdrive','smartvault')),
  label       TEXT NOT NULL,   -- 'Balance Sheet' | 'Profit & Loss' | 'Query Sheet'
  url         TEXT NOT NULL,
  saved_by    UUID REFERENCES profiles(id),
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- UPDATED_AT trigger
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_instances_updated ON workflow_instances;
CREATE TRIGGER trg_workflow_instances_updated
  BEFORE UPDATE ON workflow_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE workflow_instances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_query_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_drive_links    ENABLE ROW LEVEL SECURITY;

-- Staff and admin can read/write all workflow data
CREATE POLICY "staff_full_access_instances"   ON workflow_instances       FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('staff','admin')));
CREATE POLICY "staff_full_access_checklist"   ON workflow_checklist_items FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('staff','admin')));
CREATE POLICY "staff_full_access_notes"       ON workflow_notes           FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('staff','admin')));
CREATE POLICY "staff_full_access_query"       ON workflow_query_items     FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('staff','admin')));
CREATE POLICY "staff_full_access_messages"    ON workflow_messages        FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('staff','admin')));
CREATE POLICY "staff_full_access_drive"       ON workflow_drive_links     FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('staff','admin')));

-- Clients can see their own query items
CREATE POLICY "client_view_query_items" ON workflow_query_items
  FOR SELECT USING (
    auth.uid() IN (
      SELECT client_id FROM workflow_instances WHERE id = workflow_query_items.workflow_id
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_query_items;

-- ─────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workflow_instances_client   ON workflow_instances(client_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status   ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_month    ON workflow_instances(month);
CREATE INDEX IF NOT EXISTS idx_workflow_checklist_workflow ON workflow_checklist_items(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_notes_workflow     ON workflow_notes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_query_workflow     ON workflow_query_items(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_messages_workflow  ON workflow_messages(workflow_id);
