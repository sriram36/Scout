'use strict';

// Real Chromium against a fixture application form, through the real pipeline.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { useTestProfile } = require('../helpers/testProfile');

const { resumePath } = useTestProfile(); // before the engine loads the profile
const { serveFixtures, launch, mockLlm } = require('../helpers/browser');
const generic = require('../../src/adapters/generic');

const JOB = { id: 'job-1', title: 'Software Engineer, Platform', company: 'Acme Corp', description: 'Build the platform.', apply_url: 'x' };
const NO_LLM = { useLLM: false, generateAnswers: false };

async function openForm(fixtures, browser, name = 'generic.html') {
  await browser.page.goto(`${fixtures.base}/${name}`);
  return browser.page;
}

test('fills contact, education and resume, leaves protected fields and the submit button alone', async (t) => {
  const fixtures = await serveFixtures();
  const browser = await launch();
  t.after(async () => { await browser.close(); await fixtures.close(); });

  const page = await openForm(fixtures, browser);
  const result = await generic.fill(page, JOB, NO_LLM);

  const val = (sel) => page.inputValue(sel);
  assert.equal(await val('#first_name'), 'Test');
  assert.equal(await val('#last_name'), 'Candidate');
  assert.equal(await val('#email'), 'test.candidate@example.com');
  assert.equal(await val('#phone'), '+1 555-0100');
  assert.equal(await val('#linkedin'), 'https://linkedin.com/in/test-candidate');
  assert.equal(await val('#github'), 'https://github.com/test-candidate');
  assert.equal(await val('#school'), 'Test State University');
  assert.equal(await val('#degree'), 'bachelors', 'B.Tech maps to Bachelor\'s Degree');

  const uploaded = await page.$eval('#resume', (el) => Array.from(el.files).map(f => f.name));
  assert.deepEqual(uploaded, [path.basename(resumePath)]);

  // never touched
  assert.equal(await val('#gender'), '');
  assert.equal(await val('#veteran'), '');
  assert.equal(await val('#work_auth'), '', 'work authorization must stay for the candidate');
  assert.equal(await page.$eval('[name=csrf_token]', (el) => el.value), 'tok-123');
  assert.equal(await val('#why'), '', 'free text stays empty without answer generation');
  assert.equal(await page.evaluate(() => window.__submitted), false, 'the form must never be submitted');

  assert.ok(result.report);
});

test('the report has integer counts and identifies skipped fields so they can be corrected', async (t) => {
  const fixtures = await serveFixtures();
  const browser = await launch();
  t.after(async () => { await browser.close(); await fixtures.close(); });

  const page = await openForm(fixtures, browser);
  const { report } = await generic.fill(page, JOB, NO_LLM);

  for (const key of ['total', 'filled', 'skipped', 'errors', 'aiGenerated']) {
    assert.ok(Number.isInteger(report[key]), `${key} is an integer`);
  }
  assert.equal(report.filled, 9, 'name x2, email, phone, linkedin, github, university, degree, resume');
  assert.equal(report.errors, 0);
  assert.equal(report.aiGenerated, 0);

  const skipped = report.details.skipped;
  const why = skipped.find(s => s.label === 'Why do you want to work here?');
  assert.ok(why, 'the free-text question is listed as skipped with its label');
  assert.equal(why.signature, 'why|why|why do you want to work here?');
  assert.equal(why.reason, 'Could not classify field');

  const gender = skipped.find(s => s.label === 'Gender');
  assert.equal(gender.reason, 'EEOC/demographic field — protected');
  const auth = skipped.find(s => /authorized to work/.test(s.label));
  assert.equal(auth.reason, 'Legal-status question — answer this yourself');

  const filledEmail = report.details.filled.find(f => f.label === 'Email Address');
  assert.equal(filledEmail.value, 'test.candidate@example.com');
  assert.equal(filledEmail.signature, 'email|email|email address');
});

test('with an LLM, a free-text question gets a tailored answer but protected and legal questions never do', async (t) => {
  const llm = await mockLlm('I admire the product and want to help build it.');
  const saved = { base: process.env.LLM_BASE_URL, key: process.env.LLM_API_KEY, prov: process.env.LLM_PROVIDER };
  process.env.LLM_PROVIDER = 'openai';
  process.env.LLM_BASE_URL = llm.baseUrl;
  process.env.LLM_API_KEY = 'test-key';

  const fixtures = await serveFixtures();
  const browser = await launch();
  t.after(async () => {
    await browser.close(); await fixtures.close(); await llm.close();
    for (const [k, v] of [['LLM_BASE_URL', saved.base], ['LLM_API_KEY', saved.key], ['LLM_PROVIDER', saved.prov]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  const page = await openForm(fixtures, browser);
  const { report } = await generic.fill(page, JOB, { useLLM: false, generateAnswers: true });

  assert.equal(await page.inputValue('#why'), 'I admire the product and want to help build it.');
  assert.equal(report.aiGenerated, 1);
  const aiField = report.details.filled.find(f => f.isAIGenerated);
  assert.equal(aiField.label, 'Why do you want to work here?');

  assert.equal(await page.inputValue('#work_auth'), '');
  assert.equal(await page.inputValue('#gender'), '');

  // The model was asked about the one free-text question only — never about protected/legal fields.
  const asked = llm.requests.map(r => r.body.messages.find(m => m.role === 'user').content).join('\n');
  assert.match(asked, /Why do you want to work here\?/);
  assert.doesNotMatch(asked, /authorized to work/);
  assert.doesNotMatch(asked, /Gender|Veteran/);
  assert.equal(await page.evaluate(() => window.__submitted), false);
});

test('a weak AI answer is not filled', async (t) => {
  const llm = await mockLlm('Not sure.', 0.3);
  const saved = { base: process.env.LLM_BASE_URL, key: process.env.LLM_API_KEY, prov: process.env.LLM_PROVIDER };
  process.env.LLM_PROVIDER = 'openai';
  process.env.LLM_BASE_URL = llm.baseUrl;
  process.env.LLM_API_KEY = 'test-key';

  const fixtures = await serveFixtures();
  const browser = await launch();
  t.after(async () => {
    await browser.close(); await fixtures.close(); await llm.close();
    for (const [k, v] of [['LLM_BASE_URL', saved.base], ['LLM_API_KEY', saved.key], ['LLM_PROVIDER', saved.prov]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  const page = await openForm(fixtures, browser);
  const { report } = await generic.fill(page, JOB, { useLLM: false, generateAnswers: true });
  assert.equal(await page.inputValue('#why'), '');
  assert.equal(report.aiGenerated, 0);
  const why = report.details.skipped.find(s => s.label === 'Why do you want to work here?');
  assert.equal(why.reason, 'AI answer too uncertain — write this one yourself');
});
