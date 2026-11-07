'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FALLBACK_MEANINGS, buildCorrectionPayload, teachableSkipped, meaningLabel, describeCorrectionError,
} = require('../dashboard/src/lib/corrections');

test('the fallback meaning list mirrors the classifier vocabulary, without "unknown"', () => {
  assert.ok(FALLBACK_MEANINGS.includes('personal.email'));
  assert.ok(FALLBACK_MEANINGS.includes('links.github'));
  assert.ok(FALLBACK_MEANINGS.includes('education.university'));
  assert.ok(!FALLBACK_MEANINGS.includes('unknown'));
  assert.equal(new Set(FALLBACK_MEANINGS).size, FALLBACK_MEANINGS.length);
});

test('buildCorrectionPayload builds the POST /corrections body', () => {
  assert.deepEqual(
    buildCorrectionPayload({ platform: 'greenhouse', signature: 'input|text|github profile', meaning: 'links.github', applyUrl: 'https://boards.greenhouse.io/x/jobs/1' }),
    { platform: 'greenhouse', fieldSignature: 'input|text|github profile', meaning: 'links.github', confidence: 1, domain: 'boards.greenhouse.io' },
  );
});

test('buildCorrectionPayload defaults the platform to generic and omits an unparseable domain', () => {
  const p = buildCorrectionPayload({ platform: null, signature: 'sig', meaning: 'personal.email', applyUrl: 'not a url', confidence: 0.8 });
  assert.deepEqual(p, { platform: 'generic', fieldSignature: 'sig', meaning: 'personal.email', confidence: 0.8 });
});

test('buildCorrectionPayload clamps confidence into 0..1', () => {
  assert.equal(buildCorrectionPayload({ signature: 's', meaning: 'm', confidence: 4 }).confidence, 1);
  assert.equal(buildCorrectionPayload({ signature: 's', meaning: 'm', confidence: -1 }).confidence, 0);
});

test('buildCorrectionPayload rejects a missing signature or meaning', () => {
  assert.throws(() => buildCorrectionPayload({ signature: '', meaning: 'personal.email' }), /signature/i);
  assert.throws(() => buildCorrectionPayload({ signature: 'sig', meaning: '' }), /meaning/i);
});

test('teachableSkipped keeps only skipped entries that carry a signature', () => {
  const report = { details: { skipped: [
    { field: 'q_123', label: 'GitHub', signature: 'sig-1', meaning: 'unknown', reason: 'Low confidence' },
    { field: 'gender', meaning: 'protected', reason: 'Protected field' },
  ] } };
  assert.deepEqual(teachableSkipped(report).map(s => s.signature), ['sig-1']);
  assert.deepEqual(teachableSkipped({}), []);
  assert.deepEqual(teachableSkipped(null), []);
});

test('meaningLabel turns a dot-path into readable text', () => {
  assert.equal(meaningLabel('education.graduationYear'), 'Education: graduation year');
  assert.equal(meaningLabel('links.github'), 'Links: GitHub');
  assert.equal(meaningLabel('experience.current.company'), 'Experience: current company');
  assert.equal(meaningLabel('resume'), 'Resume');
});

test('describeCorrectionError explains validation issues from the server', () => {
  assert.equal(
    describeCorrectionError(400, { error: 'Invalid request', issues: [{ path: 'meaning', message: 'Required' }] }),
    'Invalid request: meaning: Required',
  );
  assert.equal(describeCorrectionError(500, { error: 'db down' }), 'db down');
  assert.equal(describeCorrectionError(502, null), 'The apply server answered with HTTP 502.');
});
