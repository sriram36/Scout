'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDemoListings, nextDemoStatus, DEMO_PROFILE } = require('../dashboard/src/lib/demoData');
const { STATUSES, laneForStatus, LANES } = require('../dashboard/src/lib/pipeline');
const { normalizeListing, normalizeReport } = require('../dashboard/src/lib/normalize');
const { resolveMode } = require('../dashboard/src/lib/mode');

const NOW = new Date(2026, 10, 7, 12);
const LISTING_KEYS = ['id', 'title', 'company', 'location', 'salary', 'source', 'description', 'apply_url',
  'canonical_url', 'posted_date', 'discovered_at', 'is_internship', 'applications'];
const APP_KEYS = new Set(['id', 'listing_id', 'status', 'status_updated_at', 'ats_platform', 'started_at', 'completed_at',
  'fields_detected', 'fields_filled', 'fields_skipped', 'ai_questions_answered', 'fill_report', 'error_message', 'notes']);

test('demo data has around two dozen listings with unique ids in the Supabase row shape', () => {
  const rows = buildDemoListings(NOW);
  assert.ok(rows.length >= 20 && rows.length <= 30, `got ${rows.length}`);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  for (const r of rows) {
    assert.deepEqual(Object.keys(r).sort(), [...LISTING_KEYS].sort(), r.id);
    assert.ok(r.applications === null || (typeof r.applications === 'object' && !Array.isArray(r.applications)),
      'applications embeds as one object or null');
  }
});

test('demo applications only use allowed statuses and columns', () => {
  for (const r of buildDemoListings(NOW)) {
    if (!r.applications) continue;
    assert.ok(STATUSES.includes(r.applications.status), r.applications.status);
    for (const k of Object.keys(r.applications)) assert.ok(APP_KEYS.has(k), k);
    assert.equal(r.applications.listing_id, r.id);
  }
});

test('demo data covers every lane, including a failure with an error message', () => {
  const jobs = buildDemoListings(NOW).map(normalizeListing);
  const lanes = new Set(jobs.map(j => laneForStatus(j.status)));
  for (const lane of LANES) assert.ok(lanes.has(lane.id), lane.id);
  const failed = jobs.find(j => j.status === 'failed');
  assert.ok(failed.application.error_message);
});

test('at least one demo application has a rich fill report with filled, skipped and error details', () => {
  const rich = buildDemoListings(NOW)
    .map(r => normalizeReport(r.applications && r.applications.fill_report))
    .find(r => r && r.details.filled.length && r.details.skipped.length && r.details.errors.length);
  assert.ok(rich, 'no rich report');
  assert.ok(rich.details.skipped.some(s => s.signature), 'a skipped field can be taught');
  for (const k of ['total', 'filled', 'skipped', 'errors', 'aiGenerated']) assert.ok(Number.isInteger(rich[k]), k);
  assert.equal(rich.filled, rich.details.filled.length);
  assert.equal(rich.skipped, rich.details.skipped.length);
  assert.equal(rich.errors, rich.details.errors.length);
});

test('demo discoveries fall within the last two weeks and are deterministic', () => {
  const a = buildDemoListings(NOW), b = buildDemoListings(NOW);
  assert.deepEqual(a, b);
  for (const r of a) {
    const age = NOW.getTime() - new Date(r.discovered_at).getTime();
    assert.ok(age >= 0 && age < 14 * 86_400_000, r.id);
  }
});

test('demo profile has no email or phone', () => {
  assert.ok(DEMO_PROFILE.name);
  assert.equal(DEMO_PROFILE.email, undefined);
  assert.equal(DEMO_PROFILE.phone, undefined);
});

test('nextDemoStatus walks a queued application through to review', () => {
  assert.equal(nextDemoStatus('pending_application'), 'applying');
  assert.equal(nextDemoStatus('applying'), 'form_analyzed');
  assert.equal(nextDemoStatus('form_analyzed'), 'awaiting_review');
  assert.equal(nextDemoStatus('awaiting_review'), null);
});

test('resolveMode: demo wins via env or ?demo=1, otherwise live needs both Supabase vars', () => {
  assert.equal(resolveMode({ demoEnv: 'true', search: '', supabaseUrl: '', supabaseKey: '' }), 'demo');
  assert.equal(resolveMode({ demoEnv: '', search: '?demo=1', supabaseUrl: 'u', supabaseKey: 'k' }), 'demo');
  assert.equal(resolveMode({ demoEnv: '', search: '?x=2&demo=1', supabaseUrl: '', supabaseKey: '' }), 'demo');
  assert.equal(resolveMode({ demoEnv: '', search: '?demo=0', supabaseUrl: 'u', supabaseKey: 'k' }), 'live');
  assert.equal(resolveMode({ demoEnv: 'false', search: '', supabaseUrl: 'u', supabaseKey: '' }), 'unconfigured');
  assert.equal(resolveMode({}), 'unconfigured');
});
