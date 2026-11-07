'use strict';

// The real server.js as a child process, driving real Chromium against a fixture form.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { useTestProfile } = require('../helpers/testProfile');

useTestProfile(); // sets SCOUT_PROFILE_PATH, inherited by the child
const { serveFixtures } = require('../helpers/browser');

const ROOT = path.join(__dirname, '..', '..');

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startServer(port) {
  // Blank every credential so a developer's real .env can never reach the test run.
  const env = {
    ...process.env,
    PORT: String(port), HEADLESS: 'true', NODE_ENV: 'test', LOG_LEVEL: 'error',
    NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
    AZURE_OPENAI_ENDPOINT: '', AZURE_OPENAI_KEY: '', AZURE_OPENAI_DEPLOYMENT: '',
    LLM_PROVIDER: '', LLM_API_KEY: '', LLM_BASE_URL: '', LLM_MODEL: '',
    DASHBOARD_ORIGIN: '', HOST: '', PROFILE_JSON: '',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${base}/health`)).ok) return { child, base, output: () => output }; } catch (_) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  child.kill();
  throw new Error(`server did not start:\n${output}`);
}

const stop = (child) => new Promise((resolve) => { child.once('exit', resolve); child.kill(); });

test('POST /apply drives a real browser through a form and returns a usable report and screenshot', async (t) => {
  const fixtures = await serveFixtures();
  const server = await startServer(await freePort());
  t.after(async () => { await stop(server.child); await fixtures.close(); });

  const res = await fetch(`${server.base}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${fixtures.base}/greenhouse.html`, title: 'Backend Engineer', company: 'Acme' }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = await res.json();

  assert.equal(body.platform, 'greenhouse', 'detected from the page markup');
  assert.equal(body.status, 'autofill_completed');
  assert.equal(body.report.filled, 6, 'first, last, email, phone, LinkedIn, resume');
  assert.equal(body.report.errors, 0);
  assert.ok(Number.isInteger(body.report.total));

  // The screenshot must be a real PNG (the original code returned garbage here).
  assert.match(body.screenshot, /^data:image\/png;base64,/);
  const bytes = Buffer.from(body.screenshot.split(',')[1], 'base64');
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('the server rejects hostile /apply bodies and exposes /meanings', async (t) => {
  const server = await startServer(await freePort());
  t.after(() => stop(server.child));

  const post = (body) => fetch(`${server.base}/apply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ url: 'file:///etc/passwd' })).status, 400);
  assert.equal((await post({ url: 'https://a.com', jobId: 'not-a-uuid' })).status, 400);

  const { meanings } = await (await fetch(`${server.base}/meanings`)).json();
  assert.ok(meanings.includes('personal.email'));
});

test('the server answers the dashboard origin only', async (t) => {
  const server = await startServer(await freePort());
  t.after(() => stop(server.child));

  const evil = await fetch(`${server.base}/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const ok = await fetch(`${server.base}/health`, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});

test('POST /apply on a job-board page follows its Apply link and fills the real form behind it', async (t) => {
  const fixtures = await serveFixtures();
  const server = await startServer(await freePort());
  t.after(async () => { await stop(server.child); await fixtures.close(); });

  const res = await fetch(`${server.base}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${fixtures.base}/agg-link.html`, title: 'Backend Engineer', company: 'Acme' }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = await res.json();
  assert.equal(body.platform, 'greenhouse', 'detected on the page the Apply link led to, not on the job board');
  assert.equal(body.report.filled, 6);
  assert.equal(body.status, 'autofill_completed');
});

test('POST /apply on a job-board page with no Apply link reports that it is not a form and types nothing', async (t) => {
  const fixtures = await serveFixtures();
  const server = await startServer(await freePort());
  t.after(async () => { await stop(server.child); await fixtures.close(); });

  const res = await fetch(`${server.base}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${fixtures.base}/newsletter.html`, title: 'Sales Engineer', company: 'Acme' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.report, null);
  assert.deepEqual(body.filled, []);
  assert.equal(body.status, 'awaiting_review');
  assert.match(body.note, /does not look like an application form/i);
});
