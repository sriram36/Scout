'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { useTestProfile } = require('./helpers/testProfile');

useTestProfile();
const { identifyFreeTextQuestions } = require('../src/engine/answerGenerator');

const UNCLASSIFIED = 'Could not classify field';
const entry = (descriptor, over = {}) => ({ action: 'skip', skipReason: UNCLASSIFIED, elementId: descriptor.elementId, descriptor, ...over });
const ask = (...plan) => identifyFreeTextQuestions(plan.map(p => p.descriptor), plan);

test('a labelled, unclassified textarea is a free-text question', () => {
  const d = { elementId: 'a', tag: 'textarea', type: 'textarea', label: 'Tell us about a project you are proud of' };
  assert.deepEqual(ask(entry(d)), [d]);
});

test('a text input with only a placeholder or aria-label is still a question', () => {
  const p = { elementId: 'p', tag: 'input', type: 'text', placeholder: 'Why this role?' };
  const a = { elementId: 'a', tag: 'input', type: 'text', ariaLabel: 'Describe your interest' };
  assert.equal(ask(entry(p), entry(a)).length, 2);
});

test('a field whose question text was never seen is not sent to the model', () => {
  const d = { elementId: 'x', tag: 'input', type: 'text', name: 'q_77' };
  assert.deepEqual(ask(entry(d)), []);
  assert.deepEqual(ask(entry({ elementId: 'y', tag: 'textarea', label: '   ' })), []);
});

test('the safety filter is re-applied as a backstop (section heading, options)', () => {
  const inEeo = { elementId: 'e', tag: 'textarea', type: 'textarea', label: 'Please explain', sectionHeading: 'Voluntary Self-Identification of Disability' };
  const legal = { elementId: 'l', tag: 'input', type: 'text', label: 'Are you eligible to work in the United States?' };
  assert.deepEqual(ask(entry(inEeo), entry(legal)), []);
});

test('fields skipped for any other reason are not questions', () => {
  const d = { elementId: 'g', tag: 'textarea', type: 'textarea', label: 'Anything' };
  assert.deepEqual(ask(entry(d, { skipReason: 'EEOC/demographic field — protected' })), []);
  assert.deepEqual(ask(entry(d, { action: 'fill', skipReason: null })), []);
});
