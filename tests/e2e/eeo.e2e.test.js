'use strict';

// With the LLM fully enabled, protected / legal / third-party / consent fields must be left
// alone AND never appear in anything sent to the model.
const test = require('node:test');
const assert = require('node:assert/strict');
const { useTestProfile } = require('../helpers/testProfile');

useTestProfile();
const { serveFixtures, launch, mockLlm } = require('../helpers/browser');
const generic = require('../../src/adapters/generic');

const JOB = { id: 'j', title: 'Software Engineer', company: 'Acme', description: 'Build things.', apply_url: 'x' };
const ANSWER = 'I built a job-application copilot that fills forms and stops for review.';

test('EEO, work-authorization, consent and emergency-contact fields stay empty and are never sent to the model', async (t) => {
  const llm = await mockLlm(ANSWER, 0.9);
  const saved = { base: process.env.LLM_BASE_URL, key: process.env.LLM_API_KEY, prov: process.env.LLM_PROVIDER };
  Object.assign(process.env, { LLM_PROVIDER: 'openai', LLM_BASE_URL: llm.baseUrl, LLM_API_KEY: 'test-key' });

  const fixtures = await serveFixtures();
  const browser = await launch();
  t.after(async () => {
    await browser.close(); await fixtures.close(); await llm.close();
    for (const [k, v] of [['LLM_BASE_URL', saved.base], ['LLM_API_KEY', saved.key], ['LLM_PROVIDER', saved.prov]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  const page = browser.page;
  await page.goto(`${fixtures.base}/eeo.html`);
  const result = await generic.fill(page, JOB, { useLLM: true, generateAnswers: true });

  // what should happen
  assert.equal(await page.inputValue('#fn'), 'Test');
  assert.equal(await page.inputValue('#em'), 'test.candidate@example.com');
  assert.equal(await page.inputValue('#free'), ANSWER, 'the ordinary free-text question is answered');

  // what must not
  assert.equal(await page.isChecked('#sms'), false, 'a phone number must not tick an SMS-consent checkbox');
  assert.equal(await page.inputValue('#eeoname'), '', 'a Name field inside the disability self-identification section');
  assert.equal(await page.inputValue('#eeodate'), '');
  assert.equal(await page.inputValue('#race'), '');
  assert.equal(await page.inputValue('#ec'), '', "the candidate's own name must not go into an emergency-contact field");
  assert.equal(await page.locator('input[name=g]:checked').count(), 0);
  assert.equal(await page.locator('input[name=wa]:checked').count(), 0);
  assert.equal(await page.evaluate(() => window.__submitted), false);

  // nothing sensitive reached the model: check the field content sent (user messages), not the
  // system prompts, which legitimately name these topics in order to forbid them
  const sent = JSON.stringify(llm.requests.flatMap(r => r.body.messages.filter(m => m.role === 'user').map(m => m.content)));
  assert.doesNotMatch(sent, /Male|Female|Decline to self|Voluntary|Disability|Work authorization|Hispanic|American Indian|do not wish|Emergency|text messages/i);
  assert.match(sent, /project you are proud of/i, 'the free-text question was the one thing asked');
  const classifications = llm.requests
    .map(r => r.body.messages.find(m => m.role === 'user').content)
    .filter(c => /Classify this form field/.test(c) && /project you are proud of/.test(c));
  assert.equal(classifications.length, 1, 'the plan is built twice but the field is classified once');
  assert.equal(result.report.errors, 0);
});
