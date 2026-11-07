'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeResults } = require('../src/adapters/pipeline');

const result = (n, extra = {}) => ({
  filled:  [{ field: `f${n}` }],
  skipped: [{ field: `s${n}` }],
  errors:  [],
  report: {
    total: 3, filled: 1, skipped: 2, errors: 0, aiGenerated: n,
    stageBreakdown: { learned: 0, deterministic: 1, semantic: n, llm: 0 },
    details: { filled: [{ field: `f${n}` }], skipped: [{ field: `s${n}` }], errors: [] },
  },
  ...extra,
});

test('mergeResults sums counts and stage breakdowns and concatenates details', () => {
  const merged = mergeResults([result(1), result(2)]);
  assert.deepEqual(merged.filled, [{ field: 'f1' }, { field: 'f2' }]);
  assert.deepEqual(merged.skipped, [{ field: 's1' }, { field: 's2' }]);
  assert.equal(merged.report.total, 6);
  assert.equal(merged.report.filled, 2);
  assert.equal(merged.report.skipped, 4);
  assert.equal(merged.report.aiGenerated, 3);
  assert.deepEqual(merged.report.stageBreakdown, { learned: 0, deterministic: 2, semantic: 3, llm: 0 });
  assert.deepEqual(merged.report.details.filled, [{ field: 'f1' }, { field: 'f2' }]);
});

test('results without a report (steps with no fields) are ignored', () => {
  const merged = mergeResults([result(1), { filled: [], skipped: [], errors: [], report: null }]);
  assert.equal(merged.report.total, 3);
});

test('no reports at all gives a null report and empty arrays', () => {
  const merged = mergeResults([{ filled: [], skipped: [], errors: [], report: null }]);
  assert.equal(merged.report, null);
  assert.deepEqual(merged.filled, []);
  assert.equal(mergeResults([]).report, null);
});
