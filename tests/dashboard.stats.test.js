'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeFunnel, discoveredPerDay, bySource, fillCoverage } = require('../dashboard/src/lib/stats');

const job = (status, extra = {}) => ({ id: Math.random().toString(36), status, source: 'LinkedIn', ...extra });

test('computeFunnel counts each stage cumulatively', () => {
  const jobs = [
    job('Discovered'), job('Discovered'), job('pending_application'), job('applying'),
    job('awaiting_review'), job('autofill_completed'), job('submitted'), job('failed'),
  ];
  assert.deepEqual(computeFunnel(jobs), {
    total: 8,       // everything Scout found
    queued: 6,      // reached the queue (including failed attempts)
    filled: 3,      // review + applied
    applied: 1,
    attention: 1,
    review: 2,
    inFlight: 2,    // queued + filling
  });
});

test('computeFunnel on an empty list is all zeros', () => {
  assert.deepEqual(computeFunnel([]), { total: 0, queued: 0, filled: 0, applied: 0, attention: 0, review: 0, inFlight: 0 });
});

test('discoveredPerDay returns one bucket per local day, oldest first, ending today', () => {
  const now = new Date(2026, 10, 7, 15, 0);          // 7 Nov 2026, local
  const jobs = [
    job('Discovered', { discoveredAt: new Date(2026, 10, 7, 9).toISOString() }),
    job('Discovered', { discoveredAt: new Date(2026, 10, 7, 1).toISOString() }),
    job('Discovered', { discoveredAt: new Date(2026, 10, 5, 23).toISOString() }),
    job('Discovered', { discoveredAt: new Date(2026, 9, 1).toISOString() }),   // outside the window
    job('Discovered', { discoveredAt: null }),
  ];
  const days = discoveredPerDay(jobs, now, 14);
  assert.equal(days.length, 14);
  assert.equal(days[13].date, '2026-11-07');
  assert.equal(days[0].date, '2026-10-25');
  assert.equal(days[13].count, 2);
  assert.equal(days[11].count, 1);
  assert.equal(days.reduce((s, d) => s + d.count, 0), 3);
});

test('bySource sorts by count, then name, and folds the tail into Other', () => {
  const jobs = [
    ...Array(4).fill(0).map(() => job('Discovered', { source: 'LinkedIn' })),
    ...Array(2).fill(0).map(() => job('Discovered', { source: 'Wellfound' })),
    ...Array(2).fill(0).map(() => job('Discovered', { source: 'Greenhouse' })),
    job('Discovered', { source: 'Naukri' }),
    job('Discovered', { source: 'Internshala' }),
    job('Discovered', { source: '' }),
  ];
  assert.deepEqual(bySource(jobs, 3), [
    { source: 'LinkedIn', count: 4 },
    { source: 'Greenhouse', count: 2 },
    { source: 'Wellfound', count: 2 },
    { source: 'Other', count: 3 },
  ]);
  assert.deepEqual(bySource([], 3), []);
});

test('fillCoverage sums detected and filled fields across applications', () => {
  const jobs = [
    job('awaiting_review', { application: { fields_detected: 10, fields_filled: 8 } }),
    job('submitted', { application: { fields_detected: 10, fields_filled: 10 } }),
    job('pending_application', { application: { fields_detected: 0, fields_filled: 0 } }),
    job('Discovered', { application: null }),
  ];
  assert.deepEqual(fillCoverage(jobs), { detected: 20, filled: 18, ratio: 0.9, applications: 2 });
  assert.deepEqual(fillCoverage([]), { detected: 0, filled: 0, ratio: 0, applications: 0 });
});

const { pipelineSummary } = require('../dashboard/src/lib/stats');

test('pipelineSummary leads with what needs the user, in plain language', () => {
  assert.equal(pipelineSummary([job('awaiting_review'), job('autofill_completed'), job('failed')]),
    '2 applications are ready for your review and 1 needs attention.');
  assert.equal(pipelineSummary([job('awaiting_review')]), '1 application is ready for your review.');
  assert.equal(pipelineSummary([job('failed'), job('failed')]), '2 applications need attention.');
  assert.equal(pipelineSummary([job('applying'), job('Discovered')]), 'Scout is working on 1 application. 1 new role is waiting.');
  assert.equal(pipelineSummary([job('Discovered'), job('Discovered')]), '2 new roles are waiting for you to queue them.');
  assert.equal(pipelineSummary([job('submitted')]), 'You are all caught up.');
  assert.equal(pipelineSummary([]), 'No roles yet. Scout adds them here as it finds them.');
});
