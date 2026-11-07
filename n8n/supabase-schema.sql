-- ============================================================================
-- Scout database schema (Supabase / Postgres)
--
-- Run once in the Supabase SQL editor on a fresh project. Safe to re-run:
-- every statement is idempotent.
--
-- Access model
--   service_role  server + n8n (key never reaches the browser; bypasses RLS)
--   anon          dashboard (browser key): read everything, queue/reset/mark
--                 applications, nothing else
-- Verify with: bash scripts/verify-schema.sh
-- ============================================================================

-- ── listings: discovered jobs (written by n8n) ──────────────────────────────

CREATE TABLE IF NOT EXISTS listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  company       TEXT NOT NULL,
  location      TEXT DEFAULT 'Remote',
  salary        TEXT,
  source        TEXT NOT NULL,
  description   TEXT,
  apply_url     TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,          -- dedup key
  posted_date   TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_internship BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_listings_discovered_at ON listings (discovered_at DESC);

-- ── applications: one per listing (written by dashboard + apply server) ────

CREATE TABLE IF NOT EXISTS applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id            UUID NOT NULL UNIQUE REFERENCES listings (id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'Discovered'
    CHECK (status IN (
      'Discovered', 'pending_application', 'applying', 'application_opened',
      'form_analyzed', 'autofill_completed', 'awaiting_review', 'submitted', 'failed'
    )),
  status_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ats_platform          TEXT,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  fields_detected       INTEGER NOT NULL DEFAULT 0,
  fields_filled         INTEGER NOT NULL DEFAULT 0,
  fields_skipped        INTEGER NOT NULL DEFAULT 0,
  ai_questions_answered INTEGER NOT NULL DEFAULT 0,
  fill_report           JSONB,
  error_message         TEXT,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_applications_status     ON applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_listing_id ON applications (listing_id);

-- ── field_mappings: learned field meanings (the "learning" loop) ────────────

CREATE TABLE IF NOT EXISTS field_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        TEXT NOT NULL DEFAULT 'generic',
  domain          TEXT,
  field_signature TEXT NOT NULL,
  meaning         TEXT NOT NULL,
  confidence      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  usage_count     INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, field_signature)
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_platform_sig ON field_mappings (platform, field_signature);

-- ── Migrate older installs ───────────────────────────────────────────────────
-- Tables created by hand before this schema existed lack newer columns, and CREATE TABLE IF NOT
-- EXISTS leaves them untouched. Bring them up to date. Every statement is a no-op on a fresh install.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS location      TEXT DEFAULT 'Remote';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS salary        TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS posted_date   TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_internship BOOLEAN NOT NULL DEFAULT FALSE;
-- n8n upserts on canonical_url, which needs a unique index
CREATE UNIQUE INDEX IF NOT EXISTS listings_canonical_url_key ON listings (canonical_url);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS status_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ats_platform          TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS started_at            TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS completed_at          TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fields_detected       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fields_filled         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fields_skipped        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_questions_answered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fill_report           JSONB;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS error_message         TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes                 TEXT;
ALTER TABLE applications ALTER COLUMN status SET DEFAULT 'Discovered';
-- replace whatever status rule the old table had (its name is unknown) with the current one
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;
-- the old status "Applied" is now "submitted" (only possible once the old rule, which rejects it, is gone)
UPDATE applications SET status = 'submitted' WHERE status = 'Applied';
ALTER TABLE applications ADD CONSTRAINT applications_status_check CHECK (status IN (
  'Discovered', 'pending_application', 'applying', 'application_opened',
  'form_analyzed', 'autofill_completed', 'awaiting_review', 'submitted', 'failed'
)) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS applications_listing_id_key ON applications (listing_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.applications'::regclass AND contype = 'f') THEN
    ALTER TABLE applications ADD CONSTRAINT applications_listing_id_fkey
      FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS field_mappings_platform_field_signature_key ON field_mappings (platform, field_signature);

-- ── Row level security ──────────────────────────────────────────────────────

ALTER TABLE listings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY;

-- Policies from an older install would stay in force next to the ones below (policies add up), so
-- remove every existing policy on these tables first.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('listings', 'applications', 'field_mappings')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END
$$;

DROP POLICY IF EXISTS listings_anon_select ON listings;
CREATE POLICY listings_anon_select ON listings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS field_mappings_anon_select ON field_mappings;
CREATE POLICY field_mappings_anon_select ON field_mappings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS applications_anon_select ON applications;
CREATE POLICY applications_anon_select ON applications FOR SELECT TO anon USING (true);

-- The browser may queue an application, and may reset or mark one submitted.
-- It can never forge pipeline states such as autofill_completed.
DROP POLICY IF EXISTS applications_anon_insert ON applications;
CREATE POLICY applications_anon_insert ON applications FOR INSERT TO anon
  WITH CHECK (status = 'pending_application');

-- Not while the server is working on it (applying, application_opened, form_analyzed).
DROP POLICY IF EXISTS applications_anon_update ON applications;
CREATE POLICY applications_anon_update ON applications FOR UPDATE TO anon
  USING (status IN ('Discovered', 'pending_application', 'autofill_completed', 'awaiting_review', 'submitted', 'failed'))
  WITH CHECK (status IN ('pending_application', 'Discovered', 'submitted'));

-- ── Privileges (column-level for anon writes) ───────────────────────────────

REVOKE ALL ON listings, applications, field_mappings FROM anon;
GRANT SELECT ON listings, applications, field_mappings TO anon;
GRANT INSERT (listing_id, status, status_updated_at) ON applications TO anon;
GRANT UPDATE (status, status_updated_at, error_message) ON applications TO anon;

GRANT ALL ON listings, applications, field_mappings TO service_role;

-- ── Realtime (dashboard live updates + server pickup) ───────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'applications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;
  END IF;
END
$$;
