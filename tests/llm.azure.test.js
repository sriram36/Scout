'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const azure = require('../src/llm/azureClient');
const { resetLearnedParameters } = require('../src/llm/chatRequest');

const KEYS = ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_DEPLOYMENT'];
const ok = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }), text: async () => '' };

function withAzure(env, fn) {
  return async () => {
    const savedEnv = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
    const realFetch = globalThis.fetch;
    const seen = [];
    Object.assign(process.env, env);
    globalThis.fetch = async (url, init) => { seen.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) }); return ok; };
    resetLearnedParameters();
    try { await fn(seen); } finally {
      globalThis.fetch = realFetch;
      KEYS.forEach(k => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
    }
  };
}
const MSGS = [{ role: 'user', content: 'hi' }];

test('classic endpoint: deployment URL with api-version, api-key header, max_tokens', withAzure(
  { AZURE_OPENAI_ENDPOINT: 'https://res.openai.azure.com/', AZURE_OPENAI_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'gpt-4o' },
  async (seen) => {
    await azure.callAPI(MSGS, { maxTokens: 123, temperature: 0, jsonMode: true });
    assert.match(seen[0].url, /^https:\/\/res\.openai\.azure\.com\/openai\/deployments\/gpt-4o\/chat\/completions\?api-version=/);
    assert.equal(seen[0].headers['api-key'], 'k');
    assert.equal(seen[0].body.max_tokens, 123);
    assert.equal('model' in seen[0].body, false);
    assert.deepEqual(seen[0].body.response_format, { type: 'json_object' });
  }
));

test('v1 endpoint (/openai/v1): plain /chat/completions, model in the body, max_completion_tokens', withAzure(
  { AZURE_OPENAI_ENDPOINT: 'https://res.openai.azure.com/openai/v1', AZURE_OPENAI_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'my-deployment' },
  async (seen) => {
    await azure.callAPI(MSGS, { maxTokens: 123, temperature: 0, jsonMode: true });
    assert.equal(seen[0].url, 'https://res.openai.azure.com/openai/v1/chat/completions');
    assert.equal(seen[0].headers['api-key'], 'k');
    assert.equal(seen[0].body.model, 'my-deployment');
    assert.equal(seen[0].body.max_completion_tokens, 123);
    assert.equal('max_tokens' in seen[0].body, false);
  }
));

test('v1 endpoint with a trailing slash is handled', withAzure(
  { AZURE_OPENAI_ENDPOINT: 'https://res.openai.azure.com/openai/v1/', AZURE_OPENAI_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'd' },
  async (seen) => {
    await azure.callAPI(MSGS);
    assert.equal(seen[0].url, 'https://res.openai.azure.com/openai/v1/chat/completions');
  }
));

test('returns null without calling the network when Azure is not configured', async () => {
  const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
  KEYS.forEach(k => delete process.env[k]);
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; };
  try {
    assert.equal(await azure.callAPI(MSGS), null);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = realFetch;
    KEYS.forEach(k => { if (saved[k] !== undefined) process.env[k] = saved[k]; });
  }
});
