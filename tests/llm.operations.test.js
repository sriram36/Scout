'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOperations, VALID_MEANINGS } = require('../src/llm/operations');

function fakeTransport(impl) {
  const calls = [];
  return {
    calls,
    name: 'fake',
    isConfigured: () => true,
    callAPI: async (messages, opts) => {
      calls.push({ messages, opts });
      return impl(messages, opts);
    },
  };
}

const FIELD = { label: 'Email address', type: 'text' };

test('classifyField maps valid JSON to {meaning, confidence, action}', async () => {
  const t = fakeTransport(() => JSON.stringify({ fieldMeaning: 'personal.email', confidence: 0.9, action: 'fill' }));
  const { classifyField } = createOperations(t);
  assert.deepEqual(await classifyField(FIELD), { meaning: 'personal.email', confidence: 0.9, action: 'fill' });
});

test('classifyField sends the system prompt first with jsonMode on', async () => {
  const t = fakeTransport(() => JSON.stringify({ fieldMeaning: 'unknown', confidence: 0.1, action: 'skip' }));
  await createOperations(t).classifyField(FIELD);
  assert.equal(t.calls[0].messages[0].role, 'system');
  assert.equal(t.calls[0].opts.jsonMode, true);
});

test('classifyField returns null for malformed JSON', async () => {
  const { classifyField } = createOperations(fakeTransport(() => 'not json {'));
  assert.equal(await classifyField(FIELD), null);
});

test('classifyField rejects a meaning outside VALID_MEANINGS', async () => {
  const t = fakeTransport(() => JSON.stringify({ fieldMeaning: 'personal.ssn', confidence: 0.99, action: 'fill' }));
  assert.equal(await createOperations(t).classifyField(FIELD), null);
  assert.ok(VALID_MEANINGS.includes('unknown'));
  assert.ok(!VALID_MEANINGS.includes('personal.ssn'));
});

test('classifyField clamps confidence into 0..1', async () => {
  const hi = createOperations(fakeTransport(() => JSON.stringify({ fieldMeaning: 'personal.email', confidence: 7, action: 'fill' })));
  const lo = createOperations(fakeTransport(() => JSON.stringify({ fieldMeaning: 'personal.email', confidence: -2, action: 'fill' })));
  assert.equal((await hi.classifyField(FIELD)).confidence, 1);
  assert.equal((await lo.classifyField(FIELD)).confidence, 0);
});

test('classifyField returns null when the transport throws', async () => {
  const { classifyField } = createOperations(fakeTransport(() => { throw new Error('boom'); }));
  assert.equal(await classifyField(FIELD), null);
});

test('classifyField returns null when the transport is unconfigured (null content)', async () => {
  const { classifyField } = createOperations(fakeTransport(() => null));
  assert.equal(await classifyField(FIELD), null);
});

const ANSWER_PARAMS = { question: 'Why us?', candidateProfile: {}, jobTitle: 'Dev', company: 'Acme', jobDescription: '' };
const EMPTY = { answer: '', confidence: 0, evidence: [] };

test('generateAnswer returns trimmed answer and evidence array', async () => {
  const t = fakeTransport(() => JSON.stringify({ answer: '  I like it.  ', confidence: 0.8, evidence: ['projects[0].name'] }));
  assert.deepEqual(await createOperations(t).generateAnswer(ANSWER_PARAMS),
    { answer: 'I like it.', confidence: 0.8, evidence: ['projects[0].name'] });
});

test('generateAnswer falls back to empty result on empty, non-JSON or throwing transport', async () => {
  assert.deepEqual(await createOperations(fakeTransport(() => null)).generateAnswer(ANSWER_PARAMS), EMPTY);
  assert.deepEqual(await createOperations(fakeTransport(() => 'plain text')).generateAnswer(ANSWER_PARAMS), EMPTY);
  assert.deepEqual(await createOperations(fakeTransport(() => { throw new Error('x'); })).generateAnswer(ANSWER_PARAMS), EMPTY);
  assert.deepEqual(await createOperations(fakeTransport(() => JSON.stringify({ answer: 5 }))).generateAnswer(ANSWER_PARAMS), EMPTY);
});

test('generateAnswer: an omitted or zero confidence stays 0 and is never defaulted upward', async () => {
  const omitted = createOperations(fakeTransport(() => JSON.stringify({ answer: 'Yes, I am eligible.' })));
  assert.equal((await omitted.generateAnswer(ANSWER_PARAMS)).confidence, 0);
  const zero = createOperations(fakeTransport(() => JSON.stringify({ answer: 'Yes', confidence: 0 })));
  assert.equal((await zero.generateAnswer(ANSWER_PARAMS)).confidence, 0);
});

test('the answer prompt tells the model to refuse legal and EEO questions', async () => {
  const t = fakeTransport(() => JSON.stringify({ answer: '', confidence: 0 }));
  await createOperations(t).generateAnswer(ANSWER_PARAMS);
  const system = t.calls[0].messages[0].content;
  assert.match(system, /work authori[sz]ation|visa|sponsorship/i);
  assert.match(system, /confidence: 0/);
});
