'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/engine/fillPlan');

const plan = [
  { action: 'fill', stage: 1, isAIGenerated: false },
  { action: 'skip', stage: -1, isAIGenerated: false },
  { action: 'fill', stage: 3, isAIGenerated: true },
];
const results = {
  filled:  [{ field: 'Email', meaning: 'personal.email', value: 'a@b.c' }, { field: 'Why us', meaning: 'unknown', value: 'text' }],
  skipped: [{ field: 'Gender', reason: 'protected' }],
  errors:  [],
};

test('report counts are integers so they fit INTEGER columns and render in the dashboard', () => {
  const r = buildReport(plan, results);
  for (const key of ['total', 'filled', 'skipped', 'errors', 'aiGenerated']) {
    assert.ok(Number.isInteger(r[key]), `${key} should be an integer, got ${JSON.stringify(r[key])}`);
  }
  assert.equal(r.total, 3);
  assert.equal(r.filled, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.errors, 0);
  assert.equal(r.aiGenerated, 1);
});

test('stage breakdown is unchanged', () => {
  assert.deepEqual(buildReport(plan, results).stageBreakdown, { learned: 0, deterministic: 1, semantic: 0, llm: 1 });
});

test('the per-field arrays are kept under details', () => {
  const r = buildReport(plan, results);
  assert.deepEqual(r.details.filled, results.filled);
  assert.deepEqual(r.details.skipped, results.skipped);
  assert.deepEqual(r.details.errors, results.errors);
});
