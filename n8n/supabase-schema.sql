-- Scout Jobs Table Schema for Supabase
CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT DEFAULT 'Remote',
  salary TEXT DEFAULT 'Competitive',
  source TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  description TEXT,
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'Discovered',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on URL for fast deduplication
CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs (url);

-- Index on status for pipeline queries
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);

-- Enable Row Level Security (RLS)
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Allow public / anon select and insert
CREATE POLICY "Allow anon select on jobs" ON jobs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on jobs" ON jobs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on jobs" ON jobs FOR UPDATE TO anon USING (true);
