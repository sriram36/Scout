-- ============================================================
-- Scout Database Migration v2
-- Run in Supabase SQL Editor: https://app.supabase.com/project/_/sql
-- ============================================================

-- ── Applications table improvements ──────────────────────────────────────────

ALTER TABLE applications ADD COLUMN IF NOT EXISTS ats_platform TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fields_detected INTEGER DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fields_filled INTEGER DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fields_skipped INTEGER DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_questions_answered INTEGER DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fill_report JSONB;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update status constraint to include new states
-- (If you have a check constraint on status, drop and recreate it)
-- ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
-- ALTER TABLE applications ADD CONSTRAINT applications_status_check
--   CHECK (status IN (
--     'pending_application', 'applying', 'application_opened', 'form_analyzed',
--     'autofill_completed', 'awaiting_review', 'submitted', 'failed', 'Applied', 'Discovered'
--   ));

-- ── Field Mappings table (learning system) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT 'generic',
  domain TEXT,
  field_signature TEXT NOT NULL,
  meaning TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  usage_count INTEGER DEFAULT 1,
  UNIQUE(platform, field_signature)
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_platform_sig
  ON field_mappings (platform, field_signature);

-- RLS for field_mappings
ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select on field_mappings" ON field_mappings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on field_mappings" ON field_mappings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on field_mappings" ON field_mappings FOR UPDATE TO anon USING (true);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_listing_id ON applications (listing_id);
