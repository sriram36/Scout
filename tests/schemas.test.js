'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyBodySchema, correctionBodySchema, validateBody } = require('../src/api/schemas');

test('apply: missing url fails', () => {
  assert.equal(applyBodySchema.safeParse({}).success, false);
});

test('apply: non-http(s) urls fail', () => {
  assert.equal(applyBodySchema.safeParse({ url: 'javascript:alert(1)' }).success, false);
  assert.equal(applyBodySchema.safeParse({ url: 'file:///etc/passwd' }).success, false);
  assert.equal(applyBodySchema.safeParse({ url: 'not a url' }).success, false);
});

test('apply: minimal valid body gets empty-string defaults', () => {
  const r = applyBodySchema.safeParse({ url: 'https://boards.greenhouse.io/x' });
  assert.equal(r.success, true);
  assert.equal(r.data.title, '');
  assert.equal(r.data.company, '');
  assert.equal(r.data.description, '');
});

test('apply: empty jobId is rejected', () => {
  assert.equal(applyBodySchema.safeParse({ url: 'https://a.com', jobId: '' }).success, false);
});

test('correction: confidence above 1 is rejected', () => {
  const r = correctionBodySchema.safeParse({ fieldSignature: 'sig', meaning: 'personal.email', confidence: 1.5 });
  assert.equal(r.success, false);
});

test('correction: platform defaults to generic and confidence to 1', () => {
  const r = correctionBodySchema.safeParse({ fieldSignature: 'sig', meaning: 'personal.email' });
  assert.equal(r.success, true);
  assert.equal(r.data.platform, 'generic');
  assert.equal(r.data.confidence, 1);
});

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('validateBody responds 400 with issue paths on failure and does not call next', () => {
  const req = { body: { url: 'file:///x' } };
  const res = fakeRes();
  let nexted = false;
  validateBody(applyBodySchema)(req, res, () => { nexted = true; });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Invalid request');
  assert.ok(res.body.issues.some(i => i.path === 'url'));
  assert.equal(nexted, false);
});

test('validateBody replaces req.body with the parsed value and calls next', () => {
  const req = { body: { url: 'https://a.com/job' } };
  const res = fakeRes();
  let nexted = false;
  validateBody(applyBodySchema)(req, res, () => { nexted = true; });
  assert.equal(nexted, true);
  assert.equal(req.body.title, '');
  assert.equal(res.statusCode, null);
});

test('validateBody treats a missing body as an empty object', () => {
  const req = {};
  const res = fakeRes();
  validateBody(applyBodySchema)(req, res, () => {});
  assert.equal(res.statusCode, 400);
});

test('apply: jobId must be a uuid (application ids are uuids)', () => {
  assert.equal(applyBodySchema.safeParse({ url: 'https://a.com', jobId: 'abc' }).success, false);
  assert.equal(applyBodySchema.safeParse({ url: 'https://a.com', jobId: '3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b' }).success, true);
});

test('correction: fieldSignature is capped at 500 characters', () => {
  const ok = correctionBodySchema.safeParse({ fieldSignature: 'a'.repeat(500), meaning: 'personal.email' });
  const tooLong = correctionBodySchema.safeParse({ fieldSignature: 'a'.repeat(501), meaning: 'personal.email' });
  assert.equal(ok.success, true);
  assert.equal(tooLong.success, false);
});
