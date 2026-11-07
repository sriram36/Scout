'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const client = require('../src/llm/openaiCompatClient');

const ENV_KEYS = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'];
const MSGS = [{ role: 'user', content: 'hi' }];

function withEnv(env, fn) {
  return async () => {
    const saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    const realFetch = globalThis.fetch;
    ENV_KEYS.forEach(k => delete process.env[k]);
    Object.assign(process.env, env);
    try { await fn(); } finally {
      globalThis.fetch = realFetch;
      ENV_KEYS.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
    }
  };
}

function stubFetch(responder) {
  const seen = {};
  globalThis.fetch = async (url, init) => {
    seen.url = url; seen.init = init; seen.body = JSON.parse(init.body);
    return responder();
  };
  return seen;
}

const ok = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => '' });

test('trims trailing slash from LLM_BASE_URL', withEnv({ LLM_BASE_URL: 'http://localhost:11434/v1/' }, async () => {
  const seen = stubFetch(() => ok('hello'));
  assert.equal(await client.callAPI(MSGS), 'hello');
  assert.equal(seen.url, 'http://localhost:11434/v1/chat/completions');
}));

test('defaults to the OpenAI base URL', withEnv({ LLM_API_KEY: 'k' }, async () => {
  const seen = stubFetch(() => ok('x'));
  await client.callAPI(MSGS);
  assert.equal(seen.url, 'https://api.openai.com/v1/chat/completions');
}));

test('sends Authorization only when LLM_API_KEY is set', withEnv({ LLM_API_KEY: 'k' }, async () => {
  let seen = stubFetch(() => ok('x'));
  await client.callAPI(MSGS);
  assert.equal(seen.init.headers.Authorization, 'Bearer k');
  delete process.env.LLM_API_KEY;
  process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
  seen = stubFetch(() => ok('x'));
  await client.callAPI(MSGS);
  assert.equal('Authorization' in seen.init.headers, false);
}));

test('model comes from LLM_MODEL, default gpt-4o-mini', withEnv({ LLM_API_KEY: 'k' }, async () => {
  let seen = stubFetch(() => ok('x'));
  await client.callAPI(MSGS);
  assert.equal(seen.body.model, 'gpt-4o-mini');
  process.env.LLM_MODEL = 'llama3.1';
  seen = stubFetch(() => ok('x'));
  await client.callAPI(MSGS);
  assert.equal(seen.body.model, 'llama3.1');
}));

test('response_format only with jsonMode', withEnv({ LLM_API_KEY: 'k' }, async () => {
  let seen = stubFetch(() => ok('{}'));
  await client.callAPI(MSGS, { jsonMode: true });
  assert.deepEqual(seen.body.response_format, { type: 'json_object' });
  seen = stubFetch(() => ok('x'));
  await client.callAPI(MSGS);
  assert.equal('response_format' in seen.body, false);
}));

test('non-2xx rejects with the status in the message', withEnv({ LLM_API_KEY: 'k' }, async () => {
  stubFetch(() => ({ ok: false, status: 429, text: async () => 'rate limited' }));
  await assert.rejects(client.callAPI(MSGS), /429/);
}));

test('empty content rejects', withEnv({ LLM_API_KEY: 'k' }, async () => {
  stubFetch(() => ok('   '));
  await assert.rejects(client.callAPI(MSGS), /Empty response/);
}));

test('returns null without calling fetch when unconfigured', withEnv({}, async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; };
  assert.equal(await client.callAPI(MSGS), null);
  assert.equal(called, false);
}));

test('isConfigured is true with either key or base URL', withEnv({}, async () => {
  assert.equal(client.isConfigured(), false);
  process.env.LLM_API_KEY = 'k';
  assert.equal(client.isConfigured(), true);
  delete process.env.LLM_API_KEY;
  process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
  assert.equal(client.isConfigured(), true);
}));
