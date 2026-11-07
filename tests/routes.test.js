'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRouter } = require('../src/api/routes');

const PROFILE = {
  personal: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '+1 555', location: 'Austin' },
  links: { github: 'https://github.com/jane' },
  education: { university: 'State U' },
  skills: { languages: ['JS'] },
  preferences: { preferredRoles: ['SWE'] },
  resume: { defaultPath: '/secret/path/resume.pdf' },
};

async function withServer(overrides, fn) {
  const calls = [];
  const router = createRouter({
    getProfile: () => PROFILE,
    isHeadless: true,
    upsertFieldMapping: async (m) => { calls.push(m); },
    ...overrides,
  });
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, calls); } finally { await new Promise(r => server.close(r)); }
}

const post = (base, path, body) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('GET /health reports ok and the headless flag', () => withServer({}, async (base) => {
  const res = await fetch(base + '/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.headless, true);
}));

test('GET /profile returns a safe subset: no email, phone or resume path', () => withServer({}, async (base) => {
  const body = await (await fetch(base + '/profile')).json();
  assert.equal(body.name, 'Jane Doe');
  assert.equal(body.location, 'Austin');
  const text = JSON.stringify(body);
  assert.ok(!text.includes('jane@example.com'));
  assert.ok(!text.includes('+1 555'));
  assert.ok(!text.includes('/secret/path'));
}));

test('GET /meanings lists the field meanings a correction may use, without "unknown"', () => withServer({}, async (base) => {
  const res = await fetch(base + '/meanings');
  assert.equal(res.status, 200);
  const { meanings } = await res.json();
  assert.ok(Array.isArray(meanings));
  for (const m of ['personal.email', 'links.github', 'education.university', 'experience.current.company']) {
    assert.ok(meanings.includes(m), `missing ${m}`);
  }
  assert.ok(!meanings.includes('unknown'));
  assert.ok(!meanings.includes('resume'), 'a resume is a file upload, not text a correction can supply');
}));

test('POST /corrections rejects invalid bodies with issue paths and stores nothing', () => withServer({}, async (base, calls) => {
  const res = await post(base, '/corrections', { fieldSignature: 'x', meaning: 'personal.email', confidence: 9 });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'Invalid request');
  assert.ok(body.issues.some(i => i.path === 'confidence'));
  assert.equal(calls.length, 0);
}));

test('POST /corrections stores a valid correction with defaults applied', () => withServer({}, async (base, calls) => {
  const res = await post(base, '/corrections', { fieldSignature: 'q1|question_1|why us?', meaning: 'links.github' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });
  assert.deepEqual(calls, [{
    platform: 'generic', domain: undefined, fieldSignature: 'q1|question_1|why us?', meaning: 'links.github', confidence: 1,
  }]);
}));

test('POST /corrections rejects a meaning the engine does not know', () => withServer({}, async (base, calls) => {
  const res = await post(base, '/corrections', { fieldSignature: 'x', meaning: 'personal.ssn' });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
}));

test('POST /corrections reports a storage failure as 500 with the message', () => withServer(
  { upsertFieldMapping: async () => { throw new Error('db down'); } },
  async (base) => {
    const res = await post(base, '/corrections', { fieldSignature: 'x', meaning: 'personal.email' });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, 'db down');
  }
));
