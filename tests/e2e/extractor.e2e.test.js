'use strict';

// Field extraction and targeting in awkward-but-real markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const { useTestProfile } = require('../helpers/testProfile');

useTestProfile();
const { serveFixtures, launch } = require('../helpers/browser');
const generic = require('../../src/adapters/generic');

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
