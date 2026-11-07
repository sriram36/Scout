'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApplicationUpdate } = require('../src/api/applicationUpdate');

const REPORT = {
  total: 10, filled: 6, skipped: 4, errors: 0, aiGenerated: 1,
  stageBreakdown: { learned: 0, deterministic: 5, semantic: 0, llm: 1 },
  details: { filled: [], skipped: [], errors: [] },
};

test('a normal run records numeric counts, the report, and autofill_completed', () => {
  const update = buildApplicationUpdate({ report: REPORT }, 'greenhouse');
  assert.equal(update.status, 'autofill_completed');
  assert.equal(update.ats_platform, 'greenhouse');
  assert.equal(update.fields_detected, 10);
  assert.equal(update.fields_filled, 6);
  assert.equal(update.fields_skipped, 4);
  assert.equal(update.ai_questions_answered, 1);
  assert.deepEqual(update.fill_report, REPORT);
});

test('an adapter note means a human has to act: awaiting_review, with the note kept in the report', () => {
  const update = buildApplicationUpdate({ report: REPORT, note: 'Stopped before "Submit"' }, 'workday');
  assert.equal(update.status, 'awaiting_review');
  assert.equal(update.fill_report.note, 'Stopped before "Submit"');
  assert.equal(update.fill_report.total, 10);
});

test('a note with no report (sign-in wall) stores zero counts and the note alone', () => {
  const update = buildApplicationUpdate({ report: null, note: 'Sign in first' }, 'workday');
  assert.equal(update.status, 'awaiting_review');
  assert.deepEqual(update.fill_report, { note: 'Sign in first' });
  assert.equal(update.fields_detected, 0);
  assert.equal(update.fields_filled, 0);
});

test('a run that found no fields asks the candidate to continue by hand instead of claiming success', () => {
  for (const result of [{ report: null }, { report: { ...REPORT, total: 0, filled: 0, skipped: 0 } }]) {
    const update = buildApplicationUpdate(result, 'generic');
    assert.equal(update.status, 'awaiting_review');
    assert.match(update.fill_report.note, /no form fields/i);
    assert.equal(update.fields_filled, 0);
  }
});

test('an adapter note is kept in preference to the no-fields note', () => {
  const update = buildApplicationUpdate({ report: null, note: 'Sign in first' }, 'workday');
  assert.equal(update.fill_report.note, 'Sign in first');
});

test('the report object passed in is not mutated', () => {
  const report = { ...REPORT };
  buildApplicationUpdate({ report, note: 'x' }, 'workday');
  assert.equal('note' in report, false);
});
