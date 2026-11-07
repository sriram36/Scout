'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeFillPlan } = require('../src/engine/playwrightExecutor');

const descriptor = { name: 'email', id: 'em', label: 'Email Address', tag: 'input', type: 'email' };
const entry = (over = {}) => ({
  elementId: 'el-1',
  selector: { type: 'id', value: 'em' },
  descriptor,
  meaning: 'personal.email',
  value: 'a@b.c',
  confidence: 0.99,
  stage: 1,
  action: 'fill',
  skipReason: null,
  isAIGenerated: false,
  ...over,
});

const pageWith = (locator) => ({ locator: () => locator });
const goodLocator = () => ({ count: async () => 1, first: () => ({ focus: async () => {}, fill: async () => {} }) });

const IDENTITY = { field: 'el-1', label: 'Email Address', signature: 'email|em|email address' };

test('filled entries carry label and signature', async () => {
  const { filled } = await executeFillPlan(pageWith(goodLocator()), [entry()]);
  assert.equal(filled.length, 1);
  assert.deepEqual({ field: filled[0].field, label: filled[0].label, signature: filled[0].signature }, IDENTITY);
  assert.equal(filled[0].value, 'a@b.c');
});

test('planned skips carry label and signature plus the reason', async () => {
  const { skipped } = await executeFillPlan(pageWith(goodLocator()), [entry({ action: 'skip', value: null, skipReason: 'Could not classify field', meaning: 'unknown' })]);
  assert.equal(skipped.length, 1);
  assert.deepEqual({ field: skipped[0].field, label: skipped[0].label, signature: skipped[0].signature }, IDENTITY);
  assert.equal(skipped[0].reason, 'Could not classify field');
});

test('an element that is not on the page is reported as skipped with its identity', async () => {
  const missing = { count: async () => 0 };
  const { skipped, filled } = await executeFillPlan(pageWith(missing), [entry()]);
  assert.equal(filled.length, 0);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].label, 'Email Address');
  assert.equal(skipped[0].signature, 'email|em|email address');
});

test('an execution error is reported with the field identity', async () => {
  const broken = { count: async () => { throw new Error('page closed'); } };
  const { errors } = await executeFillPlan(pageWith(broken), [entry()]);
  assert.equal(errors.length, 1);
  assert.deepEqual({ field: errors[0].field, label: errors[0].label, signature: errors[0].signature }, IDENTITY);
  assert.equal(errors[0].error, 'page closed');
});
