#!/usr/bin/env bash
# Applies n8n/supabase-schema.sql to a throwaway Postgres container (twice, to prove
# idempotency) and asserts the table constraints, RLS policies and column grants.
# Requires Docker. Usage: bash scripts/verify-schema.sh
set -uo pipefail

NAME=scout-schema-test
SCHEMA="$(cd "$(dirname "$0")/.." && pwd)/n8n/supabase-schema.sql"
FAILS=0

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

pg()      { docker exec -i "$NAME" psql -U postgres -d "${DBNAME:-postgres}" -v ON_ERROR_STOP=1 -q "$@"; }
scalar()  { printf '%s' "$1" | pg -t -A 2>/dev/null | tr -d '[:space:]'; }
pass()    { echo "PASS  $1"; }
fail()    { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }

# expect_ok DESC ROLE SQL  /  expect_fail DESC ROLE SQL
expect_ok()   { if printf 'SET ROLE %s; %s' "$2" "$3" | pg >/dev/null 2>&1; then pass "$1"; else fail "$1"; fi; }
expect_fail() { if printf 'SET ROLE %s; %s' "$2" "$3" | pg >/dev/null 2>&1; then fail "$1"; else pass "$1"; fi; }
expect_eq()   { local got; got="$(scalar "$3")"; if [ "$got" = "$2" ]; then pass "$1"; else fail "$1 (expected $2, got '$got')"; fi; }

echo "Starting postgres:16-alpine..."
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do
  [ "$(docker logs "$NAME" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
  sleep 1
done

# Roles and publication that exist on a real Supabase project
pg -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE PUBLICATION supabase_realtime;" \
  || { echo "role setup failed"; exit 1; }

for run in 1 2; do
  if pg < "$SCHEMA" >/dev/null 2>"/tmp/scout-schema-$run.err"; then
    pass "schema applies cleanly (run $run)"
  else
    fail "schema applies cleanly (run $run)"; cat "/tmp/scout-schema-$run.err"; echo "Cannot continue without a schema"; exit 1
  fi
done

L1=11111111-1111-1111-1111-111111111111
L2=22222222-2222-2222-2222-222222222222
pg -c "INSERT INTO listings(id,title,company,source,apply_url,canonical_url) VALUES
  ('$L1','T1','C1','test','https://a.com/1','https://a.com/1'),
  ('$L2','T2','C2','test','https://a.com/2','https://a.com/2');" || { echo "seed failed"; exit 1; }

# ── anon (the browser key) ───────────────────────────────────────────────────
expect_ok   "anon can SELECT listings"        anon "SELECT count(*) FROM listings;"
expect_ok   "anon can SELECT applications"    anon "SELECT count(*) FROM applications;"
expect_ok   "anon can SELECT field_mappings"  anon "SELECT count(*) FROM field_mappings;"
expect_fail "anon cannot INSERT listings"     anon "INSERT INTO listings(title,company,source,apply_url,canonical_url) VALUES ('x','y','z','https://x.com','https://x.com');"
expect_fail "anon cannot INSERT field_mappings" anon "INSERT INTO field_mappings(platform,field_signature,meaning) VALUES ('p','s','m');"
expect_fail "anon cannot INSERT a forged pipeline status" anon "INSERT INTO applications(listing_id,status,status_updated_at) VALUES ('$L1','autofill_completed',now());"
expect_ok   "anon can queue an application (pending_application)" anon "INSERT INTO applications(listing_id,status,status_updated_at) VALUES ('$L1','pending_application',now());"
expect_fail "anon cannot UPDATE fill_report (column grant)" anon "UPDATE applications SET fill_report = '{}'::jsonb;"
expect_ok   "anon can mark submitted"         anon "UPDATE applications SET status = 'submitted', status_updated_at = now();"
expect_ok   "anon can reset to Discovered and clear the error" anon "UPDATE applications SET status = 'Discovered', error_message = NULL, status_updated_at = now();"
expect_fail "anon cannot forge autofill_completed" anon "UPDATE applications SET status = 'autofill_completed';"
expect_fail "anon cannot set an unknown status" anon "UPDATE applications SET status = 'bogus';"
expect_fail "anon cannot DELETE applications" anon "DELETE FROM applications;"
pg -c "UPDATE applications SET status = 'applying' WHERE listing_id = '$L1';" >/dev/null 2>&1
printf "SET ROLE anon; UPDATE applications SET status = 'pending_application', status_updated_at = now();" | pg >/dev/null 2>&1
expect_eq   "anon cannot re-queue or edit an application while it is running (row left unchanged)" applying "SELECT status FROM applications WHERE listing_id = '$L1';"
pg -c "UPDATE applications SET status = 'failed' WHERE listing_id = '$L1';" >/dev/null 2>&1
printf "SET ROLE anon; UPDATE applications SET status = 'pending_application', status_updated_at = now();" | pg >/dev/null 2>&1
expect_eq   "anon can retry a failed application (row changed)" pending_application "SELECT status FROM applications WHERE listing_id = '$L1';"

# ── constraints (as superuser) ───────────────────────────────────────────────
expect_fail "duplicate canonical_url is rejected" postgres "INSERT INTO listings(title,company,source,apply_url,canonical_url) VALUES ('d','d','d','https://a.com/1','https://a.com/1');"
expect_fail "second application for the same listing is rejected" postgres "INSERT INTO applications(listing_id,status) VALUES ('$L1','pending_application');"
expect_fail "status CHECK rejects unknown values" postgres "INSERT INTO applications(listing_id,status) VALUES ('$L2','bogus');"
pg -c "INSERT INTO applications(listing_id,status) VALUES ('$L2','pending_application');" >/dev/null 2>&1
expect_eq   "deleting a listing cascades to its application" 0 "DELETE FROM listings WHERE id = '$L2'; SELECT count(*) FROM applications WHERE listing_id = '$L2';"

# ── service_role (server + n8n) ──────────────────────────────────────────────
expect_ok   "service_role can write field_mappings" service_role "INSERT INTO field_mappings(platform,field_signature,meaning) VALUES ('generic','sig','personal.email');"
expect_ok   "service_role can set pipeline statuses" service_role "UPDATE applications SET status = 'autofill_completed', fill_report = '{}'::jsonb;"
expect_ok   "service_role can insert listings" service_role "INSERT INTO listings(title,company,source,apply_url,canonical_url) VALUES ('n','n','n','https://n.com','https://n.com');"

# ── realtime ─────────────────────────────────────────────────────────────────
expect_eq   "applications is in the supabase_realtime publication" 1 "SELECT count(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'applications';"

# ── an OLDER install (what a hand-made Supabase project looks like) ────────────
# Tables created before this schema existed: missing columns, an old status rule with a legacy
# "Applied" value, a permissive old policy, and no unique index. Running the schema must migrate it.
echo
echo "Migrating a legacy-shaped database..."
docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE legacy;" >/dev/null || { echo "could not create the legacy database"; exit 1; }
DBNAME=legacy
pg -c "CREATE PUBLICATION supabase_realtime;" >/dev/null 2>&1
pg >/dev/null <<'LEGACY_SQL'
CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, company text NOT NULL, location text, source text,
  description text, apply_url text, canonical_url text, posted_date timestamptz, discovered_at timestamptz DEFAULT now(),
  is_internship boolean DEFAULT false);
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid REFERENCES listings(id),
  status text DEFAULT 'Discovered' CHECK (status IN ('Discovered','pending_application','applying','Applied')),
  status_updated_at timestamptz DEFAULT now(), notes text);
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legacy anon everything" ON applications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "legacy anon everything" ON listings FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT ALL ON applications, listings TO anon;
INSERT INTO listings(id, title, company, source, apply_url, canonical_url) VALUES ('33333333-3333-3333-3333-333333333333','Old job','Old Co','LinkedIn','https://old.example/1','https://old.example/1');
INSERT INTO applications(listing_id, status) VALUES ('33333333-3333-3333-3333-333333333333','Applied');
LEGACY_SQL
for run in 1 2; do
  if pg < "$SCHEMA" >/dev/null 2>"/tmp/scout-legacy-$run.err"; then pass "the schema migrates the legacy database cleanly (run $run)"; else fail "the schema migrates the legacy database cleanly (run $run)"; cat "/tmp/scout-legacy-$run.err"; fi
done

COLS_APP="ats_platform started_at completed_at fields_detected fields_filled fields_skipped ai_questions_answered fill_report error_message notes status_updated_at"
for col in $COLS_APP; do
  expect_eq "legacy applications gained the column $col" 1 "SELECT count(*) FROM information_schema.columns WHERE table_name = 'applications' AND column_name = '$col';"
done
expect_eq "legacy listings gained the salary column" 1 "SELECT count(*) FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'salary';"
expect_eq "field_mappings was created" 1 "SELECT count(*) FROM information_schema.tables WHERE table_name = 'field_mappings';"
expect_eq "the legacy 'Applied' status became 'submitted'" submitted "SELECT status FROM applications WHERE listing_id = '33333333-3333-3333-3333-333333333333';"
expect_ok   "the new pipeline statuses are accepted on the legacy table" postgres "UPDATE applications SET status = 'autofill_completed', fields_filled = 3, fill_report = '{}'::jsonb;"
expect_ok   "n8n's upsert works (unique index on canonical_url exists)" service_role "INSERT INTO listings(title,company,source,apply_url,canonical_url,salary) VALUES ('t','c','s','https://old.example/1','https://old.example/1','x') ON CONFLICT (canonical_url) DO NOTHING;"
expect_fail "a second application for one listing is rejected (unique index)" postgres "INSERT INTO applications(listing_id, status) VALUES ('33333333-3333-3333-3333-333333333333','pending_application');"
printf "SET ROLE anon; UPDATE applications SET status = 'autofill_completed';" | pg >/dev/null 2>&1
pg -c "UPDATE applications SET status = 'failed';" >/dev/null 2>&1
printf "SET ROLE anon; UPDATE applications SET status = 'autofill_completed', status_updated_at = now();" | pg >/dev/null 2>&1
expect_eq   "the old permissive policy is gone: the browser key cannot forge autofill_completed" failed "SELECT status FROM applications;"
expect_fail "the browser key cannot write the fill report on a migrated table" anon "UPDATE applications SET fill_report = '{}'::jsonb;"
expect_fail "the browser key cannot create listings on a migrated table" anon "INSERT INTO listings(title,company,source,apply_url,canonical_url) VALUES ('x','y','z','https://x.com','https://x.com');"
expect_eq   "only this schema's policies remain on applications" 3 "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applications';"
DBNAME=postgres

echo
if [ "$FAILS" -eq 0 ]; then echo "All schema checks passed."; else echo "$FAILS schema check(s) FAILED."; exit 1; fi
