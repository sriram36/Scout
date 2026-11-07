'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { useTestProfile } = require('./helpers/testProfile');

test('SCOUT_PROFILE_PATH makes the profile loader use that file instead of the real profile.json', () => {
  const { resumePath } = useTestProfile();
  const { getProfile } = require('../src/config/profile');
  const profile = getProfile();
  assert.equal(profile.personal.email, 'test.candidate@example.com');
  assert.equal(profile.resume.defaultPath, resumePath);
});
