'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueue } = require('../src/queue/applicationQueue');

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const tick = () => new Promise(resolve => setImmediate(resolve));

/** Store whose fetchPending walks a fixed script of results. */
function scriptedStore(script, { claim = async () => true } = {}) {
  const calls = { fetch: 0, claimed: [], failed: [], unsubscribed: 0 };
  let subscriber = null;
  return {
    calls,
    emit: () => subscriber && subscriber(),
    fetchPending: async () => { calls.fetch++; return script.length ? script.shift() : null; },
    claim: async (id) => { calls.claimed.push(id); return claim(id); },
    markFailed: async (id, message) => { calls.failed.push({ id, message }); },
    subscribe: (cb) => { subscriber = cb; return () => { calls.unsubscribed++; subscriber = null; }; },
  };
}

const item = (id) => ({ id, listings: { title: `job ${id}` } });

test('two simultaneous triggers run a single pending application once', async () => {
  const store = scriptedStore([item('a')]);
  const ran = [];
  const q = createQueue({ store, runApply: async (r) => { ran.push(r.id); await tick(); }, log: silent });
  await Promise.all([q.trigger(), q.trigger()]);
  assert.deepEqual(ran, ['a']);
});

test('a lost claim does not run the application', async () => {
  const store = scriptedStore([item('a')], { claim: async () => false });
  const ran = [];
  const q = createQueue({ store, runApply: async (r) => { ran.push(r.id); }, log: silent });
  await q.trigger();
  assert.deepEqual(ran, []);
});

test('a failing runApply is marked failed and the next item still runs', async () => {
  const store = scriptedStore([item('a'), item('b')]);
  const ran = [];
  const q = createQueue({
    store,
    runApply: async (r) => { ran.push(r.id); if (r.id === 'a') throw new Error('browser crashed'); },
    log: silent,
  });
  await q.trigger();
  assert.deepEqual(ran, ['a', 'b']);
  assert.deepEqual(store.calls.failed, [{ id: 'a', message: 'browser crashed' }]);
});

test('an item queued during a run is picked up by the follow-up pass', async () => {
  // Script: item a, then empty (loop would stop), then item b appears after the kick.
  const store = scriptedStore([item('a'), null, item('b'), null]);
  const ran = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const q = createQueue({
    store,
    runApply: async (r) => { ran.push(r.id); if (r.id === 'a') await gate; },
    log: silent,
  });
  const first = q.trigger();
  await tick();
  const second = q.trigger(); // arrives mid-run
  release();
  await Promise.all([first, second]);
  assert.deepEqual(ran, ['a', 'b']);
});

test('a throwing fetchPending is swallowed and the queue stays usable', async () => {
  const store = scriptedStore([]);
  let fail = true;
  store.fetchPending = async () => { if (fail) { fail = false; throw new Error('network'); } return null; };
  const q = createQueue({ store, runApply: async () => {}, log: silent });
  await q.trigger();
  await q.trigger();
});

test('start subscribes, polls every 30s by default, and reacts to subscription events', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const store = scriptedStore([]);
  const q = createQueue({ store, runApply: async () => {}, log: silent });
  q.start();
  await tick();
  const afterStart = store.calls.fetch;
  assert.ok(afterStart >= 1, 'start triggers an initial pass');

  t.mock.timers.tick(29999);
  await tick();
  assert.equal(store.calls.fetch, afterStart, 'no poll before 30s');
  t.mock.timers.tick(1);
  await tick();
  assert.equal(store.calls.fetch, afterStart + 1, 'poll fires at 30s');

  store.emit();
  await tick();
  assert.equal(store.calls.fetch, afterStart + 2, 'subscription event triggers a pass');
  q.stop();
});

test('stop unsubscribes and the interval no longer fires', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const store = scriptedStore([]);
  const q = createQueue({ store, runApply: async () => {}, log: silent });
  q.start();
  await tick();
  q.stop();
  const before = store.calls.fetch;
  t.mock.timers.tick(120000);
  await tick();
  assert.equal(store.calls.fetch, before);
  assert.equal(store.calls.unsubscribed, 1);
});
