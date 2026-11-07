'use strict';

// Each ATS adapter against a fixture page that mimics that platform's markup conventions.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { useTestProfile } = require('../helpers/testProfile');

const { resumePath } = useTestProfile();
const { serveFixtures, launch } = require('../helpers/browser');

const JOB = { id: 'job-1', title: 'Software Engineer', company: 'Acme Corp', description: 'Build things.', apply_url: 'x' };
const NO_LLM = { useLLM: false, generateAnswers: false };

const CASES = [
  {
    adapter: 'greenhouse',
    fixture: 'greenhouse.html',
    expect: {
      '#first_name': 'Test', '#last_name': 'Candidate', '#email': 'test.candidate@example.com',
      '#phone': '+1 555-0100', '#question_1001': 'https://linkedin.com/in/test-candidate',
    },
    resume: '#resume',
    untouched: ['#question_1002', '#question_1003', '#gender'],
  },
  {
    adapter: 'lever',
    fixture: 'lever.html',
    expect: {
      '#name': 'Test Candidate', '#email': 'test.candidate@example.com', '#phone': '+1 555-0100',
      '#li': 'https://linkedin.com/in/test-candidate', '#gh': 'https://github.com/test-candidate',
      '#pf': 'https://test-candidate.dev',
    },
    resume: '#resume-upload-input',
    untouched: ['#comments', '#eeo-gender'],
  },
  {
    adapter: 'ashby',
    fixture: 'ashby.html',
    expect: {
      '#_systemfield_name': 'Test Candidate', '#_systemfield_email': 'test.candidate@example.com',
      '#phone_field': '+1 555-0100', '#linkedin_field': 'https://linkedin.com/in/test-candidate',
    },
    resume: '#_systemfield_resume',
    untouched: ['#why_field', '#veteran_field'],
  },
];

for (const c of CASES) {
  test(`${c.adapter}: fills known fields, uploads the resume, leaves protected/free-text alone, never submits`, async (t) => {
    const adapter = require(`../../src/adapters/${c.adapter}`);
    const fixtures = await serveFixtures();
    const browser = await launch();
    t.after(async () => { await browser.close(); await fixtures.close(); });

    const page = browser.page;
    await page.goto(`${fixtures.base}/${c.fixture}`);
    const result = await adapter.fill(page, JOB, NO_LLM);

    for (const [selector, expected] of Object.entries(c.expect)) {
      assert.equal(await page.inputValue(selector), expected, `${c.adapter} ${selector}`);
    }
    const uploaded = await page.$eval(c.resume, (el) => Array.from(el.files).map(f => f.name));
    assert.deepEqual(uploaded, [path.basename(resumePath)], `${c.adapter} resume`);
    for (const selector of c.untouched) {
      assert.equal(await page.inputValue(selector), '', `${c.adapter} ${selector} must stay empty`);
    }
    assert.equal(await page.evaluate(() => window.__submitted), false, 'must never submit');

    assert.ok(Number.isInteger(result.report.filled) && result.report.filled >= Object.keys(c.expect).length);
    assert.equal(result.report.errors, 0);
    assert.ok(result.report.details.skipped.every(s => typeof s.label === 'string' && s.label.length > 0));
  });
}
