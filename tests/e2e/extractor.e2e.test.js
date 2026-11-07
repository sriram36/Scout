'use strict';

// Field extraction and targeting in awkward-but-real markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const { useTestProfile } = require('../helpers/testProfile');

useTestProfile();
const { serveFixtures, launch } = require('../helpers/browser');
const generic = require('../../src/adapters/generic');
const { extractFields } = require('../../src/engine/fieldDescriptor');

const JOB = { id: 'j', title: 'Engineer', company: 'Acme', description: '', apply_url: 'x' };
const NO_LLM = { useLLM: false, generateAnswers: false };

async function withPage(fixture, t) {
  const fixtures = await serveFixtures();
  const browser = await launch();
  t.after(async () => { await browser.close(); await fixtures.close(); });
  await browser.page.goto(`${fixtures.base}/${fixture}`);
  return browser.page;
}

test('fields without id or name are filled correctly even after a submit-type input', async (t) => {
  const page = await withPage('noids.html', t);
  const result = await generic.fill(page, JOB, NO_LLM);

  assert.equal(await page.inputValue('input[type=tel]'), '+1 555-0100');
  assert.equal(await page.inputValue('input[type=email]'), 'test.candidate@example.com');
  assert.equal(await page.inputValue('div:nth-of-type(3) input'), 'Test');
  assert.equal(result.report.errors, 0, 'no fill may be attempted on the submit button');
  assert.equal(await page.evaluate(() => window.__submitted), false);
});

test('fields inside open shadow roots are found, labelled and filled', async (t) => {
  const page = await withPage('shadow.html', t);
  const result = await generic.fill(page, JOB, NO_LLM);

  const inShadow = (host, sel) => page.evaluate(([h, s]) => document.getElementById(h).shadowRoot.querySelector(s).value, [host, sel]);
  assert.equal(await inShadow('host-contact', '#sr-first'), 'Test');
  assert.equal(await inShadow('host-contact', '#sr-last'), 'Candidate');
  assert.equal(await inShadow('host-contact', '#sr-email'), 'test.candidate@example.com');
  assert.equal(await inShadow('host-links', 'input'), 'https://linkedin.com/in/test-candidate');

  assert.equal(result.report.errors, 0);
  assert.equal(result.report.filled, 4);
  assert.equal(await page.evaluate(() => window.__submitted), false);
});

test('duplicate ids (wrapper + input, and the same id in several shadow roots) never send a value to the wrong element', async (t) => {
  const page = await withPage('dupes.html', t);
  const result = await generic.fill(page, JOB, NO_LLM);

  assert.equal(await page.inputValue('input[name=first_name]'), 'Test', 'wrapper div and input share an id');
  assert.equal(await page.inputValue('#em'), 'test.candidate@example.com');
  const inRoot = (host) => page.evaluate((h) => document.getElementById(h).shadowRoot.querySelector('input').value, host);
  assert.equal(await inRoot('c1'), 'https://linkedin.com/in/test-candidate');
  assert.equal(await inRoot('c2'), 'https://github.com/test-candidate');
  assert.equal(await inRoot('c3'), 'https://test-candidate.dev');
  assert.equal(result.report.errors, 0);
  assert.equal(result.report.filled, 5, 'first name, email and three shadow-root fields');
});

test('radio groups that reuse a name in different shadow roots are both extracted', async (t) => {
  const page = await withPage('radios-shadow.html', t);
  const radios = (await extractFields(page)).filter(d => d.type === 'radio');
  assert.equal(radios.length, 2, 'one descriptor per group, and each shadow root has its own group');
  assert.ok(radios.every(r => r.ambiguousGroup === true), 'the shared name cannot be told apart by a locator, so both are flagged');
});

test('the generic adapter fills the form inside an iframe when the page itself has almost nothing', async (t) => {
  const page = await withPage('icims.html', t);
  const result = await generic.fill(page, JOB, NO_LLM);

  const frame = page.frameLocator('#icims_content_iframe');
  assert.equal(await frame.locator('#firstname').inputValue(), 'Test');
  assert.equal(await frame.locator('#emailaddr').inputValue(), 'test.candidate@example.com');
  assert.equal(await page.inputValue('#site-search'), '', 'the host page search box is not the form');
  assert.ok(result.report.filled >= 4);
});
