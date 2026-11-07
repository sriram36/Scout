'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeListing, normalizeReport, applyRealtimeChange } = require('../dashboard/src/lib/normalize');

const row = {
  id: 'L1', title: 'SDE Intern', company: 'Stripe', location: null, salary: null, source: 'LinkedIn',
  description: 'Build things', apply_url: 'https://boards.greenhouse.io/stripe/jobs/1', canonical_url: 'https://x/1',
  posted_date: '2026-11-01', discovered_at: '2026-11-06T10:00:00Z', is_internship: true,
  applications: { id: 'A1', status: 'awaiting_review', ats_platform: 'greenhouse', fields_filled: 9 },
};

test('normalizeListing reads the embedded application object (unique FK → one object)', () => {
  const job = normalizeListing(row);
  assert.equal(job.id, 'L1');
  assert.equal(job.status, 'awaiting_review');
  assert.equal(job.application.id, 'A1');
  assert.equal(job.url, 'https://boards.greenhouse.io/stripe/jobs/1');
  assert.equal(job.isInternship, true);
  assert.equal(job.discoveredAt, '2026-11-06T10:00:00Z');
});

test('normalizeListing fills sensible defaults and treats a missing application as Discovered', () => {
  const job = normalizeListing({ id: 'L2', applications: null });
  assert.equal(job.title, 'Untitled role');
  assert.equal(job.company, 'Unknown company');
  assert.equal(job.location, 'Location not listed');
  assert.equal(job.source, 'Unknown');
  assert.equal(job.status, 'Discovered');
  assert.equal(job.application, null);
  assert.equal(job.url, null);
  assert.equal(job.isInternship, false);
});

test('normalizeListing still accepts an array embed', () => {
  assert.equal(normalizeListing({ ...row, applications: [{ id: 'A9', status: 'failed' }] }).status, 'failed');
});

test('normalizeReport coerces counts and tolerates reports without details', () => {
  const r = normalizeReport({ total: 5, filled: '3', skipped: 2, stageBreakdown: { deterministic: 3 } });
  assert.equal(r.total, 5);
  assert.equal(r.filled, 3);
  assert.equal(r.errors, 0);
  assert.equal(r.aiGenerated, 0);
  assert.deepEqual(r.stageBreakdown, { learned: 0, deterministic: 3, semantic: 0, llm: 0 });
  assert.deepEqual(r.details, { filled: [], skipped: [], errors: [] });
  assert.equal(r.hasDetails, false);
});

test('normalizeReport keeps detail arrays and returns null for no report', () => {
  const r = normalizeReport({ total: 1, filled: 1, details: { filled: [{ field: 'email', meaning: 'personal.email' }] } });
  assert.equal(r.hasDetails, true);
  assert.equal(r.details.filled.length, 1);
  assert.deepEqual(r.details.skipped, []);
  assert.equal(normalizeReport(null), null);
  assert.equal(normalizeReport('nope'), null);
});

test('applyRealtimeChange patches the matching listing on INSERT/UPDATE', () => {
  const jobs = [normalizeListing(row), normalizeListing({ id: 'L2', applications: null })];
  const inserted = applyRealtimeChange(jobs, {
    eventType: 'INSERT', new: { id: 'A2', listing_id: 'L2', status: 'pending_application' }, old: {},
  });
  assert.equal(inserted[1].status, 'pending_application');
  assert.equal(inserted[1].application.id, 'A2');
  assert.equal(inserted[0], jobs[0], 'untouched jobs keep identity');

  const updated = applyRealtimeChange(jobs, {
    eventType: 'UPDATE', new: { id: 'A1', listing_id: 'L1', status: 'submitted' }, old: { id: 'A1' },
  });
  assert.equal(updated[0].status, 'submitted');
  assert.equal(updated[0].application.ats_platform, 'greenhouse', 'merges rather than replaces');
});

test('applyRealtimeChange removes the application on DELETE and ignores unknown listings', () => {
  const jobs = [normalizeListing(row)];
  const deleted = applyRealtimeChange(jobs, { eventType: 'DELETE', new: {}, old: { id: 'A1' } });
  assert.equal(deleted[0].status, 'Discovered');
  assert.equal(deleted[0].application, null);
  const same = applyRealtimeChange(jobs, { eventType: 'UPDATE', new: { id: 'Z', listing_id: 'nope', status: 'failed' }, old: {} });
  assert.equal(same, jobs);
});

test('normalizeReport carries the adapter note and accepts a note-only report', () => {
  assert.equal(normalizeReport({ total: 3, note: 'Stopped before "Submit"' }).note, 'Stopped before "Submit"');
  const noteOnly = normalizeReport({ note: 'Sign in first' });
  assert.equal(noteOnly.note, 'Sign in first');
  assert.equal(noteOnly.total, 0);
  assert.equal(normalizeReport({ total: 1, note: 42 }).note, null);
  assert.equal(normalizeReport({ total: 1 }).note, null);
});

// ── applications must stay visible even when their listing is older than the first page ──
const { mergeListings } = require('../dashboard/src/lib/normalize');
const job = (id, discoveredAt, extra = {}) => ({ id, discoveredAt, status: 'Discovered', application: null, ...extra });

test('mergeListings adds a listing that is outside the page, in discovery order', () => {
  const page = [job('new', '2026-11-06'), job('mid', '2026-11-03')];
  const old = job('old', '2026-09-01', { status: 'awaiting_review', application: { id: 'A' } });
  assert.deepEqual(mergeListings(page, [old]).map(j => j.id), ['new', 'mid', 'old']);
});

test('mergeListings never duplicates a listing that is in both, and keeps the page copy', () => {
  const page = [job('a', '2026-11-06', { status: 'submitted' })];
  const merged = mergeListings(page, [job('a', '2026-11-06', { status: 'stale' })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'submitted');
});

test('mergeListings puts listings with no discovery date last and does not mutate its inputs', () => {
  const page = [job('a', '2026-11-06')];
  const extra = [job('undated', null), job('b', '2026-10-01')];
  const out = mergeListings(page, extra);
  assert.deepEqual(out.map(j => j.id), ['a', 'b', 'undated']);
  assert.deepEqual(page.map(j => j.id), ['a']);
  assert.deepEqual(extra.map(j => j.id), ['undated', 'b']);
});
