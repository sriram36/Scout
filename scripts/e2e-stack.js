'use strict';

/**
 * Full-stack end-to-end test on a throwaway copy of the whole system. Needs Docker and the
 * Playwright Chromium browser; takes a few minutes; touches no real account.
 *
 *   node scripts/e2e-stack.js
 *
 * It starts: Postgres (the real schema) + PostgREST behind a small /rest/v1 proxy (what Supabase's
 * gateway does), the real n8n workflow (calls the live job APIs), the real apply server, and the
 * built dashboard driven by a real browser. Realtime is not part of it: the queue's fallback poll
 * (what runs whenever Realtime is unavailable) does the pickup.
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DASH = path.join(ROOT, 'dashboard');
const PORTS = { rest: 55440, proxy: 55441, server: 3911, dashboard: 3910 };
const SECRET = 'e2e-secret-e2e-secret-e2e-secret-1234567';
const NAMES = { net: 'scout-e2e-net', db: 'scout-e2e-db', rest: 'scout-e2e-rest', compose: 'scout-e2e' };
const POSTGREST_IMAGE = process.env.POSTGREST_IMAGE || 'public.ecr.aws/supabase/postgrest:v14.5';
const PROXY_URL = `http://127.0.0.1:${PORTS.proxy}`;

// ── tiny test harness ───────────────────────────────────────────────────────
const results = [];
const proxyLog = [];   // what the gateway saw: handy when something cannot reach it
const dumpProxyLog = (n = 12) => proxyLog.slice(-n).map(l => `        gateway: ${l}`).join('\n');
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '\n' + String(detail).split('\n').slice(0, 10).map(l => `        ${l.slice(0, 700)}`).join('\n') : ''}`);
};
const phase = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(2, 70 - title.length))}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function until(label, fn, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error(`timed out waiting for ${label}`);
}

// ── keys ────────────────────────────────────────────────────────────────────
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(role) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role, iss: 'scout-e2e' });
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
const KEYS = { anon: jwt('anon'), service: jwt('service_role') };

async function rest(pathAndQuery, { role = 'service', method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${PROXY_URL}/rest/v1${pathAndQuery}`, {
    method,
    headers: {
      apikey: KEYS[role], Authorization: `Bearer ${KEYS[role]}`, 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }
  return { status: res.status, json, text };
}

// ── processes and containers ────────────────────────────────────────────────
const children = [];
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch (_) { /* already gone */ }
}
const docker = (args, opts = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
/**
 * Runs docker WITHOUT blocking the event loop and resolves with everything it printed (stdout + stderr).
 * The gateway runs inside this process, so a blocking call here would freeze it while n8n or a probe
 * container is trying to talk to it.
 */
function dockerRun(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('docker', args, { ...opts });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('error', e => resolve({ output: out + String(e), code: -1 }));
    child.on('close', (code) => resolve({ output: out, code }));
  });
}
const dockerOutput = async (args, opts = {}) => (await dockerRun(args, opts)).output;

function cleanDockerOnly() {
  for (const args of [['rm', '-f', NAMES.rest, NAMES.db], ['network', 'rm', NAMES.net]]) {
    try { docker(args); } catch (_) { /* not there */ }
  }
}

const composeEnv = () => ({
  ...process.env,
  N8N_ENCRYPTION_KEY: 'e2e-test-encryption-key',
  NEXT_PUBLIC_SUPABASE_URL: `http://host.docker.internal:${PORTS.proxy}`,
  SUPABASE_SERVICE_ROLE_KEY: KEYS.service,
  GENERIC_TIMEZONE: 'UTC',
});

// ── infrastructure ──────────────────────────────────────────────────────────
function startDatabase() {
  cleanDockerOnly();
  docker(['network', 'create', NAMES.net]);
  docker(['run', '-d', '--name', NAMES.db, '--network', NAMES.net, '-e', 'POSTGRES_PASSWORD=pw', 'postgres:16-alpine']);
}
async function waitForDatabase() {
  // The image starts a temporary server, stops it and starts the real one: require two good answers in a row.
  let good = 0;
  await until('postgres', async () => {
    const ok = spawnSync('docker', ['exec', NAMES.db, 'psql', '-U', 'postgres', '-tAc', 'select 1'], { encoding: 'utf8' }).stdout.trim() === '1';
    good = ok ? good + 1 : 0;
    return good >= 2;
  }, { timeoutMs: 60000, intervalMs: 2000 });
}
function psql(sql) {
  return docker(['exec', '-i', NAMES.db, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql });
}
function initDatabase() {
  psql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE ROLE authenticator LOGIN PASSWORD 'pw' NOINHERIT; GRANT anon, authenticated, service_role TO authenticator;
        CREATE PUBLICATION supabase_realtime;`);
  psql(fs.readFileSync(path.join(ROOT, 'n8n', 'supabase-schema.sql'), 'utf8'));
}
async function startPostgrest() {
  docker(['run', '-d', '--name', NAMES.rest, '--network', NAMES.net, '-p', `${PORTS.rest}:3000`,
    '-e', `PGRST_DB_URI=postgres://authenticator:pw@${NAMES.db}:5432/postgres`, '-e', 'PGRST_DB_SCHEMAS=public',
    '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${SECRET}`, POSTGREST_IMAGE]);
  // PostgREST answers HTTP before its schema cache is loaded (503 PGRST002): wait until the tables are known.
  await until('postgrest schema cache', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${PORTS.rest}/`);
      if (res.status !== 200) return false;
      const spec = await res.json();
      return !!(spec.paths && '/listings' in spec.paths && '/applications' in spec.paths);
    } catch (_) { return false; }
  }, { timeoutMs: 60000, intervalMs: 700 });
}

/** What Supabase's gateway does: /rest/v1/* -> PostgREST, plus CORS. Bound to all interfaces so n8n's container can reach it. */
function startProxy() {
  const server = http.createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Expose-Headers': 'Content-Range,Content-Profile',
    };
    proxyLog.push(`arrived ${req.method} ${req.url.slice(0, 60)} (${req.headers['content-length'] || '?'} bytes)`);
    if (req.method === 'OPTIONS') { proxyLog.push(`OPTIONS ${req.url.slice(0, 70)} origin=${req.headers.origin || '-'} -> 204`); res.writeHead(204, cors); res.end(); return; }
    if (!req.url.startsWith('/rest/v1')) { proxyLog.push(`${req.method} ${req.url.slice(0, 70)} -> 404`); res.writeHead(404, cors); res.end('not found'); return; }
    const upstream = http.request({
      host: '127.0.0.1', port: PORTS.rest, method: req.method, path: req.url.replace(/^\/rest\/v1/, '') || '/',
      headers: { ...req.headers, host: `127.0.0.1:${PORTS.rest}` },
    }, (up) => { proxyLog.push(`${req.method} ${req.url.slice(0, 70)} origin=${req.headers.origin || '-'} -> ${up.statusCode}`); const upstreamHeaders = Object.fromEntries(Object.entries(up.headers).filter(([k]) => !k.toLowerCase().startsWith('access-control-'))); // PostgREST sends its own CORS headers; a second Allow-Origin makes browsers reject the response
      res.writeHead(up.statusCode, { ...upstreamHeaders, ...cors }); up.pipe(res); });
    upstream.on('error', (e) => { res.writeHead(502, cors); res.end(String(e)); });
    req.pipe(upstream);
  });
  return new Promise((resolve) => server.listen(PORTS.proxy, '0.0.0.0', () => resolve(server)));
}

function startApplyServer(env) {
  const output = [];
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.stdout.on('data', d => output.push(String(d)));
  child.stderr.on('data', d => output.push(String(d)));
  return { child, output };
}
async function waitForApplyServer() {
  await until('apply server', async () => { try { return (await fetch(`http://127.0.0.1:${PORTS.server}/health`)).ok; } catch (_) { return false; } }, { timeoutMs: 30000, intervalMs: 300 });
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const { useTestProfile } = require('../tests/helpers/testProfile');
  const { serveFixtures } = require('../tests/helpers/browser');
  const { chromium } = require('playwright');
  const profile = useTestProfile();   // sets SCOUT_PROFILE_PATH: the real profile.json is never read

  const blank = Object.fromEntries(['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_DEPLOYMENT', 'LLM_PROVIDER', 'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL', 'HOST', 'PROFILE_JSON'].map(k => [k, '']));
  const serverEnv = {
    ...process.env, ...blank,
    PORT: String(PORTS.server), HEADLESS: 'true', NODE_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: PROXY_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: KEYS.anon, SUPABASE_SERVICE_ROLE_KEY: KEYS.service,
    DASHBOARD_ORIGIN: `http://localhost:${PORTS.dashboard}`, QUEUE_POLL_MS: '2000', SCOUT_PROFILE_PATH: profile.profilePath,
  };

  let proxy; let fixtures; let browser; let server; let dashboard;
  const failShots = path.join(os.tmpdir(), 'scout-e2e-failures');

  try {
   run: {
    phase('1. Infrastructure: Postgres + schema + PostgREST + gateway proxy');
    startDatabase(); await waitForDatabase(); initDatabase(); await startPostgrest(); proxy = await startProxy();
    const root = await rest('/');
    check('PostgREST answers through the /rest/v1 proxy with the real schema', root.status === 200 && root.json && root.json.paths && '/listings' in root.json.paths && '/applications' in root.json.paths, root.text.slice(0, 120));

    phase('1b. Probe: a bulk upsert shaped like n8n sends it, from this machine and from inside a container');
    const probeRows = Array.from({ length: 40 }, (_, i) => ({ title: `Probe ${i}`, company: 'Probe Co', source: 'probe', apply_url: `https://probe.example/${i}`, canonical_url: `https://probe.example/${i}`, description: 'x'.repeat(300) }));
    const probeHeaders = { apikey: KEYS.service, Authorization: `Bearer ${KEYS.service}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' };
    const localProbe = await fetch(`${PROXY_URL}/rest/v1/listings?on_conflict=canonical_url`, { method: 'POST', headers: probeHeaders, body: JSON.stringify(probeRows) });
    check('a bulk upsert (on_conflict + ignore-duplicates) works from this machine', localProbe.status === 201, `${localProbe.status} ${await localProbe.text()}`);
    const containerCode = "fetch(process.env.PROBE_URL,{method:'POST',headers:JSON.parse(process.env.PROBE_HEADERS),body:process.env.PROBE_BODY,signal:AbortSignal.timeout(15000)}).then(r=>console.log('STATUS',r.status)).catch(e=>console.log('ERR',e.name,e.message))";
    const inContainer = await dockerOutput(['run', '--rm', '--entrypoint', 'node',
      '-e', `PROBE_URL=http://host.docker.internal:${PORTS.proxy}/rest/v1/listings?on_conflict=canonical_url`,
      '-e', `PROBE_HEADERS=${JSON.stringify(probeHeaders)}`, '-e', `PROBE_BODY=${JSON.stringify(probeRows.slice(0, 20).map(r => ({ ...r, canonical_url: r.canonical_url + '/c' })))}`,
      'docker.n8n.io/n8nio/n8n:2.46.6', '-e', containerCode]);
    check('the same bulk upsert works from inside a container', /STATUS 201/.test(inContainer), inContainer.trim().slice(0, 300) + '\n' + dumpProxyLog(6));
    await rest("/listings?source=eq.probe", { method: 'DELETE' });

    if (process.env.E2E_SKIP_N8N !== '1') {
    phase('2. Discovery: the real n8n workflow against the live job APIs');
    docker(['compose', '-p', NAMES.compose, 'up', 'n8n-import'], { cwd: ROOT, env: composeEnv() });
    // n8n prints every job it processed (megabytes); that dump can arrive truncated, so its closing
    // "status" line is not a reliable signal. The exit code is, and the saved data is checked below.
    const run1 = await dockerRun(['compose', '-p', NAMES.compose, 'run', '--rm', '--no-deps', '-T', 'n8n', 'execute', '--id=scout-job-discovery'], { cwd: ROOT, env: composeEnv() });
    const n8nFailedStatus = /"status":\s*"(error|crashed|canceled)"/.test(run1.output);
    check('the n8n workflow executed successfully (exit code 0, no error status)', run1.code === 0 && !n8nFailedStatus,
      `exit ${run1.code}; ${run1.output.length} chars of output; ${run1.output.split('\n').filter(l => /error/i.test(l) && l.length < 300).slice(0, 4).join(' | ')}`);
    const listings1 = (await rest('/listings?select=title,company,source,apply_url,canonical_url,is_internship,posted_date&limit=1000')).json || [];
    check('jobs were discovered and saved to listings', listings1.length >= 5, `found ${listings1.length}`);
    check('every saved listing has the required fields and an http(s) link', listings1.length > 0 && listings1.every(l => l.title && l.company && /^https?:\/\//.test(l.apply_url) && /^https?:\/\//.test(l.canonical_url)));
    check('listings come from the expected sources', listings1.length > 0 && listings1.every(l => ['Himalayas', 'Arbeitnow', 'RemoteOK'].includes(l.source)), [...new Set(listings1.map(l => l.source))].join(','));
    console.log(`        (${listings1.length} listings; sources: ${[...new Set(listings1.map(l => l.source))].join(', ')})`);
    await dockerOutput(['compose', '-p', NAMES.compose, 'run', '--rm', '--no-deps', '-T', 'n8n', 'execute', '--id=scout-job-discovery'], { cwd: ROOT, env: composeEnv() });
    const listings2 = (await rest('/listings?select=canonical_url&limit=1000')).json || [];
    check('running discovery again creates no duplicates', new Set(listings2.map(l => l.canonical_url)).size === listings2.length && listings2.length >= listings1.length, `${listings1.length} -> ${listings2.length}`);

    }

    if (Number(process.env.E2E_STOP_AFTER) === 2) break run;

    phase('3. Seed scenario listings and start the apply server');
    fixtures = await serveFixtures();
    const seed = await rest('/listings', { method: 'POST', prefer: 'return=representation', body: [
      { title: 'E2E Backend Engineer', company: 'Fixture Co', source: 'e2e', location: 'Remote', apply_url: `${fixtures.base}/greenhouse.html`, canonical_url: `${fixtures.base}/greenhouse.html`, is_internship: false },
      { title: 'E2E Broken Link Engineer', company: 'Broken Co', source: 'e2e', location: 'Remote', apply_url: 'http://127.0.0.1:9/nope', canonical_url: 'http://127.0.0.1:9/nope', is_internship: false },
      { title: 'E2E Crash Recovery Engineer', company: 'Crashed Co', source: 'e2e', location: 'Remote', apply_url: `${fixtures.base}/lever.html`, canonical_url: `${fixtures.base}/lever.html`, is_internship: false },
    ] });
    check('scenario listings were created', seed.status === 201 && seed.json.length === 3, seed.text.slice(0, 120));
    const L = Object.fromEntries(seed.json.map(r => [r.company, r.id]));

    ({ child: server } = startApplyServer(serverEnv)); await waitForApplyServer();
    check('the apply server started against the database', true);

    phase('4. Dashboard: build against the throwaway backend and open it in a browser');
    const dashEnv = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: PROXY_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: KEYS.anon, NEXT_PUBLIC_LOCAL_API: `http://localhost:${PORTS.server}`, NEXT_PUBLIC_DEMO: '' };
    const nextBin = path.join(DASH, 'node_modules', 'next', 'dist', 'bin', 'next');
    await new Promise((resolve, reject) => {
      const b = spawn(process.execPath, [nextBin, 'build'], { cwd: DASH, env: dashEnv });
      let out = '';
      b.stdout.on('data', d => { out += d; }); b.stderr.on('data', d => { out += d; });
      b.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`dashboard build failed:\n${out.slice(-800)}`))));
    });
    dashboard = spawn(process.execPath, [nextBin, 'start', '-p', String(PORTS.dashboard)], { cwd: DASH, env: dashEnv, stdio: 'ignore' });
    children.push(dashboard);
    await until('dashboard', async () => { try { return (await fetch(`http://localhost:${PORTS.dashboard}/`)).ok; } catch (_) { return false; } }, { timeoutMs: 40000, intervalMs: 500 });

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(20000);
    const browserProblems = [];
    page.on('requestfailed', r => browserProblems.push(`request failed: ${r.url().slice(0, 90)} (${r.failure() && r.failure().errorText})`));
    page.on('console', m => { if (m.type() === 'error') browserProblems.push(`console: ${m.text().slice(0, 900)}`); });
    const dashUrl = `http://localhost:${PORTS.dashboard}/`;
    const card = (company) => page.locator('.card', { has: page.locator('.card-company', { hasText: company }) });
    const shot = async (name) => { fs.mkdirSync(failShots, { recursive: true }); await page.screenshot({ path: path.join(failShots, `${name}.png`) }).catch(() => {}); };

    await page.goto(dashUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const jobCards = await page.locator('.card-company').count();
    check('the dashboard lists the discovered jobs', jobCards >= 5, `${jobCards} job cards`);
    check('the scenario listing appears on the board', (await card('Fixture Co').count()) === 1, browserProblems.slice(0, 4).join('\n') + '\n' + dumpProxyLog(12));
    const health = await page.evaluate((u) => fetch(`${u}/health`).then(r => r.json()).catch(e => ({ error: String(e) })), `http://localhost:${PORTS.server}`);
    check('the dashboard origin may call the apply server (CORS)', health.status === 'ok', JSON.stringify(health));

    if (Number(process.env.E2E_STOP_AFTER) === 4) break run;

    phase('5. Apply: click Auto-fill, the server picks it up and fills the form');
    const clickedAt = new Date().toISOString();
    try {
      await card('Fixture Co').getByRole('button', { name: /Auto-fill/ }).click();
      check('Auto-fill was clicked in the dashboard', true);
    } catch (e) {
      await shot('autofill-click');
      check('Auto-fill was clicked in the dashboard', false, e.message);
      await rest('/applications', { role: 'anon', method: 'POST', body: { listing_id: L['Fixture Co'], status: 'pending_application', status_updated_at: new Date().toISOString() } });
    }
    const DONE = ['autofill_completed', 'awaiting_review', 'failed'];
    const app1 = await until('the first application to finish', async () => {
      const r = (await rest(`/applications?listing_id=eq.${L['Fixture Co']}&select=*`)).json;
      return r && r[0] && DONE.includes(r[0].status) && r[0].status_updated_at > clickedAt ? r[0] : null;
    }, { timeoutMs: 90000, intervalMs: 1000 });
    check('the application reached autofill_completed', app1.status === 'autofill_completed', `${app1.status}: ${app1.error_message || ''}`);
    check('the platform was detected from the page', app1.ats_platform === 'greenhouse', app1.ats_platform);
    check('the counts are stored as integers (6 filled: names, email, phone, LinkedIn, resume)', app1.fields_filled === 6 && Number.isInteger(app1.fields_detected), JSON.stringify({ filled: app1.fields_filled, detected: app1.fields_detected }));
    const rep = app1.fill_report || {};
    const skipped = (rep.details && rep.details.skipped) || [];
    const why = skipped.find(s => /Why do you want to work at Acme/.test(s.label || ''));
    check('the report lists the free-text question as skipped with a signature', !!why && !!why.signature, JSON.stringify(skipped.map(s => s.label)));
    check('protected and legal fields were skipped and not teachable', skipped.some(s => /Gender/.test(s.label) && s.signature === '') && skipped.some(s => /sponsorship/i.test(s.label) && s.signature === ''), JSON.stringify(skipped.map(s => [s.label, s.signature])));

    phase('6. Review in the dashboard, then teach Scout the skipped field');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.card-company').first().waitFor();
    await card('Fixture Co').locator('.card-hit').click();
    await page.locator('.drawer').waitFor();
    const drawerText = await page.locator('.drawer').innerText();
    check('the drawer shows the fill report', /Why do you want to work at Acme/.test(drawerText) && /fields filled/i.test(drawerText), drawerText.slice(0, 120));
    try {
      const select = page.locator('.drawer select').first();
      await select.selectOption('links.github').catch(() => select.selectOption({ label: 'GitHub' }));
      await page.locator('.drawer').getByRole('button', { name: /Teach Scout/ }).first().click();
      const learned = await until('the learned mapping', async () => {
        const m = (await rest('/field_mappings?select=*')).json;
        return Array.isArray(m) && m.find(x => x.meaning === 'links.github') || null;
      }, { timeoutMs: 15000 });
      check('Teach Scout saved the mapping through the apply server (platform + signature)', learned.platform === 'greenhouse' && learned.field_signature === why.signature, JSON.stringify(learned));
    } catch (e) {
      await shot('teach');
      check('Teach Scout saved the mapping through the apply server (platform + signature)', false, e.message);
    }

    phase('7. Learning loop: queue it again, Scout now fills the field from what it learned');
    const requeuedAt = new Date().toISOString();
    const requeue = await rest(`/applications?id=eq.${app1.id}`, { role: 'anon', method: 'PATCH', prefer: 'return=representation', body: { status: 'pending_application', status_updated_at: requeuedAt } });
    check('the browser key may re-queue a finished application', requeue.status === 200 && requeue.json.length === 1, requeue.text.slice(0, 100));
    const app2 = await until('the re-run to finish', async () => {
      const r = (await rest(`/applications?id=eq.${app1.id}&select=*`)).json;
      return r && r[0] && DONE.includes(r[0].status) && r[0].status_updated_at > requeuedAt ? r[0] : null;
    }, { timeoutMs: 90000, intervalMs: 1000 });
    const learnedFill = ((app2.fill_report && app2.fill_report.details && app2.fill_report.details.filled) || []).find(f => /Why do you want to work at Acme/.test(f.label || ''));
    check('the taught field is now filled from the learned mapping (stage 0)', !!learnedFill && learnedFill.value === 'https://github.com/test-candidate' && learnedFill.stage === 0, JSON.stringify(learnedFill));
    check('the report now shows one more filled field', app2.fields_filled === 7, app2.fields_filled);

    phase('8. Mark as submitted from the dashboard');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.card-company').first().waitFor();
    try {
      await card('Fixture Co').getByRole('button', { name: /Mark submitted/ }).click();
      const submitted = await until('status submitted', async () => {
        const r = (await rest(`/applications?id=eq.${app1.id}&select=status`)).json;
        return r && r[0] && r[0].status === 'submitted';
      }, { timeoutMs: 15000 });
      check('Mark submitted updates the database from the browser key', submitted);
    } catch (e) {
      await shot('mark-submitted');
      check('Mark submitted updates the database from the browser key', false, e.message);
    }

    phase('9. Failure handling: an unreachable apply link');
    const failQueuedAt = new Date().toISOString();
    await rest('/applications', { role: 'anon', method: 'POST', body: { listing_id: L['Broken Co'], status: 'pending_application', status_updated_at: failQueuedAt } });
    const failed = await until('the broken application to fail', async () => {
      const r = (await rest(`/applications?listing_id=eq.${L['Broken Co']}&select=*`)).json;
      return r && r[0] && r[0].status === 'failed' ? r[0] : null;
    }, { timeoutMs: 90000, intervalMs: 1000 });
    check('an unreachable page marks the application failed with a reason', !!failed.error_message && !!failed.completed_at, failed.error_message);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.card-company').first().waitFor();
    check('the dashboard offers Retry for it', (await card('Broken Co').getByRole('button', { name: /Retry/ }).count()) === 1);

    phase('10. Crash recovery: an application left running when the server dies');
    await rest('/applications', { method: 'POST', body: { listing_id: L['Crashed Co'], status: 'applying', status_updated_at: new Date().toISOString() } });
    killTree(server); await sleep(800);
    ({ child: server } = startApplyServer(serverEnv)); await waitForApplyServer();
    const recovered = await until('the interrupted application to be marked failed', async () => {
      const r = (await rest(`/applications?listing_id=eq.${L['Crashed Co']}&select=*`)).json;
      return r && r[0] && r[0].status === 'failed' ? r[0] : null;
    }, { timeoutMs: 30000, intervalMs: 700 });
    check('on restart an interrupted application is marked failed (so Retry appears)', /Interrupted/.test(recovered.error_message || ''), recovered.error_message);

    phase('11. What the browser key must not be able to do');
    const forgeListing = await rest('/listings', { role: 'anon', method: 'POST', body: { title: 'x', company: 'y', source: 'z', apply_url: 'https://x.com', canonical_url: 'https://x.com' } });
    check('cannot create listings', forgeListing.status >= 400, forgeListing.status);
    const forgeReport = await rest(`/applications?id=eq.${app1.id}`, { role: 'anon', method: 'PATCH', body: { fill_report: { total: 999 } } });
    check('cannot overwrite the fill report', forgeReport.status >= 400, forgeReport.status);
    const forgeStatus = await rest(`/applications?id=eq.${app1.id}`, { role: 'anon', method: 'PATCH', body: { status: 'autofill_completed' } });
    check('cannot forge a pipeline status', forgeStatus.status >= 400, forgeStatus.status);
    const readOk = await rest('/applications?select=id&limit=1', { role: 'anon' });
    check('can read applications (what the dashboard needs)', readOk.status === 200);
   }
  } catch (error) {
    check(`the run completed without an unexpected error`, false, error.stack || error.message);
  } finally {
    phase('Cleanup');
    try { if (browser) await browser.close(); } catch (_) { /* ignore */ }
    for (const c of children) killTree(c);
    try { if (proxy) await new Promise(r => proxy.close(r)); } catch (_) { /* ignore */ }
    try { if (fixtures) await fixtures.close(); } catch (_) { /* ignore */ }
    try { docker(['compose', '-p', NAMES.compose, 'down', '-v'], { cwd: ROOT, env: composeEnv() }); } catch (_) { /* ignore */ }
    cleanDockerOnly();
    console.log('throwaway containers, volumes, processes and servers removed');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '));
    console.log(`(screenshots of UI failures, if any: ${failShots})`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('E2E harness crashed:', e); process.exit(1); });
