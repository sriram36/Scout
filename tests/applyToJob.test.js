'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApplier } = require('../src/pipeline/applyToJob');

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const JOB = { url: 'https://boards.greenhouse.io/acme/jobs/1', jobId: '3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b', title: 'Engineer', company: 'Acme', description: 'x' };

function harness({ headless = true, fillResult, launchError, fillError } = {}) {
  const calls = { updates: [], closed: 0, launched: 0 };
  const page = {
    setDefaultTimeout: async () => {},
    goto: async () => {},
    url: () => JOB.url,
    screenshot: async () => Buffer.from('png-bytes'),
  };
  const browser = { newPage: async () => page, close: async () => { calls.closed++; } };
  const apply = createApplier({
    launchBrowser: async () => { calls.launched++; if (launchError) throw launchError; return browser; },
    followApplyLink: async (p) => ({ page: p, hops: 0 }),   // these tests use a fake page with no DOM
    detectATS: async () => 'greenhouse',
    getAdapter: () => ({ fill: async () => { if (fillError) throw fillError; return fillResult; } }),
    updateApplication: async (id, update) => { calls.updates.push({ id, update }); },
    isHeadless: headless,
    log: silent,
  });
  return { apply, calls };
}

const GOOD = {
  filled: [{ field: 'a' }], skipped: [], errors: [],
  report: { total: 2, filled: 2, skipped: 0, errors: 0, aiGenerated: 0, stageBreakdown: { learned: 0, deterministic: 2, semantic: 0, llm: 0 }, details: { filled: [], skipped: [], errors: [] } },
};

test('headless: returns the report and a PNG screenshot, records progress, closes the browser', async () => {
  const { apply, calls } = harness({ headless: true, fillResult: GOOD });
  const out = await apply(JOB);

  assert.equal(out.platform, 'greenhouse');
  assert.equal(out.status, 'autofill_completed');
  assert.match(out.screenshot, /^data:image\/png;base64,/);
  assert.equal(out.report.filled, 2);
  assert.deepEqual(calls.updates.map(u => u.update.status), ['application_opened', 'form_analyzed', 'autofill_completed']);
  assert.ok(calls.updates.every(u => u.id === JOB.jobId));
  assert.equal(calls.closed, 1);
});

test('headed: the browser stays open for the human review and there is no screenshot', async () => {
  const { apply, calls } = harness({ headless: false, fillResult: GOOD });
  const out = await apply(JOB);
  assert.equal(out.screenshot, null);
  assert.equal(out.status, 'awaiting_review');
  assert.match(out.note, /Browser is open/);
  assert.equal(calls.closed, 0);
});

test('an adapter note is returned and moves the application to awaiting_review', async () => {
  const { apply, calls } = harness({ headless: true, fillResult: { ...GOOD, note: 'Stopped at the "Review" step' } });
  const out = await apply(JOB);
  assert.equal(out.status, 'awaiting_review');
  assert.equal(out.note, 'Stopped at the "Review" step');
  assert.equal(calls.updates.at(-1).update.status, 'awaiting_review');
});

test('without a jobId nothing is written to the database', async () => {
  const { apply, calls } = harness({ fillResult: GOOD });
  await apply({ ...JOB, jobId: undefined });
  assert.equal(calls.updates.length, 0);
});

test('a failure marks the application failed, closes the browser and rethrows', async () => {
  const { apply, calls } = harness({ fillError: new Error('page crashed') });
  await assert.rejects(apply(JOB), /page crashed/);
  const last = calls.updates.at(-1).update;
  assert.equal(last.status, 'failed');
  assert.equal(last.error_message, 'page crashed');
  assert.ok(last.completed_at);
  assert.equal(calls.closed, 1);
});

test('a browser that cannot start is a failure, not a crash', async () => {
  const { apply, calls } = harness({ launchError: new Error('no chromium') });
  await assert.rejects(apply(JOB), /no chromium/);
  assert.equal(calls.updates.at(-1).update.status, 'failed');
});

test('the form the Apply control leads to is what gets detected and filled', async () => {
  const calls = { detected: null, filledPage: null };
  const listingPage = { setDefaultTimeout: async () => {}, goto: async () => {}, url: () => 'https://board.example/job/1' };
  const formPage = { url: () => 'https://boards.greenhouse.io/acme/jobs/1', screenshot: async () => Buffer.from('png') };
  const browser = { newPage: async () => listingPage, close: async () => {} };
  const apply = createApplier({
    launchBrowser: async () => browser,
    followApplyLink: async (page) => ({ page: formPage, hops: 1 }),
    detectATS: async (url, page) => { calls.detected = { url, page }; return 'greenhouse'; },
    getAdapter: () => ({ fill: async (page) => { calls.filledPage = page; return GOOD; } }),
    updateApplication: async () => {},
    isHeadless: true,
    log: silent,
  });
  const out = await apply(JOB);
  assert.equal(calls.detected.url, 'https://boards.greenhouse.io/acme/jobs/1');
  assert.equal(calls.detected.page, formPage);
  assert.equal(calls.filledPage, formPage);
  assert.equal(out.platform, 'greenhouse');
  assert.match(out.screenshot, /^data:image\/png;base64,/, 'the screenshot is of the form, not the job board');
});
