/**
 * Application status timeline for the detail drawer.
 * Only a few timestamps exist (discovered_at, started_at, completed_at,
 * status_updated_at), so steps without a known time have `at: null`.
 */

const { laneForStatus } = require('./pipeline');

/** @typedef {'done' | 'current' | 'upcoming' | 'failed'} StepState */
/** @typedef {{ key: string, label: string, at: string | null, state: StepState, detail?: string | null }} Step */

const STEPS = [
  { key: 'discovered', label: 'Discovered' },
  { key: 'queued', label: 'Queued for auto-fill' },
  { key: 'filling', label: 'Browser filled the form' },
  { key: 'review', label: 'Ready for your review' },
  { key: 'applied', label: 'Submitted' },
];

/**
 * @param {{ status: string, discoveredAt?: string | null, application?: any }} job
 * @returns {Step[]}
 */
function buildTimeline(job) {
  const app = job.application || {};
  const lane = laneForStatus(job.status);
  const updated = app.status_updated_at || null;

  /** @type {Record<string, string | null>} */
  const at = {
    discovered: job.discoveredAt || null,
    queued: lane === 'queued' ? updated : null,
    filling: app.started_at || null,
    review: app.completed_at || (lane === 'review' ? updated : null),
    applied: lane === 'applied' ? updated : null,
  };

  if (lane === 'attention') {
    const reached = app.started_at ? 3 : 2; // discovered, queued (+ filling if the browser started)
    /** @type {Step[]} */
    const steps = STEPS.slice(0, reached).map(s => ({ ...s, at: at[s.key], state: /** @type {StepState} */ ('done') }));
    steps.push({ key: 'failed', label: 'Failed', at: updated, state: 'failed', detail: app.error_message || null });
    return steps;
  }

  const currentIndex = STEPS.findIndex(s => s.key === lane);
  return STEPS.map((s, i) => ({
    ...s,
    at: at[s.key],
    state: lane === 'applied' || i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming',
  }));
}

module.exports = { buildTimeline };
