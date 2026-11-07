'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fieldSignature, fieldLabel, describeEntry } = require('../src/engine/fieldIdentity');
const { matchField, normalizeText } = require('../src/engine/fieldMatcher');

test('fieldSignature joins name, id and the normalised label, skipping empty parts', () => {
  assert.equal(fieldSignature({ name: 'email', id: 'em', label: 'Email Address!' }), 'email|em|email address');
  assert.equal(fieldSignature({ label: 'Cover Letter' }), 'cover letter');
  assert.equal(fieldSignature({}), '');
});

test('fieldSignature matches the key the matcher uses for learned mappings', () => {
  const d = { name: 'q1', id: 'question_1', label: 'Why do you want to work here?' };
  assert.equal(fieldSignature(d), ['q1', 'question_1', normalizeText(d.label)].join('|'));
});

test('fieldLabel prefers label, then aria-label, placeholder, name, id, then the fallback', () => {
  assert.equal(fieldLabel({ label: 'L', ariaLabel: 'A', placeholder: 'P', name: 'N', id: 'I' }, 'F'), 'L');
  assert.equal(fieldLabel({ ariaLabel: 'A', placeholder: 'P' }, 'F'), 'A');
  assert.equal(fieldLabel({ placeholder: 'P', name: 'N' }, 'F'), 'P');
  assert.equal(fieldLabel({ name: 'N', id: 'I' }, 'F'), 'N');
  assert.equal(fieldLabel({ id: 'I' }, 'F'), 'I');
  assert.equal(fieldLabel({}, 'F'), 'F');
  assert.equal(fieldLabel(undefined, 'F'), 'F');
});

test('describeEntry exposes field, label, signature and meaning for the fill report', () => {
  const entry = {
    elementId: 'el-7',
    meaning: 'unknown',
    descriptor: { name: 'q1', id: 'question_1', label: 'Why us?' },
  };
  assert.deepEqual(describeEntry(entry), {
    field: 'el-7',
    label: 'Why us?',
    signature: 'q1|question_1|why us?', // the existing normaliser keeps '?', and stored keys must not change
    meaning: 'unknown',
  });
});

test('describeEntry copes with an entry that has no descriptor', () => {
  assert.deepEqual(describeEntry({ elementId: 'el-1', meaning: 'x' }), {
    field: 'el-1', label: 'el-1', signature: '', meaning: 'x',
  });
});

test('matcher honours _knownMeaning set by an adapter (stage 1, high confidence)', async () => {
  const known = await matchField({ _knownMeaning: 'personal.email', label: 'Zzz unrecognisable' }, { useLLM: false });
  assert.equal(known.meaning, 'personal.email');
  assert.ok(known.confidence >= 0.99);
  assert.equal(known.stage, 1);

  const unknown = await matchField({ label: 'Zzz unrecognisable' }, { useLLM: false });
  assert.equal(unknown.meaning, 'unknown');
});

test('a protected field is reported without a signature, so nothing can be "taught" for it', () => {
  const entry = { elementId: 'el-g', meaning: 'protected', descriptor: { name: 'gender', id: 'g', label: 'Gender' } };
  const described = describeEntry(entry);
  assert.equal(described.signature, '');
  assert.equal(described.label, 'Gender');
});
