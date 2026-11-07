'use strict';

// iCIMS (iframe), SmartRecruiters (shadow DOM) and Workday (multi-step wizard) against fixtures
// that mimic their markup conventions. Not verified against live sites.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { useTestProfile } = require('../helpers/testProfile');

const { resumePath } = useTestProfile();
const { serveFixtures, launch } = require('../helpers/browser');

const JOB = { id: 'job-1', title: 'Engineer', company: 'Acme Corp', description: 'Build things.', apply_url: 'x' };
const NO_LLM = { useLLM: false, generateAnswers: false };
const RESUME = path.basename(resumePath);

async function open(t, fixture) {
  const fixtures = await serveFixtures();
  const browser = await launch();
  t.after(async () => { await browser.close(); await fixtures.close(); });
  await browser.page.goto(`${fixtures.base}/${fixture}`);
  return browser.page;
}

// ── iCIMS ────────────────────────────────────────────────────────────────────

test('icims: finds the application iframe and fills it, leaving the host page alone', async (t) => {
  const page = await open(t, 'icims.html');
  const result = await require('../../src/adapters/icims').fill(page, JOB, NO_LLM);

  const frame = page.frameLocator('#icims_content_iframe');
  assert.equal(await frame.locator('#firstname').inputValue(), 'Test');
  assert.equal(await frame.locator('#lastname').inputValue(), 'Candidate');
  assert.equal(await frame.locator('#emailaddr').inputValue(), 'test.candidate@example.com');
  assert.equal(await frame.locator('#phonenum').inputValue(), '+1 555-0100');
  assert.deepEqual(await frame.locator('#resumefile').evaluate(el => Array.from(el.files).map(f => f.name)), [RESUME]);
  assert.equal(await frame.locator('#ethnicity').inputValue(), '', 'EEOC stays untouched');
  assert.equal(await page.inputValue('#site-search'), '', 'the host page must not be touched');
  assert.equal(await page.frame({ name: 'icims_content_iframe' }).evaluate(() => window.__submitted), false);
  assert.equal(result.report.errors, 0);
  assert.equal(result.report.filled, 5);
});

test('icims: with no iframe it falls back to the page itself', async (t) => {
  const page = await open(t, 'greenhouse.html');
  const result = await require('../../src/adapters/icims').fill(page, JOB, NO_LLM);
  assert.equal(await page.inputValue('#first_name'), 'Test');
  assert.ok(result.report.filled >= 4);
});

// ── SmartRecruiters ──────────────────────────────────────────────────────────

test('smartrecruiters: fills a shadow-DOM form, uploads the resume, leaves consent and free text', async (t) => {
  const page = await open(t, 'smartrecruiters.html');
  const result = await require('../../src/adapters/smartrecruiters').fill(page, JOB, NO_LLM);

  const inShadow = (sel, prop = 'value') => page.evaluate(([s, p]) => {
    const el = document.getElementById('app').shadowRoot.querySelector(s);
    return p === 'files' ? Array.from(el.files).map(f => f.name) : el[p];
  }, [sel, prop]);

  assert.equal(await inShadow('#sr-first'), 'Test');
  assert.equal(await inShadow('#sr-last'), 'Candidate');
  assert.equal(await inShadow('#sr-email'), 'test.candidate@example.com');
  assert.equal(await inShadow('#sr-phone'), '+1 555-0100');
  assert.deepEqual(await inShadow('#sr-cv', 'files'), [RESUME]);
  assert.equal(await inShadow('textarea'), '', 'free text stays empty');
  assert.equal(await inShadow('#sr-consent', 'checked'), false, 'consent boxes are never ticked');
  assert.equal(await page.evaluate(() => window.__submitted), false);
  assert.equal(result.report.errors, 0);
});

// ── Workday ──────────────────────────────────────────────────────────────────

test('workday: fills each step, advances with Save and Continue, and stops before Submit', async (t) => {
  const page = await open(t, 'workday.html');
  const result = await require('../../src/adapters/workday').fill(page, JOB, NO_LLM);

  const snaps = await page.evaluate(() => window.__snapshots);
  assert.equal(snaps.length, 4, 'four steps were completed and advanced');
  assert.deepEqual(snaps[0], { fn: 'Test', ln: 'Candidate', em: 'test.candidate@example.com', ph: '+1 555-0100', ecfn: '' },
    "the candidate's own name must not go into the emergency-contact field");
  assert.deepEqual(snaps[1], { school: 'Test State University', li: 'https://linkedin.com/in/test-candidate', cv: RESUME });
  assert.deepEqual(snaps[2], { why: '', auth: '' }, 'free text and legal-status questions stay for the candidate');
  assert.deepEqual(snaps[3], { gender: '' });

  assert.equal(await page.evaluate(() => window.__step), 'Review');
  assert.equal(await page.evaluate(() => window.__submitClicks), 0, 'Submit must never be clicked');
  assert.equal(await page.evaluate(() => window.__submitted), false);

  assert.equal(result.report.filled, 7);
  assert.equal(result.report.errors, 0);
  assert.equal(result.steps, 5);
  assert.match(result.note, /Submit/);
});

test('workday: stops when a step is not accepted and says why, without looping', async (t) => {
  const page = await open(t, 'workday.html?blocked=1');
  const result = await require('../../src/adapters/workday').fill(page, JOB, { ...NO_LLM, stepTimeout: 800 });

  assert.equal(await page.evaluate(() => window.__step), 'Application Questions');
  assert.equal(await page.evaluate(() => window.__submitClicks), 0);
  assert.match(result.note, /did not accept|needs you/i);
  assert.equal(result.report.filled, 7);
});

test('workday: a sign-in wall is left to the candidate and nothing is typed', async (t) => {
  const page = await open(t, 'workday-signin.html');
  const result = await require('../../src/adapters/workday').fill(page, JOB, NO_LLM);

  assert.equal(await page.inputValue('#user'), '');
  assert.equal(await page.evaluate(() => window.__signInClicks), 0);
  assert.equal(result.report, null);
  assert.deepEqual(result.filled, []);
  assert.match(result.note, /sign in/i);
});

test('workday: a button label that lags the step never causes a click on Review/Submit', async (t) => {
  const page = await open(t, 'workday.html?lag=400');
  const result = await require('../../src/adapters/workday').fill(page, JOB, NO_LLM);

  assert.equal(await page.evaluate(() => window.__step), 'Review');
  assert.equal(await page.evaluate(() => window.__submitClicks), 0, 'Submit must never be clicked, even while the label is stale');
  assert.equal(await page.evaluate(() => window.__submitted), false);
  assert.match(result.note, /review|submit/i);
  assert.equal(result.report.errors, 0);
});

// ── iCIMS: frame choice and login steps ──────────────────────────────────────

test('icims: prefers the application iframe over a third-party widget iframe', async (t) => {
  const page = await open(t, 'icims-with-chat.html');
  await require('../../src/adapters/icims').fill(page, JOB, NO_LLM);

  const form = page.frameLocator('#icims_content_iframe');
  assert.equal(await form.locator('#emailaddr').inputValue(), 'test.candidate@example.com');
  assert.equal(await page.frameLocator('#support-chat').locator('#chat-email').inputValue(), '', 'the chat widget must not be filled');
});

test('icims: a login step is left to the candidate and nothing is typed', async (t) => {
  const page = await open(t, 'icims-login.html');
  const result = await require('../../src/adapters/icims').fill(page, JOB, NO_LLM);

  const frame = page.frameLocator('#icims_content_iframe');
  assert.equal(await frame.locator('#loginemail').inputValue(), '');
  assert.equal(await page.frame({ name: 'icims_content_iframe' }).evaluate(() => window.__loginClicks), 0);
  assert.equal(result.report, null);
  assert.match(result.note, /sign in/i);
});
