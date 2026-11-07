'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { postChatCompletion, resetLearnedParameters } = require('../src/llm/chatRequest');

const ok = (content = '{"ok":true}') => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => '' });
const bad = (status, param, code = 'unsupported_parameter') => ({
  ok: false, status, text: async () => JSON.stringify({ error: { message: `Unsupported parameter: '${param}'`, param, code } }), json: async () => ({}),
});

/** Stubs fetch with a scripted list of responses and records every request body. */
function withFetch(responses, fn) {
  return async () => {
    const real = globalThis.fetch;
    const seen = [];
    globalThis.fetch = async (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return responses.shift(); };
    resetLearnedParameters();
    try { await fn(seen); } finally { globalThis.fetch = real; }
  };
}

const call = (extra = {}) => postChatCompletion({
  url: 'https://example.test/chat/completions',
  headers: { 'Content-Type': 'application/json' },
  body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 150, temperature: 0, ...extra },
  label: 'LLM',
});

test('a model that rejects max_tokens is retried with max_completion_tokens', withFetch([bad(400, 'max_tokens'), ok()], async (seen) => {
  assert.equal(await call(), '{"ok":true}');
  assert.equal(seen.length, 2);
  assert.equal('max_tokens' in seen[1].body, false);
  assert.equal(seen[1].body.max_completion_tokens, 150);
}));

test('a model that rejects temperature is retried without it', withFetch([bad(400, 'temperature', 'unsupported_value'), ok()], async (seen) => {
  await call();
  assert.equal(seen.length, 2);
  assert.equal('temperature' in seen[1].body, false);
}));

test('both rejections are handled in sequence', withFetch([bad(400, 'max_tokens'), bad(400, 'temperature'), ok()], async (seen) => {
  await call();
  assert.equal(seen.length, 3);
  assert.equal(seen[2].body.max_completion_tokens, 150);
  assert.equal('temperature' in seen[2].body, false);
}));

test('what was learned is applied to later calls, so there is no wasted round trip', withFetch([bad(400, 'max_tokens'), bad(400, 'temperature'), ok(), ok()], async (seen) => {
  await call();
  await call();
  assert.equal(seen.length, 4, 'two calls: three requests for the first, one for the second');
  assert.equal(seen[3].body.max_completion_tokens, 150);
  assert.equal('max_tokens' in seen[3].body, false);
  assert.equal('temperature' in seen[3].body, false);
}));

test('any other 400 is an error and is not retried', withFetch([bad(400, 'frobnicate'), ok()], async (seen) => {
  await assert.rejects(call(), /LLM API error 400/);
  assert.equal(seen.length, 1);
}));

test('non-400 errors are not retried and keep their status', withFetch([{ ok: false, status: 429, text: async () => 'rate limited' }, ok()], async (seen) => {
  await assert.rejects(call(), /LLM API error 429/);
  assert.equal(seen.length, 1);
}));

test('it gives up after a bounded number of adjustments', withFetch([bad(400, 'max_tokens'), bad(400, 'temperature'), bad(400, 'max_tokens'), ok()], async (seen) => {
  await assert.rejects(call());
  assert.ok(seen.length <= 3);
}));

test('empty content is an error', withFetch([ok('   ')], async () => {
  await assert.rejects(call(), /Empty response from LLM/);
}));

test('a request that already uses max_completion_tokens is left alone', withFetch([ok()], async (seen) => {
  await postChatCompletion({
    url: 'https://example.test/chat/completions', headers: {},
    body: { messages: [], max_completion_tokens: 300 }, label: 'LLM',
  });
  assert.equal(seen[0].body.max_completion_tokens, 300);
  assert.equal('max_tokens' in seen[0].body, false);
}));
