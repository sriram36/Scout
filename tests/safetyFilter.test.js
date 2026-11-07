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

test('more legal-status and eligibility phrasings are blocked', () => {
  for (const label of [
    'Are you eligible to work in the United States?',
    'Do you have a green card?',
    'Will you require H-1B status?',
    'Are you on OPT or CPT?',
    'Are you a permanent resident?',
    'Are you a U.S. person as defined by ITAR?',
    'Do you consent to a background check?',
    'Have you ever been found guilty of a misdemeanor?',
    'Employment eligibility',
  ]) {
    assert.equal(blocked(label), true, label);
  }
});

test('word boundaries stop ordinary labels being over-blocked, but real ones still match', () => {
  for (const label of ['Message to hiring manager', 'Homepage', 'Usage notes', 'Mileage', 'Trace your journey', 'Preferred language', 'Essex address line']) {
    assert.equal(blocked(label), false, label);
  }
  for (const label of ['Age', 'Your age', 'Race', 'Sex', 'Visa status']) {
    assert.equal(blocked(label), true, label);
  }
});

test('the section a field sits in protects it: a Name field under a disability self-identification heading', () => {
  assert.equal(shouldNeverTouch({ label: 'Name', sectionHeading: 'Voluntary Self-Identification of Disability' }), true);
  assert.equal(shouldNeverTouch({ label: 'Date', sectionHeading: 'Equal Employment Opportunity' }), true);
  assert.equal(shouldNeverTouch({ label: 'Yes', type: 'radio', sectionHeading: 'Work authorization' }), true);
});

test('ordinary section headings do not over-block, even ones containing risky substrings', () => {
  for (const heading of ['Contact information', 'Education', 'Application Questions', 'Manage your application', 'Your data is protected', 'Language skills']) {
    assert.equal(shouldNeverTouch({ label: 'First Name', sectionHeading: heading }), false, heading);
  }
});

test('radio and select options reveal demographic questions even when the label is just an option', () => {
  assert.equal(shouldNeverTouch({ label: 'Male', type: 'radio', options: [{ value: 'm', label: 'Male' }, { value: 'f', label: 'Female' }] }), true);
  assert.equal(shouldNeverTouch({ label: 'Select one', tag: 'select', options: [{ value: '', label: 'Select…' }, { value: '1', label: 'Hispanic or Latino' }] }), true);
  assert.equal(shouldNeverTouch({ label: 'Select one', tag: 'select', options: [{ value: '1', label: 'I do not wish to answer' }] }), true);
  assert.equal(shouldNeverTouch({ label: 'Degree', tag: 'select', options: [{ value: 'b', label: "Bachelor's Degree" }, { value: 'm', label: "Master's Degree" }] }), false);
});

test('fields about another person are never filled with the candidate\'s own details', () => {
  for (const label of ['Emergency Contact First Name', 'Reference Email', 'Next of kin', 'Referred by', 'Spouse name']) {
    assert.equal(blocked(label), true, label);
  }
  assert.equal(blocked('First Name'), false);
});

test('getSkipReason names the right category for section, option and third-party matches', () => {
  assert.equal(getSkipReason({ label: 'Name', sectionHeading: 'Voluntary Self-Identification of Disability' }), 'EEOC/demographic field — protected');
  assert.equal(getSkipReason({ label: 'Yes', type: 'radio', sectionHeading: 'Work authorization' }), 'Legal-status question — answer this yourself');
  assert.equal(getSkipReason({ label: 'Select one', options: [{ label: 'Hispanic or Latino' }] }), 'EEOC/demographic field — protected');
  assert.equal(getSkipReason({ label: 'Emergency Contact First Name' }), 'Asks about another person — fill this yourself');
});
