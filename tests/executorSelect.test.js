'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeFillPlan } = require('../src/engine/playwrightExecutor');

const OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'bachelors', label: "Bachelor's Degree" },
  { value: 'masters', label: "Master's Degree" },
];

function selectEntry(value, options = OPTIONS) {
  return {
    elementId: 'el-d',
    selector: { type: 'id', value: 'degree' },
    descriptor: { name: 'degree', id: 'degree', label: 'Degree', tag: 'select', type: 'select-one', options },
    meaning: 'education.degree',
    value,
    confidence: 0.99,
    stage: 1,
    action: 'select',
    skipReason: null,
    isAIGenerated: false,
  };
}

/** A locator whose selectOption records its calls and rejects values that are not real options. */
function recordingPage(realValues) {
  const calls = [];
  const locator = {
    count: async () => 1,
    first: () => ({
      selectOption: async (arg, opts) => {
        calls.push({ arg, opts });
        if (!realValues.includes(arg.value)) throw new Error('option not found');
      },
    }),
  };
  return { calls, page: { locator: () => locator } };
}

test('selects the matching option once, by a value that exists (no blind first attempt)', async () => {
  const { page, calls } = recordingPage(['', 'bachelors', 'masters']);
  const { filled } = await executeFillPlan(page, [selectEntry('B.Tech')]);
  assert.equal(filled.length, 1);
  assert.deepEqual(calls.map(c => c.arg), [{ value: 'bachelors' }]);
});

test('a value with no matching option is skipped without ever calling selectOption', async () => {
  const { page, calls } = recordingPage(['', 'bachelors', 'masters']);
  const { filled, skipped } = await executeFillPlan(page, [selectEntry('Zebra')]);
  assert.equal(filled.length, 0);
  assert.equal(skipped.length, 1);
  assert.equal(calls.length, 0, 'a blind selectOption would wait out the whole page timeout');
});

test('when the options are unknown, one short-timeout attempt is made', async () => {
  const { page, calls } = recordingPage(['us']);
  const { filled } = await executeFillPlan(page, [selectEntry('us', [])]);
  assert.equal(filled.length, 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].opts && calls[0].opts.timeout <= 3000, 'the attempt must not use the long default timeout');
});

test('when the options are unknown and the attempt fails, the field is skipped, not an error', async () => {
  const { page } = recordingPage([]);
  const { skipped, errors } = await executeFillPlan(page, [selectEntry('nope', [])]);
  assert.equal(errors.length, 0);
  assert.equal(skipped.length, 1);
});
