'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { useTestProfile } = require('./helpers/testProfile');

useTestProfile({
  experience: [
    { company: 'Acme Corp', role: 'Software Engineering Intern', startDate: 'June 2024', endDate: 'August 2024' },
    { company: 'Older Co', role: 'Support Engineer', startDate: 'Jan 2023', endDate: 'May 2023' },
  ],
});
const { resolveValue } = require('../src/engine/fieldMatcher');

test('experience.current.* resolves to the most recent experience entry', () => {
  assert.equal(resolveValue('experience.current.company'), 'Acme Corp');
  assert.equal(resolveValue('experience.current.role'), 'Software Engineering Intern');
});

test('plain profile paths and the virtual full name still resolve', () => {
  assert.equal(resolveValue('personal.email'), 'test.candidate@example.com');
  assert.equal(resolveValue('personal.fullName'), 'Test Candidate');
  assert.equal(resolveValue('personal.nonexistent'), null);
});
