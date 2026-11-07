'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUSES, LANES, laneForStatus, groupByLane, availableActions, planStatusChange, statusLabel,
} = require('../dashboard/src/lib/pipeline');

test('the status set is exactly the one the database allows', () => {
  assert.deepEqual([...STATUSES].sort(), [
    'Discovered', 'application_opened', 'applying', 'autofill_completed', 'awaiting_review',
    'failed', 'form_analyzed', 'pending_application', 'submitted',
  ].sort());
});

test('lanes run Discovered → Queued → Filling → Review → Applied, then Needs attention', () => {
  assert.deepEqual(LANES.map(l => l.id), ['discovered', 'queued', 'filling', 'review', 'applied', 'attention']);
  assert.deepEqual(LANES.map(l => l.label), ['Discovered', 'Queued', 'Filling', 'Review', 'Applied', 'Needs attention']);
});

test('every status maps to exactly one lane', () => {
  for (const status of STATUSES) {
    const owners = LANES.filter(l => l.statuses.includes(status));
    assert.equal(owners.length, 1, status);
    assert.equal(laneForStatus(status), owners[0].id);
  }
});

test('status → lane mapping follows the agreed contract', () => {
  assert.equal(laneForStatus('Discovered'), 'discovered');
  assert.equal(laneForStatus(null), 'discovered');
  assert.equal(laneForStatus(undefined), 'discovered');
  assert.equal(laneForStatus('pending_application'), 'queued');
  assert.equal(laneForStatus('applying'), 'filling');
  assert.equal(laneForStatus('application_opened'), 'filling');
  assert.equal(laneForStatus('form_analyzed'), 'filling');
  assert.equal(laneForStatus('autofill_completed'), 'review');
  assert.equal(laneForStatus('awaiting_review'), 'review');
  assert.equal(laneForStatus('submitted'), 'applied');
  assert.equal(laneForStatus('failed'), 'attention');
});

test('an unknown status lands in Needs attention rather than offering Auto-fill', () => {
  assert.equal(laneForStatus('something_new'), 'attention');
});

test('groupByLane buckets jobs by status and keeps their order', () => {
  const jobs = [
    { id: 'a', status: 'Discovered' }, { id: 'b', status: 'failed' },
    { id: 'c', status: 'Discovered' }, { id: 'd', status: 'awaiting_review' },
  ];
  const groups = groupByLane(jobs);
  assert.deepEqual(Object.keys(groups), LANES.map(l => l.id));
  assert.deepEqual(groups.discovered.map(j => j.id), ['a', 'c']);
  assert.deepEqual(groups.review.map(j => j.id), ['d']);
  assert.deepEqual(groups.attention.map(j => j.id), ['b']);
  assert.deepEqual(groups.applied, []);
});

test('statusLabel gives a readable label and falls back to the raw status', () => {
  assert.equal(statusLabel('awaiting_review'), 'Ready for review');
  assert.equal(statusLabel('Discovered'), 'New');
  assert.equal(statusLabel('weird'), 'weird');
});

test('availableActions offers the right buttons per stage', () => {
  assert.deepEqual(availableActions('Discovered'), ['autofill']);
  assert.deepEqual(availableActions('failed'), ['retry', 'dismiss']);
  assert.deepEqual(availableActions('awaiting_review'), ['submit']);
  assert.deepEqual(availableActions('autofill_completed'), ['submit']);
  assert.deepEqual(availableActions('pending_application'), []);
  assert.deepEqual(availableActions('applying'), []);
  assert.deepEqual(availableActions('submitted'), []);
});

const NOW = '2026-11-07T10:00:00.000Z';
const INSERTABLE = ['listing_id', 'status', 'status_updated_at'];
const UPDATABLE = ['status', 'status_updated_at', 'error_message'];
const UPDATE_TARGETS = ['pending_application', 'Discovered', 'submitted'];

test('auto-fill without an application inserts a pending_application row with only insertable columns', () => {
  const plan = planStatusChange('autofill', { listingId: 'L1', applicationId: null }, NOW);
  assert.deepEqual(plan, {
    kind: 'insert',
    values: { listing_id: 'L1', status: 'pending_application', status_updated_at: NOW },
  });
  assert.ok(Object.keys(plan.values).every(k => INSERTABLE.includes(k)));
});

test('auto-fill with an existing application updates it instead (avoids the 409 unique conflict)', () => {
  const plan = planStatusChange('autofill', { listingId: 'L1', applicationId: 'A1' }, NOW);
  assert.equal(plan.kind, 'update');
  assert.equal(plan.id, 'A1');
  assert.equal(plan.values.status, 'pending_application');
});

test('retry re-queues and clears the error; dismiss returns to Discovered; submit marks submitted', () => {
  assert.deepEqual(planStatusChange('retry', { listingId: 'L1', applicationId: 'A1' }, NOW), {
    kind: 'update', id: 'A1',
    values: { status: 'pending_application', status_updated_at: NOW, error_message: null },
  });
  assert.deepEqual(planStatusChange('dismiss', { listingId: 'L1', applicationId: 'A1' }, NOW).values,
    { status: 'Discovered', status_updated_at: NOW, error_message: null });
  assert.deepEqual(planStatusChange('submit', { listingId: 'L1', applicationId: 'A1' }, NOW).values,
    { status: 'submitted', status_updated_at: NOW });
});

test('every planned update writes only permitted columns and permitted statuses', () => {
  for (const action of ['autofill', 'retry', 'dismiss', 'submit']) {
    const plan = planStatusChange(action, { listingId: 'L1', applicationId: 'A1' }, NOW);
    assert.equal(plan.kind, 'update');
    assert.ok(Object.keys(plan.values).every(k => UPDATABLE.includes(k)), action);
    assert.ok(UPDATE_TARGETS.includes(plan.values.status), action);
  }
});

test('actions that need an application row refuse to run without one', () => {
  for (const action of ['retry', 'dismiss', 'submit']) {
    assert.throws(() => planStatusChange(action, { listingId: 'L1', applicationId: null }, NOW), /application/i);
  }
  assert.throws(() => planStatusChange('launch-rockets', { listingId: 'L1', applicationId: 'A1' }, NOW), /unknown action/i);
});
