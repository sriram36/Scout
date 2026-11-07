'use strict';

/**
 * Application queue
 *
 * Feeds pending applications to runApply one at a time. Triggered by a Realtime
 * subscription (fast path) and a slow interval (fallback). All triggers go through
 * one in-process lock so an application is never run twice.
 *
 * store = {
 *   fetchPending(): Promise<object|null>,
 *   claim(id): Promise<boolean>,
 *   markFailed(id, message): Promise<void>,
 *   subscribe(onPending): () => void,
 * }
 */

function createQueue({ store, runApply, log = require('../logger'), intervalMs = 30000 }) {
  let running = null;
  let again = false;
  let timer = null;
  let unsubscribe = null;

  /** @returns {Promise<boolean>} true if an item was handled and the loop should continue */
  async function processOne() {
    let record;
    try {
      record = await store.fetchPending();
    } catch (e) {
      log.warn('Could not fetch pending applications', { error: e.message });
      return false;
    }
    if (!record) return false;

    let claimed;
    try {
      claimed = await store.claim(record.id);
    } catch (e) {
      log.warn('Could not claim application', { id: record.id, error: e.message });
      return false;
    }
    if (!claimed) return false;

    log.info('Picked up pending application', { id: record.id, title: record.listings?.title });
    try {
      await runApply(record);
    } catch (e) {
      log.error('Application pipeline failed', { id: record.id, error: e.message });
      try {
        await store.markFailed(record.id, e.message);
      } catch (markErr) {
        log.error('Could not mark application failed', { id: record.id, error: markErr.message });
      }
    }
    return true;
  }

  function trigger() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          while (await processOne()) { /* drain */ }
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  function start() {
    try {
      unsubscribe = store.subscribe(() => { trigger(); });
    } catch (e) {
      // e.g. Node < 22 has no native WebSocket; the fallback poll still picks work up.
      log.warn('Realtime unavailable — relying on the fallback poll', { error: e.message });
    }
    timer = setInterval(() => { trigger(); }, intervalMs);
    trigger();
  }

  function stop() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { trigger, start, stop };
}

module.exports = { createQueue };
