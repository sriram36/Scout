# Scout - n8n Job Discovery Pipeline

This directory contains the automated workflow for n8n to discover, filter, deduplicate, and ingest software engineering jobs.

## Workflow Overview
1. **Schedule Trigger**: Fires periodically (e.g. every 6 hours).
2. **HTTP Fetchers**:
   - Himalayas API (https://himalayas.app/jobs/api?category=developer)
   - Arbeitnow API (https://www.arbeitnow.com/api/job-board-api)
3. **Normalize & Deduplicate Code Node**:
   - Filters for remote developer/engineering roles.
   - Cleans HTML markup, normalizes salary ranges, and standardizes schema.
   - Deduplicates URLs so you never process the same job twice.
4. **Supabase Ingestion**:
   - Upserts new jobs into your PostgreSQL jobs table with esolution=ignore-duplicates.

## Quick Setup

### 1. Set up Database (Supabase)
Run the SQL in supabase-schema.sql inside your Supabase SQL Editor.

### 2. Import into n8n
1. Open your local n8n instance (e.g. http://localhost:5678).
2. Go to **Workflows** → Click **Add Workflow** → Click the three dots ... (top right) → **Import from File**.
3. Select scout-job-discovery.json.

### 3. Configure Environment Variables in n8n
In n8n, under **Settings** or your workflow variables:
- SUPABASE_URL: https://your-project.supabase.co
- SUPABASE_ANON_KEY: your-anon-key

Click **Activate** (top right) to let it run in the background!
