'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { useTestProfile } = require('./helpers/testProfile');

useTestProfile(); // before the engine loads the profile
const { buildFillPlan, determineAction } = require('../src/engine/fillPlan');

let n = 0;
const field = (over = {}) => {
  n += 1;
  return {
    elementId: `el-${n}`,
    selector: { type: 'id', value: `f${n}` },
    tag: 'input',
    type: 'text',
    id: `f${n}`,
    name: `f${n}`,
    visible: true,
    ...over,
  };
};
const plan = (descriptors, extra = {}) => buildFillPlan(descriptors, { platform: 'generic', useLLM: false, ...extra });

test('a recognised field is filled from the profile with a high-confidence rule match', async () => {
  const d = field({ label: 'Email address', type: 'email' });
  const [entry] = await plan([d]);
  assert.equal(entry.action, 'fill');
  assert.equal(entry.value, 'test.candidate@example.com');
  assert.equal(entry.meaning, 'personal.email');
  assert.equal(entry.stage, 1);
});

test('protected fields are skipped with the safety reason before any matching', async () => {
  const d = field({ label: 'Gender', tag: 'select', type: 'select-one' });
  const [entry] = await plan([d]);
  assert.equal(entry.action, 'skip');
  assert.equal(entry.meaning, 'protected');
  assert.equal(entry.stage, -1);
  assert.equal(entry.skipReason, 'EEOC/demographic field — protected');
});

test('legal-status questions are skipped, never filled or answered', async () => {
  const d = field({ label: 'Are you legally authorized to work in the United States?', tag: 'textarea', type: 'textarea' });
  const [entry] = await plan([d], { aiAnswers: [{ elementId: d.elementId, answer: 'Yes', confidence: 0.9 }] });
  assert.equal(entry.action, 'skip');
  assert.equal(entry.isAIGenerated, false);
});

test('an unclassifiable field is skipped without the LLM', async () => {
  const [entry] = await plan([field({ label: 'Zzz qqq unrecognisable' })]);
  assert.equal(entry.action, 'skip');
  assert.equal(entry.skipReason, 'Could not classify field');
});

test('a classified field with no value in the profile is skipped with that reason', async () => {
  // personal.fullName resolves; links.portfolio exists in the test profile, so use a path the profile lacks
  const d = field({ label: 'Current company', _knownMeaning: 'experience.current.company' });
  const [entry] = await plan([d]);
  assert.equal(entry.action, 'skip');
  assert.match(entry.skipReason, /No value in profile/);
});

test('an AI answer for an otherwise unclassified free-text field is applied and flagged', async () => {
  const d = field({ label: 'Why do you want to work here?', tag: 'textarea', type: 'textarea' });
  const [entry] = await plan([d], { aiAnswers: [{ elementId: d.elementId, answer: 'I like the product.', confidence: 0.8 }] });
  assert.equal(entry.action, 'fill');
  assert.equal(entry.value, 'I like the product.');
  assert.equal(entry.isAIGenerated, true);
});

test('a low-confidence or empty AI answer is not filled', async () => {
  const low = field({ label: 'Tell us about yourself', tag: 'textarea', type: 'textarea' });
  const empty = field({ label: 'Anything else?', tag: 'textarea', type: 'textarea' });
  const entries = await plan([low, empty], {
    aiAnswers: [
      { elementId: low.elementId, answer: 'Some answer', confidence: 0.3 },
      { elementId: empty.elementId, answer: '   ', confidence: 0.9 },
    ],
  });
  assert.equal(entries[0].action, 'skip');
  assert.equal(entries[1].action, 'skip');
  assert.ok(entries.every(e => e.isAIGenerated === false));
});

test('determineAction maps field kinds to executor actions', () => {
  assert.equal(determineAction({ tag: 'input', type: 'file' }), 'upload');
  assert.equal(determineAction({ tag: 'select', type: 'select-one' }), 'select');
  assert.equal(determineAction({ tag: 'input', type: 'radio' }), 'radio');
  assert.equal(determineAction({ tag: 'input', type: 'checkbox' }), 'checkbox');
  assert.equal(determineAction({ tag: 'textarea', type: 'textarea' }), 'fill');
  assert.equal(determineAction({ tag: 'input', type: 'email' }), 'fill');
});
