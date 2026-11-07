#!/usr/bin/env bash
# Runs the real PostgREST (the API layer the dashboard and server talk to) in front of a
# throwaway Postgres loaded with n8n/supabase-schema.sql, and exercises the exact request
# shapes Scout uses. Catches problems raw-SQL tests cannot (embedding shape, column types,
# conditional updates). Requires Docker.   Usage: bash scripts/verify-postgrest.sh
set -uo pipefail

cd "$(dirname "$0")/.."          # repo root (relative paths keep node happy on Windows)
NET=scout-pgrst-net; DB=scout-pgrst-db; REST=scout-pgrst-rest
PORT="${PGRST_TEST_PORT:-55433}"
IMG="${POSTGREST_IMAGE:-public.ecr.aws/supabase/postgrest:v14.5}"
SECRET="test-secret-test-secret-test-secret-123456"
FAILS=0

cleanup() { docker rm -f "$REST" "$DB" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

pass()  { echo "PASS  $1"; }
fail()  { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
pg()    { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
check() { if [ "$2" = "1" ]; then pass "$1"; else fail "$1 ($3)"; fi; }
is()    { if [ "$1" = "$2" ]; then echo 1; else echo 0; fi; }
atleast400() { if [ "$1" -ge 400 ]; then echo 1; else echo 0; fi; }

# req METHOD PATH [TOKEN] [BODY] [PREFER]  ->  sets STATUS and BODY
req() {
  local args=(-s -w '\n%{http_code}' -X "$1" "http://localhost:$PORT$2" -H 'Content-Type: application/json')
  [ -n "${3:-}" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "${5:-}" ] && args+=(-H "Prefer: $5")
  [ -n "${4:-}" ] && args+=(-d "$4")
  local out; out="$(curl "${args[@]}")"
  STATUS="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}

# js 'expression over j'  ->  prints 1 or 0. j is the parsed BODY; pickApplication is the dashboard helper.
js() {
  printf '%s' "$BODY" | node -e "
    let s=''; process.stdin.on('data', d => s += d).on('end', () => {
      let j; try { j = JSON.parse(s); } catch (e) { console.log(0); return; }
      const { pickApplication } = require('./dashboard/src/lib/pickApplication');
      console.log((($1)) ? 1 : 0);
    });"
}

docker network create "$NET" >/dev/null || { echo "network create failed"; exit 1; }
echo "Starting postgres and PostgREST..."
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null || exit 1
for _ in $(seq 1 60); do
  [ "$(docker logs "$DB" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
  sleep 1
done

pg -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
       CREATE ROLE authenticator LOGIN PASSWORD 'pw' NOINHERIT; GRANT anon, authenticated, service_role TO authenticator;
       CREATE PUBLICATION supabase_realtime;" >/dev/null 2>&1 || { echo "role setup failed"; exit 1; }
pg < n8n/supabase-schema.sql >/dev/null 2>&1 || { echo "schema failed"; exit 1; }

docker run -d --name "$REST" --network "$NET" -p "$PORT:3000" \
  -e PGRST_DB_URI="postgres://authenticator:pw@$DB:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" "$IMG" >/dev/null || { echo "postgrest failed to start"; exit 1; }
for _ in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 1; done

SERVICE_JWT="$(node -e "
  const c = require('crypto');
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'service_role' });
  console.log(h + '.' + p + '.' + c.createHmac('sha256', process.argv[1]).update(h + '.' + p).digest('base64url'));
" "$SECRET")"

L1=11111111-1111-1111-1111-111111111111
pg -c "INSERT INTO listings(id,title,company,source,apply_url,canonical_url) VALUES ('$L1','T1','C1','test','https://a.com/1','https://a.com/1');" >/dev/null || exit 1

EMBED='/listings?select=*,applications(id,status,fields_filled)&order=discovered_at.desc'

# ── dashboard: listing query + queueing (anon key) ──────────────────────────
req GET "$EMBED"
check "anon reads listings with the embedded application (none yet means no application)" \
  "$([ "$STATUS" = 200 ] && js 'j.length===1 && pickApplication(j[0].applications)===null' || echo 0)" "status $STATUS body $BODY"

req POST /applications "" "{\"listing_id\":\"$L1\",\"status\":\"pending_application\",\"status_updated_at\":\"$(date -u +%FT%TZ)\"}"
check "anon can queue an application" "$(is "$STATUS" 201)" "status $STATUS body $BODY"

req GET "$EMBED"
check "a unique listing_id FK is embedded as one object, not an array (why the dashboard needs pickApplication)" \
  "$(js '!Array.isArray(j[0].applications)')" "body $BODY"
check "pickApplication finds the queued application in that shape" \
  "$(js "pickApplication(j[0].applications)?.status==='pending_application'")" "body $BODY"
APP_ID="$(printf '%s' "$BODY" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)[0].applications.id))")"

req POST /applications "" "{\"listing_id\":\"$L1\",\"status\":\"pending_application\"}"
check "queueing the same listing twice is rejected with 409 (dashboard must surface it)" "$(is "$STATUS" 409)" "status $STATUS body $BODY"

# ── apply server: claim, report, recovery (service key) ─────────────────────
CLAIM="/applications?id=eq.$APP_ID&status=eq.pending_application"
req PATCH "$CLAIM" "$SERVICE_JWT" '{"status":"applying"}' 'return=representation'
check "first claim of a pending application succeeds (1 row)" "$(js 'Array.isArray(j) && j.length===1')" "status $STATUS body $BODY"
req PATCH "$CLAIM" "$SERVICE_JWT" '{"status":"applying"}' 'return=representation'
check "second claim of the same application changes nothing (0 rows)" "$(js 'Array.isArray(j) && j.length===0')" "status $STATUS body $BODY"

req PATCH "/applications?id=eq.$APP_ID" "$SERVICE_JWT" '{"fields_filled":[{"field":"Email"}]}'
check "an array in an INTEGER column is rejected (the old report shape)" "$(is "$STATUS" 400)" "status $STATUS body $BODY"
req PATCH "/applications?id=eq.$APP_ID" "$SERVICE_JWT" '{"status":"autofill_completed","fields_detected":5,"fields_filled":3,"fields_skipped":2,"ai_questions_answered":1,"fill_report":{"total":5,"filled":3,"details":{"filled":[]}}}'
check "the numeric report shape is accepted and reaches autofill_completed" "$(is "$STATUS" 204)" "status $STATUS body $BODY"

req PATCH "/applications?id=eq.$APP_ID" "$SERVICE_JWT" '{"status":"applying"}'
req PATCH "/applications?status=in.(applying,application_opened,form_analyzed)" "$SERVICE_JWT" '{"status":"failed","error_message":"Interrupted (apply server restarted)"}' 'return=representation'
check "interrupted-run recovery query marks active applications failed" \
  "$(js "Array.isArray(j) && j.length===1 && j[0].status==='failed'")" "status $STATUS body $BODY"

# ── anon cannot overreach through the API either ────────────────────────────
req PATCH "/applications?id=eq.$APP_ID" "" '{"fill_report":{"x":1}}'
check "anon cannot write fill_report through PostgREST" "$(atleast400 "$STATUS")" "status $STATUS"
req PATCH "/applications?id=eq.$APP_ID" "" '{"status":"autofill_completed"}'
check "anon cannot forge autofill_completed through PostgREST" "$(atleast400 "$STATUS")" "status $STATUS"
req PATCH "/applications?id=eq.$APP_ID" "" '{"status":"Discovered","error_message":null}'
check "anon can reset a failed application for retry" "$(is "$STATUS" 204)" "status $STATUS body $BODY"
req POST /listings "" '{"title":"x","company":"y","source":"z","apply_url":"https://x.com","canonical_url":"https://x.com"}'
check "anon cannot create listings through PostgREST" "$(atleast400 "$STATUS")" "status $STATUS"

echo
if [ "$FAILS" -eq 0 ]; then echo "All PostgREST checks passed."; else echo "$FAILS PostgREST check(s) FAILED."; exit 1; fi
