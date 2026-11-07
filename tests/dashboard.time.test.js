'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { relativeTime, dayKey } = require('../dashboard/src/lib/time');

const now = new Date(2026, 10, 7, 12, 0, 0);
const ago = (ms) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test('relativeTime formats recent moments compactly', () => {
  assert.equal(relativeTime(ago(10_000), now), 'just now');
  assert.equal(relativeTime(ago(5 * MIN), now), '5m ago');
  assert.equal(relativeTime(ago(3 * HOUR), now), '3h ago');
  assert.equal(relativeTime(ago(30 * HOUR), now), 'yesterday');
  assert.equal(relativeTime(ago(4 * DAY), now), '4d ago');
});

test('relativeTime falls back to a short date after a week, and handles bad input', () => {
  assert.equal(relativeTime(new Date(2026, 9, 3, 12).toISOString(), now), 'Oct 3');
  assert.equal(relativeTime(new Date(2025, 9, 3, 12).toISOString(), now), 'Oct 3, 2025');
  assert.equal(relativeTime(null, now), '');
  assert.equal(relativeTime('not a date', now), '');
});

test('relativeTime treats small clock skew into the future as just now', () => {
  assert.equal(relativeTime(new Date(now.getTime() + 20_000).toISOString(), now), 'just now');
});

test('dayKey is the local calendar date', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
