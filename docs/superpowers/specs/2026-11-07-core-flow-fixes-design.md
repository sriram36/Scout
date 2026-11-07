# Scout — Sub-project 1: Core Flow Fixes

Date: 2026-11-07
Status: Draft for review

## Context

Scout is a personal (single-user) job-application copilot:

1. **n8n** discovers remote developer jobs (Himalayas, Arbeitnow, RemoteOK) and stores them in Supabase.
2. **Dashboard** (Next.js) lists jobs; clicking *Apply* inserts/updates an `applications` row with status `pending_application`.
3. **Apply server** (`server.js`, Node + Playwright + Azure OpenAI) polls Supabase every 8 s, drives a browser through the ATS form, fills it, and stops for **human review before submit**.

"Complete the project" was scoped by the user as four sub-projects, built in this order, each with its own spec → plan → implementation:

1. **Core flow fixes** ← this document
2. Tests + verification (unit, route, mock-form E2E)
3. Dashboard features **and redesign** (corrections UI, fill reports, mark-as-submitted). Agreed visual direction (2026-11-07): dark theme with light-mode toggle, pipeline kanban (Discovered → Queued → Filling → Review → Applied), stats row with charts, command-palette search, motion. Gets its own spec; the current single-file `page.tsx` will be split into components as part of it.
4. More ATS adapters (Workday, iCIMS, SmartRecruiters)

Constraints agreed with the user: single-user tool; apply step never auto-submits; the Supabase project is a **fresh start** (no data to preserve); the user delegated access-control and "start from scratch where needed" decisions to me.

## Goal / success criteria

A fresh clone, following only the README, can run the pipeline end to end: n8n writes listings → dashboard shows them → *Apply* queues an application → apply server picks it up and fills the form → review in browser. Concretely:

- One schema file creates every table the code uses; running it on an empty Supabase project is sufficient.
- The n8n workflow imports, runs, and inserts rows the dashboard can display.
- No code references a table or column that the schema does not define.
- `npm test` passes; `dashboard` builds; the server boots and answers `/health` and `/profile`.

## Findings this design addresses

| # | Problem | Evidence |
|---|---------|----------|
| 1 | Schema/code mismatch | n8n writes `jobs`; dashboard + server read `listings` and `applications`; no SQL creates the latter two |
| 2 | n8n Code node is invalid JS | `Fetch Himalayas Jobs.first()` (missing `$('…')`), `$ - {job.maxSalary…}` (mangled template literals) |
| 3 | n8n Save node can't write | body is `JSON.stringify()` with no argument; `Authorization` header is the literal text `Bearer ={{ … }}` (expression never evaluated) |
| 4 | Headless screenshot wrong | `page.screenshot({ encoding: 'base64' })` is not a Playwright option; it returns a Buffer, so the data URL is garbage |
| 5 | Docker/Playwright mismatch | image `playwright:v1.50.0-noble`, installed library 1.63.0 |
| 6 | Dead code | `src/discovery/{himalayas,arbeitnow}.js` unused since n8n took over discovery |
| 7 | Docs out of date | README mentions Adzuna (not in workflow), no env/schema steps; n8n README has typos; `dashboard/README.md` is create-next-app boilerplate |
| 8 | Over-open RLS | every policy is `anon USING (true)`; the anon key ships in the browser bundle |

## Design

### 1. Schema — `n8n/supabase-schema.sql` (rewritten, idempotent)

Replaces the old `jobs` schema; `n8n/migration_v2.sql` is deleted (its `field_mappings` and column additions are folded in).

**`listings`**
- `id uuid pk default gen_random_uuid()`
- `title text not null`, `company text not null`, `location text default 'Remote'`, `salary text`, `source text not null`, `description text`
- `apply_url text not null`, `canonical_url text not null unique` (dedup key)
- `posted_date timestamptz`, `discovered_at timestamptz default now()`, `is_internship boolean default false`
- index on `discovered_at desc`

**`applications`**
- `id uuid pk`, `listing_id uuid not null unique references listings(id) on delete cascade` (one application per listing; makes *Apply* idempotent and matches the dashboard's `applications[0]`)
- `status text not null default 'Discovered'` with CHECK over: `Discovered`, `pending_application`, `applying`, `application_opened`, `form_analyzed`, `autofill_completed`, `awaiting_review`, `submitted`, `failed`
- `ats_platform`, `started_at`, `completed_at`, `status_updated_at`, `fields_detected`, `fields_filled`, `fields_skipped`, `ai_questions_answered` (ints default 0), `fill_report jsonb`, `error_message`, `notes`
- indexes on `status`, `listing_id`
- The legacy `Applied` status is dropped; its entries are removed from the dashboard label/colour maps.

**`field_mappings`** — unchanged from `migration_v2.sql` (`unique(platform, field_signature)`, usage_count, index).

### 2. Access control — option B (service key server-side)

- New env var `SUPABASE_SERVICE_ROLE_KEY`, used by the apply server (`src/db/supabase.js`) and by n8n. It bypasses RLS and is never exposed to the browser.
- `getSupabase()` prefers the service key; if absent it falls back to the anon key and logs a warning that writes will fail under the tightened policies.
- RLS enabled on all three tables. Policies for role `anon` (the dashboard):
  - `SELECT` on `listings`, `applications`, `field_mappings`
  - `INSERT` / `UPDATE` on `applications` only, further restricted with **column-level grants**: `REVOKE INSERT, UPDATE ON applications FROM anon; GRANT INSERT (listing_id, status, status_updated_at), UPDATE (status, status_updated_at, error_message) ON applications TO anon;`
  - no anon writes to `listings` or `field_mappings`
  - row-level checks: anon `INSERT` requires `status = 'pending_application'`; anon `UPDATE` must leave `status` in (`pending_application`, `Discovered`, `submitted`) — so the browser key can queue, reset or mark-submitted but can never forge pipeline states like `autofill_completed`
  - `applications` is added to the `supabase_realtime` publication (needed by the dashboard subscription and the server's realtime pickup)
- Known limit, documented in the README: `fill_report` is readable via the anon key because the dashboard displays it. For a private personal project this is acceptable; moving to Supabase Auth is a possible later hardening step.

### 3. n8n workflow

Root cause of findings 2–3 is hand-assembled JSON with escaping damage, so the fix makes the code testable and the JSON generated:

- `n8n/normalize.js` — pure function `normalize({ himalayas, arbeitnow, remoteok }) → row[]` containing the filtering/mapping logic. Source of truth for the Code node.
- `n8n/build-workflow.js` — writes `n8n/scout-job-discovery.json` by embedding `normalize.js` into the Code node and wiring the other nodes. Regenerating the JSON is `node n8n/build-workflow.js`.
- Output row shape matches `listings`: `title, company, location, salary, source, description, apply_url, canonical_url, posted_date, is_internship`. `canonical_url` is the URL with tracking params (`utm_*`, `ref`) and trailing slash stripped; `is_internship` is a case-insensitive `intern` match on the title; the old `status` field is removed.
- Salary strings are built with valid template literals; missing ranges fall back to `Competitive`.
- Save node: `POST {SUPABASE_URL}/rest/v1/listings?on_conflict=canonical_url`, headers `apikey` and `Authorization: Bearer <service key>` (proper expression), `Prefer: resolution=ignore-duplicates`, body = JSON array of rows. Zero rows → the node doesn't fire.
- n8n env vars become `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- A test (`tests/normalize.test.js`) feeds recorded-shape fixtures for the three sources through `normalize` and asserts the mapping, dedup and filters. The generated JSON is checked to parse and to contain the Code node source verbatim.

### 4. Server and container fixes

- `server.js`: `const buf = await page.screenshot({ fullPage: true }); screenshotBase64 = buf.toString('base64');`
- `Dockerfile`: base image tag updated to match the installed Playwright version (1.63.0); tag existence confirmed at implementation time, otherwise Playwright's version pin in `package.json` is aligned to the newest available image instead.
- `.env.example`: add `SUPABASE_SERVICE_ROLE_KEY`; document `NEXT_PUBLIC_LOCAL_API` for the dashboard.

### 5. Cleanup

- Delete `src/discovery/` and `n8n/migration_v2.sql`.
- Remove `Applied` from `dashboard/src/app/page.tsx` status maps.

### 6. n8n in Docker — `docker-compose.yml`

Added at the user's request. n8n runs in a container; the apply server and dashboard stay on the host.

**Why the apply server is not containerised by default:** the human-review gate needs a *visible* browser (`HEADLESS=false`), which a container cannot provide. The existing `Dockerfile` remains for headless/cloud use only.

- Service `n8n`: image `docker.n8n.io/n8nio/n8n` (pinned version tag), port `5678`, named volume `n8n_data` mounted at `/home/node/.n8n` so workflows and credentials survive restarts.
- Environment passed from the root `.env` via `${VAR}` substitution: `SUPABASE_URL` (mapped from `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `GENERIC_TIMEZONE`, `N8N_ENCRYPTION_KEY`, and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (the workflow reads `$env.*` in expressions; recent n8n versions block this by default).
- `restart: unless-stopped`; healthcheck on `/healthz`.
- Workflow import is automated: a one-shot `n8n-import` service runs `n8n import:workflow --input=/workflows/scout-job-discovery.json` from a read-only bind mount of `./n8n`, so `docker compose up` yields the workflow already imported (activation remains a one-click step in the UI, documented).
- `.env.example` gains `N8N_ENCRYPTION_KEY` and `GENERIC_TIMEZONE`; `.dockerignore`/`.gitignore` updated if needed.
- README gains a "Run n8n with Docker" section (`docker compose up -d`, open `http://localhost:5678`, activate the workflow) and keeps a short "n8n without Docker" note.

### 7. Stack hardening (approved 2026-11-07 after stack review: keep the stack, fix weak spots)

- **Pluggable LLM provider.** New `src/llm/index.js` exposes `classifyField`, `generateAnswer`, `isConfigured` and selects a provider from `LLM_PROVIDER` (`azure` | `openai`; default `azure` if Azure vars are set, else `openai` if `LLM_API_KEY` **or** `LLM_BASE_URL` is set — the latter lets keyless local Ollama work). `src/llm/azureClient.js` keeps the Azure transport; a new `src/llm/openaiCompatClient.js` speaks the OpenAI chat-completions format against `LLM_BASE_URL` (covers OpenAI, Gemini's OpenAI-compatible endpoint, Groq, Ollama) with `LLM_API_KEY` and `LLM_MODEL`. The shared prompt/parse logic for `classifyField` and `generateAnswer` moves to one place so providers only supply the transport (`callAPI`). `fieldMatcher.js` and `answerGenerator.js` require `src/llm` instead of `azureClient`. `.env.example` documents both.
- **Realtime pickup.** `server.js` subscribes to Supabase Realtime `INSERT`/`UPDATE` on `applications` where `status = 'pending_application'` and triggers the same claim-and-apply routine as the poller. The 8 s poll stays as a fallback (interval raised to 30 s) and both paths go through one `claimNext()` function guarded by an in-process lock, so an application is never run twice.
- **Dependencies.** Remove `node-cron`, `node-telegram-bot-api`, `pdf-parse`, `axios` from `package.json`/lockfile (verified unused by live code).
- **Request validation.** `zod` added; `/apply` and `/corrections` bodies validated, returning 400 with field errors; the LLM JSON responses are validated before use and fall back to `unknown`/skip on failure. Unit tests cover the schemas.

### 8. Documentation

- Root `README.md` rewritten: architecture diagram (text), prerequisites, numbered setup (Supabase project → run schema → env vars for server, dashboard `.env.local`, n8n → `profile.json` → start server → start dashboard → import/activate workflow), env var table, status lifecycle, security note, troubleshooting.
- `n8n/README.md`: corrected, covers Adzuna removal, build script, env vars.
- `dashboard/README.md`: replaced with a short Scout-specific note.

## Verification (what "done" means)

Run and report actual output for each:

1. `npm test` — existing 44 tests plus the new normalize tests pass.
2. `node n8n/build-workflow.js` produces JSON that parses; the Code node source passes `node --check` and runs against fixtures.
3. `cd dashboard && npm run build` succeeds.
4. Boot `node server.js` without credentials; `GET /health` and `GET /profile` respond; the screenshot code path is exercised by a unit test against a stub page returning a Buffer.
5. Docker (daemon confirmed running 2026-11-07): `docker compose config` validates the file; `docker compose up -d` starts n8n; `/healthz` returns OK; the one-shot import service exits 0 and the workflow appears via `n8n list:workflow`. The workflow's Supabase write is not testable without the user's Supabase credentials.
6. Schema SQL: **cannot be executed here** (no Supabase/Postgres available). It will be reviewed by reading and, if a local Postgres or pglite is available, executed there; otherwise this is stated explicitly and the user runs it in the Supabase SQL editor.

Not verifiable here and said so up front: the n8n-to-Supabase write, live Supabase RLS behaviour, and the Azure OpenAI path (covered by mocks in sub-project 2).

## Out of scope

Dashboard feature work, new ATS adapters, broad test coverage, Supabase Auth, atomic claiming of pending applications in the poller (single instance assumed).

## Risks

- Column-level grants are Postgres-specific; if Supabase's PostgREST ignores them in some configuration, the fallback is a `BEFORE UPDATE` trigger that rejects changes to other columns for the `anon` role.
- RemoteOK/Himalayas/Arbeitnow response shapes are taken from the existing (corrupted) code and public docs; fixtures mirror those shapes, not live captures.
