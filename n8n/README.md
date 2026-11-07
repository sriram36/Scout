# Scout — n8n job discovery

The workflow finds remote developer jobs and stores them in the Supabase `listings` table.

## Workflow

`Schedule Trigger` (every 6 hours) or the manual trigger runs these nodes in order:

1. **Fetch Himalayas Jobs** — `https://himalayas.app/jobs/api?category=developer`
2. **Fetch Arbeitnow Jobs** — `https://www.arbeitnow.com/api/job-board-api`
3. **Fetch RemoteOK Jobs** — `https://remoteok.com/api`
4. **Normalize & Deduplicate** (Code) — keeps developer/engineering titles, strips HTML, maps each source to the `listings` columns, flags internships, and de-duplicates by canonical URL (tracking parameters, fragments and trailing slashes are ignored; the first source wins).
5. **Save to Supabase** — `POST /rest/v1/listings?on_conflict=canonical_url` with `Prefer: resolution=ignore-duplicates`, so re-runs never create duplicates.

The fetch nodes continue on error: if one source is down, the others are still saved. If nothing new is found, the save node does not run.

## Files

| File | Purpose |
|---|---|
| `supabase-schema.sql` | Creates `listings`, `applications`, `field_mappings`, the access rules and the Realtime publication. Safe to re-run. |
| `normalize.js` | The normalization logic. Pure functions with no imports — it is embedded in the Code node and unit-tested in Node (`tests/normalize.test.js`). |
| `build-workflow.js` | Generates `scout-job-discovery.json` from `normalize.js`. **Do not hand-edit the JSON.** |
| `scout-job-discovery.json` | The generated workflow (fixed id `scout-job-discovery`). |

After changing `normalize.js` run `node n8n/build-workflow.js`; `npm test` fails if the JSON is out of date.

## Run it with Docker (recommended)

From the repository root, with `N8N_ENCRYPTION_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in `.env`:

```bash
docker compose up -d
```

A one-shot `n8n-import` service loads the workflow before n8n starts, and re-running it updates the same workflow instead of duplicating it. Then open `http://localhost:5678`, create the owner account, test-run the workflow, and switch it to **Active**.

Inside n8n the workflow reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; `docker-compose.yml` maps them from your `.env` and sets `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, which the workflow needs to read them.

## Without Docker

Run your own n8n, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` in its environment, then import `scout-job-discovery.json` via *Workflows → Import from file*.

## Database

Run `supabase-schema.sql` in the Supabase SQL editor. `bash scripts/verify-schema.sh` applies it to a throwaway Postgres container and checks the constraints and access rules.
