# Scout Core Flow Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Scout's discover → queue → autofill → review pipeline runnable from a fresh clone: one coherent Supabase schema, a working n8n workflow (in Docker), a provider-pluggable LLM layer, realtime job pickup, validated requests, and accurate docs.

**Architecture:** Keep the existing stack (Node/Express/Playwright backend, Supabase, n8n, Next.js dashboard). Pull logic out of `server.js` and the n8n JSON into small tested modules (`src/llm`, `src/api`, `src/queue`, `n8n/normalize.js`); generate the workflow JSON from source instead of hand-editing; verify the SQL against a throwaway Postgres container.

**Tech Stack:** Node 24 (CommonJS, built-in `node:test`), Express 5, zod, Playwright 1.63.0, `@supabase/supabase-js`, Postgres 16 (test container), n8n (Docker), Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-07-core-flow-fixes-design.md`

## Global Constraints

- Backend stays CommonJS with `'use strict'`; new tests use `node:test` + `node:assert/strict` and live in `tests/*.test.js`.
- `npm test` must be `node --test "tests/**/*.test.js"`; the existing 44 `fieldMatcher` assertions keep passing.
- Application statuses (exact set): `Discovered`, `pending_application`, `applying`, `application_opened`, `form_analyzed`, `autofill_completed`, `awaiting_review`, `submitted`, `failed`. `Applied` is removed.
- Tables: `listings` (unique `canonical_url`), `applications` (`listing_id` unique FK, `ON DELETE CASCADE`), `field_mappings` (`unique(platform, field_signature)`). The `jobs` table no longer exists.
- Env vars: server uses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; n8n uses `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; LLM uses `LLM_PROVIDER` (`azure`|`openai`), `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, plus the existing `AZURE_OPENAI_*`. The service-role key must never get a `NEXT_PUBLIC_` name and never reach the dashboard.
- The apply step never auto-submits. Logs never contain profile PII or API keys.
- Dependencies removed: `node-cron`, `node-telegram-bot-api`, `pdf-parse`, `axios`. Added: `zod`. Use `npm install … --ignore-scripts` (skips the Playwright browser download).
- Never edit or print `.env` or `profile.json`. Do not run destructive git commands.
- Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; commits `git add` explicit paths only.

## Review Focus

Failure modes the spec implies; each has a test in the named task.

1. One of the three job APIs is down or returns an unexpected shape → remaining sources still saved, nothing throws (Task 6).
2. The same job seen with different tracking params, trailing slash or fragment, across runs or sources → exactly one listing (Task 6).
3. Realtime event, poll tick and a double-click all fire for one application → it runs once; a job queued mid-run is still picked up (Task 4).
4. LLM returns malformed JSON, empty content, a meaning outside the allowed list, or the provider is unconfigured → field is skipped, nothing crashes (Task 2).
5. Server started with no Supabase credentials, or only the anon key → boots, `/health` works, clear warning; hostile `/apply` bodies (`file://`, missing url) get 400 (Tasks 3, 4, 8).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/llm/operations.js` (new) | Prompts, zod validation, `classifyField`/`generateAnswer` over any transport |
| `src/llm/openaiCompatClient.js` (new) | OpenAI-format transport (OpenAI, Gemini-compat, Groq, Ollama) |
| `src/llm/azureClient.js` (modify) | Azure transport only |
| `src/llm/index.js` (new) | Provider selection + public LLM API used by the engine |
| `src/api/schemas.js` (new) | zod request schemas + `validateBody` middleware |
| `src/engine/screenshot.js` (new) | Correct Playwright screenshot → data URL |
| `src/db/supabase.js` (modify) | Key resolution, queue store functions, realtime subscription |
| `src/queue/applicationQueue.js` (new) | Locked claim loop fed by realtime + fallback poll |
| `n8n/supabase-schema.sql` (rewrite) | Single idempotent schema, RLS, grants, realtime publication |
| `scripts/verify-schema.sh` (new) | Applies schema to a throwaway Postgres and asserts policies |
| `n8n/normalize.js` (new) | Pure job normalization (embedded into the n8n Code node) |
| `n8n/build-workflow.js` (new) | Generates `n8n/scout-job-discovery.json` |
| `docker-compose.yml` (new) | n8n + one-shot workflow import |

---

### Task 0: Baseline commit of existing work (needs user OK at handoff)

The working tree holds the user's uncommitted v2 work (`server.js`, `src/*`, `tests/`, dashboard changes). Later commits touch some of those files, so snapshot them first.

**Files:** all currently modified/untracked files except `.env`, `profile.json` (already git-ignored).

- [ ] **Step 1:** Run `git status --short`; confirm it matches the session-start list (`.env.example`, `.gitignore`, dashboard css/page, `package.json`, `profile.example.json`, `server.js`, `n8n/migration_v2.sql`, `src/{adapters,config,db,engine,llm}/`, `src/logger.js`, `tests/`) plus `docs/`.
- [ ] **Step 2:** `git add` those paths explicitly (not `-A`), then commit `chore: snapshot v2 engine, adapters and dashboard before core-flow work`.
- [ ] **Step 3:** `git status --short` shows a clean tree.

### Task 1: Test runner, dependency cleanup, dead code

**Files:** Modify `package.json`, `package-lock.json`, `tests/fieldMatcher.test.js` (only if its exit code is missing); Delete `src/discovery/`.

- [ ] **Step 1:** Confirm `tests/fieldMatcher.test.js` ends with `process.exit(failed > 0 ? 1 : 0)`; add it if absent (a failing assertion must make `node --test` fail).
- [ ] **Step 2:** Set `scripts.test` to `node --test "tests/**/*.test.js"`.
- [ ] **Step 3:** `npm uninstall node-cron node-telegram-bot-api pdf-parse axios --ignore-scripts` then `npm install zod --ignore-scripts`.
- [ ] **Step 4:** `git rm -r src/discovery`; `grep -rn "discovery/\|axios\|node-cron\|pdf-parse\|node-telegram" server.js src tests` returns nothing.
- [ ] **Step 5:** Run `npm test`. Expected: 1 test file, exit 0, output still shows `Results: 44/44 passed`.
- [ ] **Step 6:** Commit `chore: switch to node:test, drop unused deps and dead discovery code`.

### Task 2: Pluggable LLM provider layer

**Files:** Create `src/llm/operations.js`, `src/llm/openaiCompatClient.js`, `src/llm/index.js`; Modify `src/llm/azureClient.js`, `src/engine/answerGenerator.js:16`, `src/engine/fieldMatcher.js:176`; Test `tests/llm.select.test.js`, `tests/llm.operations.test.js`, `tests/llm.openai.test.js`.

**Interfaces:**
- Transport shape (all providers): `{ name: string, isConfigured(): boolean, callAPI(messages: {role: string, content: string}[], opts?: {maxTokens?: number, temperature?: number, jsonMode?: boolean}): Promise<string | null> }`. `callAPI` returns `null` when unconfigured and throws `Error` on HTTP failure or empty content. Env is read at call time, not at require time.
- `operations.js`: `createOperations(transport) → { classifyField(fieldDescription: object): Promise<{meaning: string, confidence: number, action: 'fill'|'skip'} | null>, generateAnswer(p: {question, candidateProfile, jobTitle, company, jobDescription}): Promise<{answer: string, confidence: number, evidence: string[]}> }`; also exports `VALID_MEANINGS: string[]` (the meaning list from the existing classify prompt plus `'unknown'`).
- `index.js`: `selectProvider(env = process.env): 'azure' | 'openai' | null`; `classifyField`, `generateAnswer` (same signatures as above, delegating to the provider chosen at call time; no provider → `null` / `{answer:'', confidence:0, evidence:[]}`); `isConfigured(): boolean`.
- Consumes nothing from other tasks.

- [ ] **Step 1: Write failing tests.**
  - `llm.select.test.js` asserts `selectProvider`: `LLM_PROVIDER=openai` beats complete Azure vars; the three `AZURE_OPENAI_*` vars alone → `'azure'`; only `LLM_API_KEY` → `'openai'`; only `LLM_BASE_URL` → `'openai'`; empty env → `null`; `LLM_PROVIDER=bogus` falls back to auto-detection.
  - `llm.operations.test.js` uses a fake transport and asserts: valid classify JSON maps to `{meaning, confidence, action}`; malformed JSON → `null`; meaning `personal.ssn` (not in `VALID_MEANINGS`) → `null`; confidence `7` clamps to `1`, `-2` to `0`; transport throwing → `null`; transport returning `null` → `null`; first message sent is the system prompt and `jsonMode` is `true`; `generateAnswer` with empty or non-JSON content → `{answer:'', confidence:0, evidence:[]}`, with valid JSON → trimmed answer and array evidence.
  - `llm.openai.test.js` stubs `globalThis.fetch` and asserts: `LLM_BASE_URL=http://localhost:11434/v1/` yields request URL `http://localhost:11434/v1/chat/completions`; default base is `https://api.openai.com/v1`; `Authorization: Bearer k` sent only when `LLM_API_KEY` is set; body `model` equals `LLM_MODEL`, defaulting to `gpt-4o-mini`; `response_format` present only with `jsonMode`; non-2xx rejects with a message containing the status; empty content rejects; `isConfigured()` is true with either key or base URL.
- [ ] **Step 2:** Run `node --test tests/llm.*.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Move the prompts and parse logic out of `azureClient.js` into `operations.js`, adding zod validation of both response shapes and the `VALID_MEANINGS` check. Reduce `azureClient.js` to `{ name: 'azure', isConfigured, callAPI }` (unchanged endpoint/headers behaviour). Implement `openaiCompatClient.js` and `index.js` per the Interfaces block.
- [ ] **Step 4:** Point `answerGenerator.js` and `fieldMatcher.js` (stage 3) at `require('../llm')`.
- [ ] **Step 5:** Run `npm test`. Expected: all pass, including the 44 field-matcher assertions.
- [ ] **Step 6:** Commit `feat: pluggable LLM provider layer (azure + openai-compatible) with validated responses`.

### Task 3: Request validation and screenshot helper

**Files:** Create `src/api/schemas.js`, `src/engine/screenshot.js`; Test `tests/schemas.test.js`, `tests/screenshot.test.js`.

**Interfaces:**
- `schemas.js`: `applyBodySchema` (`url` http/https only; optional `jobId` non-empty string; `title`, `company`, `description` default `''`), `correctionBodySchema` (`platform` default `'generic'`, optional `domain`, `fieldSignature` and `meaning` non-empty, `confidence` number 0–1 default 1), `validateBody(schema) → (req, res, next) => void` — on success sets `req.body` to the parsed value and calls `next()`; on failure responds `400` with `{ error: 'Invalid request', issues: [{ path: string, message: string }] }`.
- `screenshot.js`: `captureScreenshotDataUrl(page): Promise<string>` returning `data:image/png;base64,…`; calls `page.screenshot({ fullPage: true })` with no `encoding` option.

- [ ] **Step 1: Write failing tests.** `schemas.test.js`: missing url fails; `javascript:alert(1)` and `file:///etc/passwd` fail; `{url:'https://boards.greenhouse.io/x'}` parses with `title === ''`; confidence `1.5` rejected; correction without platform parses to `'generic'`; middleware with a fake `res` records status `400` and an issue whose `path` is `'url'`, and on valid input calls `next` with the parsed body. `screenshot.test.js`: stub page whose `screenshot` returns `Buffer.from('abc')` → result `data:image/png;base64,YWJj`, and the stub's received options have no `encoding` key.
- [ ] **Step 2:** `node --test tests/schemas.test.js tests/screenshot.test.js` → FAIL.
- [ ] **Step 3:** Implement both modules per Interfaces.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat: zod request schemas, validation middleware, correct screenshot helper`.

### Task 4: Supabase key handling and application queue

**Files:** Modify `src/db/supabase.js`; Create `src/queue/applicationQueue.js`; Test `tests/supabaseKey.test.js`, `tests/applicationQueue.test.js`.

**Interfaces:**
- `supabase.js` adds: `resolveSupabaseKey(env = process.env): { key: string|null, role: 'service'|'anon'|null }` (service key preferred; empty strings count as missing); `fetchPendingApplication(): Promise<object|null>` (oldest `pending_application` row with `listings!inner(*)`); `claimApplication(id: string): Promise<boolean>` (update to `applying` only `where status = 'pending_application'`, returns whether a row changed); `markApplicationFailed(id: string, message: string): Promise<void>`; `subscribePendingApplications(onPending: () => void): () => void` (Realtime on `applications`, calls `onPending` when the new row's status is `pending_application`; returns unsubscribe). `getSupabase()` uses `resolveSupabaseKey` and logs a warning when `role === 'anon'` that server writes will fail under RLS. Existing exports unchanged.
- `applicationQueue.js`: `createQueue({ store, runApply, log, intervalMs = 30000 }) → { trigger(): Promise<void>, start(): void, stop(): void }` where `store = { fetchPending, claim, markFailed, subscribe }` (the four supabase functions) and `runApply(appRecord): Promise<void>` throws on failure. `trigger()` drains pending items one at a time under an in-process lock; a `trigger()` arriving during a drain schedules exactly one more pass. A thrown `runApply` calls `store.markFailed(id, error.message)` and the drain continues. `start()` subscribes (subscription callback → `trigger()`), starts the interval, and triggers once; `stop()` unsubscribes and clears the interval.

- [ ] **Step 1: Write failing tests.** `supabaseKey.test.js`: service+anon → role `service`; anon only → `anon`; neither or empty strings → `{key:null, role:null}`. `applicationQueue.test.js` with fake store/runApply: one pending item and two simultaneous `trigger()` calls → `runApply` called once; `claim` resolving `false` → `runApply` not called; `runApply` rejecting → `markFailed(id, message)` called and the next pending item still processed; an item that appears while the first is running is processed by the follow-up pass; `start()` subscribes, schedules at 30000 ms (use `mock.timers`) and a subscription callback causes a trigger; `stop()` unsubscribes and the interval no longer fires.
- [ ] **Step 2:** `node --test tests/supabaseKey.test.js tests/applicationQueue.test.js` → FAIL.
- [ ] **Step 3:** Implement per Interfaces. Use `.update(...).eq('id', id).eq('status','pending_application').select('id')` for the conditional claim.
- [ ] **Step 4:** Same command → PASS; run `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: service-key resolution, locked application queue with realtime pickup`.

### Task 5: Schema rewrite, verified against a real Postgres

**Files:** Rewrite `n8n/supabase-schema.sql`; Delete `n8n/migration_v2.sql`; Create `scripts/verify-schema.sh`.

**Interfaces:** Produces the table/column/policy contract from the spec (§1–2) including the policy refinements recorded there. Idempotent: every `CREATE` uses `IF NOT EXISTS`, every policy is preceded by `DROP POLICY IF EXISTS`, the publication add is guarded by a `pg_publication_tables` check. Ends with `GRANT ALL … TO service_role` for the three tables.

- [ ] **Step 1: Write `scripts/verify-schema.sh` first** (bash, `set -euo pipefail`, trap that `docker rm -f scout-schema-test`). It starts `postgres:16-alpine`, waits on `pg_isready`, creates roles `anon`, `authenticated`, `service_role` (NOLOGIN) and an empty publication `supabase_realtime`, applies `n8n/supabase-schema.sql` **twice** with `ON_ERROR_STOP=1`, then asserts each of these (printing `PASS`/`FAIL` per line, exit 1 on any FAIL):
  - as `anon`: `SELECT` on all three tables succeeds; `INSERT INTO listings` fails; `UPDATE applications SET fill_report = '{}'` fails (permission denied); `INSERT INTO applications` with status `autofill_completed` fails, with `pending_application` succeeds; `UPDATE … SET status = 'submitted'` succeeds, `'bogus'` fails.
  - as superuser/`service_role`: duplicate `listings.canonical_url` fails; a second application for the same `listing_id` fails; deleting a listing removes its application; `field_mappings` insert succeeds as `service_role`; `applications` appears in `pg_publication_tables` for `supabase_realtime`.
- [ ] **Step 2:** Run `bash scripts/verify-schema.sh` against the *old* schema. Expected: FAIL (tables missing).
- [ ] **Step 3:** Write the new schema; `git rm n8n/migration_v2.sql`.
- [ ] **Step 4:** Rerun the script. Expected: every line `PASS`, exit 0.
- [ ] **Step 5:** Commit `feat: unified supabase schema with tightened RLS, verified in postgres container`.

### Task 6: n8n normalization and generated workflow

**Files:** Create `n8n/normalize.js`, `n8n/build-workflow.js`; Regenerate `n8n/scout-job-discovery.json`; Test `tests/normalize.test.js`, `tests/buildWorkflow.test.js`.

**Interfaces:**
- `normalize.js` (plain CommonJS, **no `require` calls** so its source can be embedded in the Code node): exports `normalize({ himalayas, arbeitnow, remoteok }): ListingRow[]` where the inputs are the raw arrays (`response.jobs`, `response.data`, and the whole RemoteOK array including its metadata element at index 0), `canonicalizeUrl(url: string): string | null`, `formatSalary(min: number, max: number): string`. `ListingRow = { title, company, location, salary, source, description, apply_url, canonical_url, posted_date: string|null, is_internship: boolean }`.
- `build-workflow.js`: exports `buildWorkflow(): object`; running `node n8n/build-workflow.js` writes the JSON file. Workflow `id` is `scout-job-discovery`. Node chain (sequential, avoiding multi-input merge ambiguity): Schedule Trigger + Manual Trigger → `Fetch Himalayas Jobs` → `Fetch Arbeitnow Jobs` → `Fetch RemoteOK Jobs` → `Normalize & Deduplicate` (Code) → `Save to Supabase` (HTTP). Fetch nodes use `onError: 'continueRegularOutput'`. Code node = embedded `normalize.js` source + glue reading each fetch node via `$('<name>').first()?.json` and returning `[{ json: { rows } }]`, or `[]` when there are no rows. Save node: `POST ={{ $env.SUPABASE_URL }}/rest/v1/listings?on_conflict=canonical_url`, headers `apikey` and `Authorization` as `=`-prefixed expressions using `$env.SUPABASE_SERVICE_ROLE_KEY` (`'Bearer ' + …`), `Prefer: resolution=ignore-duplicates,return=minimal`, body `={{ JSON.stringify($json.rows) }}`.

- [ ] **Step 1: Write failing tests.**
  - `normalize.test.js`: title keyword filter is case-insensitive and rejects non-matching titles; Arbeitnow rows with `remote !== true` dropped; RemoteOK index 0 skipped; HTML stripped and description ≤ 400 chars; `https://Example.com/Jobs/1/?utm_campaign=x&id=5#top` → `https://example.com/Jobs/1?id=5` (host lowercased, path case kept, non-tracking param kept, `utm_*`/`ref`/`fbclid`/`gclid`/fragment/trailing slash removed); the same job from two sources or with two URL variants → one row, first source wins; rows missing title, company or URL dropped; `normalize({})` and `normalize({ himalayas: null, arbeitnow: 'oops', remoteok: [{}] })` return `[]` without throwing; `is_internship` true for `Software Engineering Intern` and `Engineering Internship`, false for `Senior Engineer` and `Internal Tools Engineer`; `formatSalary(80000, 120000) === '$80,000 - $120,000'`, `'Competitive'` when either value is missing; Himalayas `pubDate` (unix seconds) → ISO `posted_date`; unparseable date → `null`.
  - `buildWorkflow.test.js`: JSON file parses; node names and connection order match the Interfaces block; fetch nodes have `onError`; Save node URL ends with `/rest/v1/listings?on_conflict=canonical_url`, its header values and body start with `=`; the Code node source contains `normalize.js`'s source verbatim, compiles with `new vm.Script('(async()=>{' + code + '})')`, and when executed in a `vm` context with a stubbed `$` serving fixtures returns one item whose `json.rows.length > 0` (and `[]` with empty stubs); `buildWorkflow()` deep-equals the file on disk.
- [ ] **Step 2:** `node --test tests/normalize.test.js tests/buildWorkflow.test.js` → FAIL.
- [ ] **Step 3:** Implement `normalize.js` (reuse the keyword list and per-source field mapping from the existing JSON's Code node; `is_internship` via `/\bintern(ship)?s?\b/i`), then `build-workflow.js`; run `node n8n/build-workflow.js`.
- [ ] **Step 4:** Same command → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: tested job normalizer and generated n8n workflow targeting listings`.

### Task 7: n8n in Docker

**Files:** Create `docker-compose.yml`; Modify `.env.example`.

**Interfaces:** Consumes `n8n/scout-job-discovery.json` (id `scout-job-discovery`). Services: `n8n-import` (one-shot: `n8n import:workflow --input=/workflows/scout-job-discovery.json`, `./n8n` mounted read-only at `/workflows`) and `n8n` (port 5678, `depends_on: n8n-import` with `condition: service_completed_successfully`, `restart: unless-stopped`, healthcheck `wget -qO- http://localhost:5678/healthz`). Both share volume `n8n_data` → `/home/node/.n8n` and the same environment block (YAML anchor): `N8N_ENCRYPTION_KEY` (`${N8N_ENCRYPTION_KEY:?…}`), `GENERIC_TIMEZONE`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `N8N_DIAGNOSTICS_ENABLED=false`, `SUPABASE_URL` (from `${NEXT_PUBLIC_SUPABASE_URL:-}`), `SUPABASE_SERVICE_ROLE_KEY` (`${…:-}`).

- [ ] **Step 1:** Pull `docker.n8n.io/n8nio/n8n:latest`, read its version with `docker run --rm docker.n8n.io/n8nio/n8n:latest n8n --version`, and use that exact version as the pinned tag in the compose file.
- [ ] **Step 2:** Write the compose file; add `N8N_ENCRYPTION_KEY`, `GENERIC_TIMEZONE`, `SUPABASE_SERVICE_ROLE_KEY` and the `LLM_*` block (commented examples for OpenAI, Gemini, Groq, Ollama) to `.env.example`.
- [ ] **Step 3:** `N8N_ENCRYPTION_KEY=test-key docker compose config` exits 0 and shows both services; without the variable it fails with the `:?` message.
- [ ] **Step 4:** `N8N_ENCRYPTION_KEY=test-key docker compose up -d`; wait until `docker compose ps` shows `n8n` healthy; `docker compose logs n8n-import` shows a successful import; `docker compose exec n8n n8n list:workflow` lists `scout-job-discovery`.
- [ ] **Step 5:** `docker compose down` (keep the volume). Re-run Step 4's `up -d` once to confirm re-import is idempotent (still exactly one workflow), then `down`.
- [ ] **Step 6:** Commit `feat: run n8n in Docker with automatic workflow import`.

### Task 8: Wire up server, Dockerfile, dashboard labels

**Files:** Modify `server.js`, `Dockerfile`, `dashboard/src/app/page.tsx` (remove the `Applied` entries from `STATUS_LABELS` and `STATUS_COLORS`).

**Interfaces:** Consumes `validateBody`/`applyBodySchema`/`correctionBodySchema` (Task 3), `captureScreenshotDataUrl` (Task 3), `createQueue` and the store functions (Task 4).

- [ ] **Step 1:** In `server.js`: apply `validateBody(applyBodySchema)` to `POST /apply` and `validateBody(correctionBodySchema)` to `POST /corrections`; replace the headless screenshot block with `captureScreenshotDataUrl`; require `upsertFieldMapping` at the top; replace the `setInterval` polling block with a queue built from the Task 4 store functions whose `runApply` POSTs to the local `/apply` and throws when the response contains `error`; call `queue.start()` from the `app.listen` callback only when Supabase is configured, and log the endpoints plus which pickup mode is active.
- [ ] **Step 2:** Dockerfile: set the base image to `mcr.microsoft.com/playwright:v1.63.0-noble`; verify with `docker manifest inspect`. If the tag does not exist, find the newest existing `v*-noble` tag, run `npm install playwright@<that version> --ignore-scripts`, and use the same version in the Dockerfile.
- [ ] **Step 3:** `docker build -t scout-apply-test .` succeeds; remove the test image afterwards.
- [ ] **Step 4:** Smoke test: start `PORT=3999 NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= node server.js` in the background. Expected: `GET /health` → `{"status":"ok",…}`; `GET /profile` → 200 with no `email`/`phone` keys; `POST /apply` with `{}` → 400 `Invalid request`; with `{"url":"file:///etc/passwd"}` → 400; log shows the "Supabase credentials not configured" warning. Stop the server.
- [ ] **Step 5:** `cd dashboard && npm run build` exits 0.
- [ ] **Step 6:** `npm test` passes. Commit `feat: validated routes, queue-driven pickup, fixed screenshot, aligned Docker image`.

### Task 9: Documentation

**Files:** Rewrite `README.md`, `n8n/README.md`, `dashboard/README.md`.

- [ ] **Step 1:** `README.md` sections: what Scout is and the human-review rule; text architecture diagram (n8n → Supabase → dashboard → queue → Playwright → browser); prerequisites; numbered setup (create Supabase project → run `n8n/supabase-schema.sql` → fill root `.env` → dashboard `.env.local` with the two `NEXT_PUBLIC_*` vars and `NEXT_PUBLIC_LOCAL_API` → `profile.json` → `npm install` → `npm start` → `cd dashboard && npm run dev` → `docker compose up -d` and activate the workflow at `http://localhost:5678`); env-var table covering every variable in `.env.example`; LLM provider table (Azure, OpenAI, Gemini, Groq, Ollama values); status lifecycle; security note (service key stays server-side, `fill_report` readable by the anon key); how to run tests and `scripts/verify-schema.sh`; troubleshooting (server offline badge, nothing queued, Docker/n8n env access).
- [ ] **Step 2:** `n8n/README.md`: corrected workflow description (three sources, no Adzuna), sequential node chain, `node n8n/build-workflow.js`, env vars, import via Docker vs manual. `dashboard/README.md`: replace boilerplate with a short Scout-specific note and env vars.
- [ ] **Step 3:** Verify docs match code: `grep -rhoE "process\.env\.[A-Z_]+" server.js src | sort -u` — every name appears in `.env.example` or the README table; every path/command mentioned in the README exists.
- [ ] **Step 4:** Commit `docs: rewrite README, n8n and dashboard docs for the unified setup`.

### Task 10: Final verification

- [ ] **Step 1:** `npm test` → all test files pass; report counts.
- [ ] **Step 2:** `bash scripts/verify-schema.sh` → all `PASS`.
- [ ] **Step 3:** `node n8n/build-workflow.js && git diff --exit-code n8n/scout-job-discovery.json` → no diff.
- [ ] **Step 4:** `docker compose config` (with `N8N_ENCRYPTION_KEY` set) → exits 0; `cd dashboard && npm run build` → exits 0.
- [ ] **Step 5:** `git status --short` is clean except intentionally untracked files; report to the user exactly what was verified and what was not (n8n→Supabase write with real credentials, Azure/OpenAI live calls, real-site form fills).
