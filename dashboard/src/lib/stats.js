/**
 * Numbers for the stats row. All functions are pure and work on normalized jobs.
 */

const { laneForStatus } = require('./pipeline');
const { dayKey, toDate } = require('./time');

/**
 * @typedef {{ total: number, queued: number, filled: number, applied: number, attention: number, review: number, inFlight: number }} Funnel
 */

/**
 * Cumulative funnel: everything found → reached the queue → filled → applied.
 * @param {{ status: string }[]} jobs
 * @returns {Funnel}
 */
function computeFunnel(jobs) {
  const f = { total: jobs.length, queued: 0, filled: 0, applied: 0, attention: 0, review: 0, inFlight: 0 };
  for (const job of jobs) {
    const lane = laneForStatus(job.status);
    if (lane !== 'discovered') f.queued += 1;
    if (lane === 'review' || lane === 'applied') f.filled += 1;
    if (lane === 'applied') f.applied += 1;
    if (lane === 'review') f.review += 1;
    if (lane === 'attention') f.attention += 1;
    if (lane === 'queued' || lane === 'filling') f.inFlight += 1;
  }
  return f;
}

/**
 * Listings discovered per local day for the last `days` days, oldest first, ending today.
 * @param {{ discoveredAt?: string | null }[]} jobs
 * @param {Date} [now]
 * @param {number} [days]
 * @returns {{ date: string, count: number }[]}
 */
function discoveredPerDay(jobs, now = new Date(), days = 14) {
  /** @type {{ date: string, count: number }[]} */
  const buckets = [];
  /** @type {Map<string, { date: string, count: number }>} */
  const index = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12);
    const bucket = { date: dayKey(d), count: 0 };
    buckets.push(bucket);
    index.set(bucket.date, bucket);
  }
  for (const job of jobs) {
    const d = toDate(job.discoveredAt);
    if (!d) continue;
    const bucket = index.get(dayKey(d));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

/**
 * Listings per source, biggest first (ties by name), with the tail folded into "Other".
 * @param {{ source?: string | null }[]} jobs
 * @param {number} [limit]
 * @returns {{ source: string, count: number }[]}
 */
function bySource(jobs, limit = 5) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const job of jobs) {
    const key = (job.source || '').trim() || 'Other';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const named = [...counts.entries()]
    .filter(([source]) => source !== 'Other')
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  const head = named.slice(0, limit);
  const other = named.slice(limit).reduce((s, x) => s + x.count, 0) + (counts.get('Other') || 0);
  return other > 0 ? [...head, { source: 'Other', count: other }] : head;
}

/**
 * How many detected form fields Scout filled, across applications that detected any.
 * @param {{ application?: { fields_detected?: number | null, fields_filled?: number | null } | null }[]} jobs
 * @returns {{ detected: number, filled: number, ratio: number, applications: number }}
 */
function fillCoverage(jobs) {
  let detected = 0, filled = 0, applications = 0;
  for (const job of jobs) {
    const app = job.application;
    const d = Number(app && app.fields_detected) || 0;
    if (d <= 0) continue;
    detected += d;
    filled += Number(app && app.fields_filled) || 0;
    applications += 1;
  }
  return { detected, filled, ratio: detected ? filled / detected : 0, applications };
}

/**
 * One sentence for the page header that leads with what needs the user.
 * @param {{ status: string }[]} jobs
 * @returns {string}
 */
function pipelineSummary(jobs) {
  const f = computeFunnel(jobs);
  const discovered = f.total - f.queued;
  const apps = (/** @type {number} */ n) => `${n} application${n === 1 ? '' : 's'}`;
  const roles = (/** @type {number} */ n) => `${n} new role${n === 1 ? '' : 's'}`;
  const be = (/** @type {number} */ n) => (n === 1 ? 'is' : 'are');
  const need = (/** @type {number} */ n) => (n === 1 ? 'needs' : 'need');

  if (f.review && f.attention) return `${apps(f.review)} ${be(f.review)} ready for your review and ${f.attention} ${need(f.attention)} attention.`;
  if (f.review) return `${apps(f.review)} ${be(f.review)} ready for your review.`;
  if (f.attention) return `${apps(f.attention)} ${need(f.attention)} attention.`;
  if (f.inFlight) return `Scout is working on ${apps(f.inFlight)}.${discovered ? ` ${roles(discovered)} ${be(discovered)} waiting.` : ''}`;
  if (discovered) return `${roles(discovered)} ${be(discovered)} waiting for you to queue ${discovered === 1 ? 'it' : 'them'}.`;
  if (f.total) return 'You are all caught up.';
  return 'No roles yet. Scout adds them here as it finds them.';
}

module.exports = { computeFunnel, discoveredPerDay, bySource, fillCoverage, pipelineSummary };
