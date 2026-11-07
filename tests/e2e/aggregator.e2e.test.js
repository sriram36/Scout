'use strict';

// Job-board pages (RemoteOK, Arbeitnow, Himalayas, Adzuna) are not application forms: the form is behind
// an Apply control. Scout must not type into their search / location / job-alert boxes, and must follow
// the Apply control to the real form.
const test = require('node:test');
const assert = require('node:assert/strict');
const { useTestProfile } = require('../helpers/testProfile');

useTestProfile();
const { serveFixtures, launch } = require('../helpers/browser');
const generic = require('../../src/adapters/generic');
const { followApplyLink } = require('../../src/adapters/followApply');

const JOB = { id: 'j', title: 'Engineer', company: 'Acme', description: '', apply_url: 'x' };
const NO_LLM = { useLLM: false, generateAnswers: false };

async function open(t, name) {
  const fixtures = await serveFixtures();
  const browser = await launch();
  t.after(async () => { await browser.close(); await fixtures.close(); });
  await browser.page.goto(`${fixtures.base}/${name}`);
  return { page: browser.page, browser, fixtures };
}
const file = (page) => new URL(page.url()).pathname.split('/').pop();

// ── do not mistake a job board's boxes for an application ────────────────────

test('a page with only search, location and a job-alert box is not an application: nothing is typed', async (t) => {
  const { page } = await open(t, 'newsletter.html');
  const result = await generic.fill(page, JOB, NO_LLM);

  assert.equal(await page.inputValue('#alert'), '', 'the job-alert box must stay empty');
  assert.equal(await page.inputValue('#loc'), '', 'the location filter must stay empty');
  assert.equal(await page.inputValue('#q'), '');
  assert.equal(result.report, null);
  assert.deepEqual(result.filled, []);
  assert.match(result.note, /does not look like an application form/i);
});

test('a real application form is still filled', async (t) => {
  const { page } = await open(t, 'greenhouse.html');
  const result = await generic.fill(page, JOB, NO_LLM);
  assert.equal(await page.inputValue('#first_name'), 'Test');
  assert.ok(result.report.filled >= 5);
  assert.equal(result.note, undefined);
});

// ── follow the Apply control ─────────────────────────────────────────────────

test('follows an Apply link to the real form', async (t) => {
  const { page } = await open(t, 'agg-link.html');
  const out = await followApplyLink(page);
  assert.equal(out.hops, 1);
  assert.equal(out.page, page, 'same tab');
  assert.equal(file(out.page), 'greenhouse.html');
});

test('follows an Apply link that opens a new tab', async (t) => {
  const { page } = await open(t, 'agg-popup.html');
  const out = await followApplyLink(page);
  assert.equal(out.hops, 1);
  assert.notEqual(out.page, page, 'the form is in the new tab');
  assert.equal(file(out.page), 'lever.html');
});

test('follows an Apply button that navigates with a script', async (t) => {
  const { page } = await open(t, 'agg-button.html');
  const out = await followApplyLink(page);
  assert.equal(out.hops, 1);
  assert.equal(file(out.page), 'ashby.html');
});

test('a page that already is a form is left alone', async (t) => {
  const { page } = await open(t, 'greenhouse.html');
  const out = await followApplyLink(page);
  assert.equal(out.hops, 0);
  assert.equal(file(out.page), 'greenhouse.html');
});

test('a page with no Apply control stays put and nothing is typed or clicked', async (t) => {
  const { page } = await open(t, 'newsletter.html');
  const out = await followApplyLink(page);
  assert.equal(out.hops, 0);
  assert.equal(file(out.page), 'newsletter.html');
  assert.equal(await page.inputValue('#alert'), '');
});

test('follows at most two hops by default', async (t) => {
  const three = await open(t, 'agg-chain-3.html');
  const out3 = await followApplyLink(three.page);
  assert.equal(out3.hops, 2);
  assert.equal(file(out3.page), 'agg-chain-1.html', 'stopped before the form: three hops away');

  const two = await open(t, 'agg-chain-2.html');
  const out2 = await followApplyLink(two.page);
  assert.equal(out2.hops, 2);
  assert.equal(file(out2.page), 'greenhouse.html');
});

test('the hop limit can be raised', async (t) => {
  const { page } = await open(t, 'agg-chain-3.html');
  const out = await followApplyLink(page, { maxHops: 3 });
  assert.equal(out.hops, 3);
  assert.equal(file(out.page), 'greenhouse.html');
});

test('look-alike controls are never followed (subscribe, post a job, sign up, submit)', async (t) => {
  const { page } = await open(t, 'agg-wrong-links.html');
  const out = await followApplyLink(page);
  assert.equal(out.hops, 0);
  assert.equal(file(out.page), 'agg-wrong-links.html');
});

test('after following, the generic adapter fills the real form it landed on', async (t) => {
  const { page } = await open(t, 'agg-link.html');
  const out = await followApplyLink(page);
  const result = await generic.fill(out.page, JOB, NO_LLM);
  assert.equal(await out.page.inputValue('#first_name'), 'Test');
  assert.ok(result.report.filled >= 5);
});
