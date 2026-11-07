'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTimeline } = require('../dashboard/src/lib/timeline');

const base = { discoveredAt: '2026-11-05T08:00:00Z' };

test('a discovered job has only its first step done', () => {
  const t = buildTimeline({ ...base, status: 'Discovered', application: null });
  assert.deepEqual(t.map(s => s.key), ['discovered', 'queued', 'filling', 'review', 'applied']);
  assert.deepEqual(t.map(s => s.state), ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(t[0].at, '2026-11-05T08:00:00Z');
});

test('a job in review marks earlier steps done and uses the known timestamps', () => {
  const t = buildTimeline({
    ...base, status: 'awaiting_review',
    application: { status: 'awaiting_review', started_at: '2026-11-05T09:00:00Z', completed_at: '2026-11-05T09:02:00Z', status_updated_at: '2026-11-05T09:02:00Z' },
  });
  assert.deepEqual(t.map(s => s.state), ['done', 'done', 'done', 'current', 'upcoming']);
  assert.equal(t[2].at, '2026-11-05T09:00:00Z');
  assert.equal(t[3].at, '2026-11-05T09:02:00Z');
});

test('a submitted job is complete', () => {
  const t = buildTimeline({ ...base, status: 'submitted', application: { status: 'submitted', status_updated_at: '2026-11-06T09:00:00Z' } });
  assert.deepEqual(t.map(s => s.state), ['done', 'done', 'done', 'done', 'done']);
  assert.equal(t[4].at, '2026-11-06T09:00:00Z');
});

test('a failed job shows a failure step after the last step it reached, with the error', () => {
  const t = buildTimeline({
    ...base, status: 'failed',
    application: { status: 'failed', started_at: '2026-11-05T09:00:00Z', status_updated_at: '2026-11-05T09:01:00Z', error_message: 'Timeout' },
  });
  assert.deepEqual(t.map(s => s.key), ['discovered', 'queued', 'filling', 'failed']);
  assert.deepEqual(t.map(s => s.state), ['done', 'done', 'done', 'failed']);
  assert.equal(t[3].detail, 'Timeout');
  assert.equal(t[3].at, '2026-11-05T09:01:00Z');
});

test('a job that failed before the browser started stops after Queued', () => {
  const t = buildTimeline({ ...base, status: 'failed', application: { status: 'failed', error_message: null } });
  assert.deepEqual(t.map(s => s.key), ['discovered', 'queued', 'failed']);
});
