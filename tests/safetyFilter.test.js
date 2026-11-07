'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldNeverTouch, isTooUncertain, getSkipReason } = require('../src/engine/safetyFilter');

const blocked = (label, extra = {}) => shouldNeverTouch({ label, ...extra });

test('demographic / EEOC fields are never touched', () => {
  for (const label of ['Gender', 'What are your pronouns?', 'Race / Ethnicity', 'Veteran status', 'Disability status',
    'Date of birth', 'Hispanic or Latino', 'Sexual orientation', 'Marital status']) {
    assert.equal(blocked(label), true, label);
  }
});

test('CAPTCHA, hidden, password and invisible fields are never touched', () => {
  assert.equal(blocked('Please complete the reCAPTCHA'), true);
  assert.equal(shouldNeverTouch({ name: 'g-recaptcha-response' }), true);
  assert.equal(shouldNeverTouch({ type: 'hidden', name: 'x' }), true);
  assert.equal(shouldNeverTouch({ type: 'password', label: 'Anything' }), true);
  assert.equal(shouldNeverTouch({ label: 'Email', visible: false }), true);
});

test('security and tracking fields are never touched', () => {
  assert.equal(blocked('Password'), true);
  assert.equal(blocked('Social Security Number'), true);
  assert.equal(shouldNeverTouch({ name: 'utm_source' }), true);
  assert.equal(shouldNeverTouch({ name: 'authenticity_token' }), true);
  assert.equal(shouldNeverTouch('csrf_token'), true);
});

test('work authorization, sponsorship, citizenship and criminal-record questions are never touched', () => {
  for (const label of [
    'Are you legally authorized to work in the United States?',
    'Will you now or in the future require visa sponsorship?',
    'Do you require sponsorship for employment?',
    'Do you have the right to work in the UK?',
    'Citizenship',
    'Immigration status',
    'Have you ever been convicted of a felony?',
    'Do you have a criminal record?',
    'Do you hold an active security clearance?',
  ]) {
    assert.equal(blocked(label), true, label);
  }
});

test('ordinary application fields are not blocked', () => {
  for (const label of ['First name', 'Last name', 'Email', 'Phone', 'LinkedIn URL', 'GitHub', 'University',
    'Why do you want to work here?', 'Cover letter', 'Expected graduation year']) {
    assert.equal(blocked(label), false, label);
  }
});

test('null and empty input are not blocked', () => {
  assert.equal(shouldNeverTouch(null), false);
  assert.equal(shouldNeverTouch(undefined), false);
  assert.equal(shouldNeverTouch({}), false);
});

test('isTooUncertain uses a 0.65 threshold and treats non-numbers as uncertain', () => {
  assert.equal(isTooUncertain(0.64), true);
  assert.equal(isTooUncertain(0.65), false);
  assert.equal(isTooUncertain(1), false);
  assert.equal(isTooUncertain(undefined), true);
  assert.equal(isTooUncertain('0.9'), true);
  assert.equal(isTooUncertain(0.5, 0.4), false);
});

test('getSkipReason explains why a field was skipped', () => {
  assert.equal(getSkipReason({ label: 'Gender' }), 'EEOC/demographic field — protected');
  assert.equal(getSkipReason({ label: 'reCAPTCHA' }), 'CAPTCHA — requires human action');
  assert.equal(getSkipReason({ label: 'Password' }), 'Security field — never auto-filled');
  assert.equal(getSkipReason({ name: 'utm_source' }), 'ATS tracking field — skipped');
  assert.equal(getSkipReason({ label: 'Are you legally authorized to work in the US?' }),
    'Legal-status question — answer this yourself');
  assert.equal(getSkipReason({ label: 'First name' }), 'Safety rule matched');
});
