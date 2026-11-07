/**
 * Search, filtering and sorting for jobs. Pure functions over normalized jobs.
 */

const { LANES, laneForStatus } = require('./pipeline');

/**
 * @typedef {{ id: string, title: string, company: string, location?: string, source?: string,
 *             isInternship?: boolean, status: string, discoveredAt?: string | null }} SearchableJob
 */

/**
 * Subsequence match score: -1 for no match, 0 for an empty query, higher is better.
 * Contiguous runs, word starts and an early first hit all score extra.
 * @param {string} query
 * @param {string} text
 * @returns {number}
 */
function fuzzyScore(query, text) {
  const q = (query || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return 0;
  const t = (text || '').toLowerCase();
  const direct = t.indexOf(q);
  if (direct !== -1) {
    const wordStart = direct === 0 || /[\s\-/(,.]/.test(t[direct - 1]);
    return 100 + q.length * 4 + (wordStart ? 30 : 0) - Math.min(direct, 20);
  }
  // Word initials ("sei" → Software Engineer Intern) are a strong signal.
  const initials = t.split(/[\s\-/(,.]+/).filter(Boolean).map(w => w[0]).join('');
  const compact = q.replace(/ /g, '');
  let ii = 0;
  for (const ch of initials) if (ch === compact[ii]) ii += 1;
  const initialScore = ii === compact.length ? 10 * compact.length : 0;

  let score = 0, ti = 0, run = 0, first = -1;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return initialScore || -1;
    if (first === -1) first = found;
    run = found === ti ? run + 1 : 0;
    const wordStart = found === 0 || /[\s\-/(,.]/.test(t[found - 1]);
    score += 1 + run * 2 + (wordStart ? 3 : 0);
    ti = found + 1;
  }
  return Math.max(initialScore, score - Math.min(first, 10) * 0.5);
}

/**
 * True when `query` matches `text` well enough to show: a substring, word
 * initials, or a tight subsequence. Filters out scattered single-letter hits.
 * @param {string} query
 * @param {string} text
 * @returns {boolean}
 */
function isStrongMatch(query, text) {
  const q = (query || '').trim();
  if (!q) return true;
  return fuzzyScore(q, text) >= q.replace(/\s+/g, '').length * 2.5;
}

/**
 * @param {SearchableJob} job
 * @param {string} query
 */
function jobScore(job, query) {
  const fields = [job.title, job.company, job.location || ''];
  return Math.max(...fields.map(f => fuzzyScore(query, f)));
}

/**
 * Filter by free-text query (contiguous match on title/company/location), source,
 * lane and internship flag. Keeps the input order.
 * @template {SearchableJob} T
 * @param {T[]} jobs
 * @param {{ query?: string, source?: string | null, lane?: string | null, internshipOnly?: boolean }} filters
 * @returns {T[]}
 */
function filterJobs(jobs, { query = '', source = null, lane = null, internshipOnly = false } = {}) {
  const q = query.trim().toLowerCase();
  return jobs.filter(job => {
    if (source && job.source !== source) return false;
    if (lane && laneForStatus(job.status) !== lane) return false;
    if (internshipOnly && !job.isInternship) return false;
    if (!q) return true;
    return [job.title, job.company, job.location || ''].some(f => f.toLowerCase().includes(q));
  });
}

/**
 * Ranked fuzzy search for the command palette.
 * @template {SearchableJob} T
 * @param {T[]} jobs
 * @param {string} query
 * @param {number} [limit]
 * @returns {T[]}
 */
function searchJobs(jobs, query, limit = 8) {
  if (!query.trim()) return jobs.slice(0, limit);
  return jobs
    .map((job, i) => ({ job, i, score: jobScore(job, query) }))
    .filter(x => x.score >= query.trim().replace(/\s+/g, '').length * 2.5)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map(x => x.job);
}

const LANE_ORDER = LANES.map(l => l.id);

/**
 * @template {SearchableJob} T
 * @param {T[]} jobs
 * @param {'recent' | 'company' | 'title' | 'stage'} key
 * @returns {T[]}
 */
function sortJobs(jobs, key) {
  const time = (/** @type {T} */ j) => (j.discoveredAt ? new Date(j.discoveredAt).getTime() : 0);
  const copy = [...jobs];
  switch (key) {
    case 'company': return copy.sort((a, b) => a.company.localeCompare(b.company) || time(b) - time(a));
    case 'title': return copy.sort((a, b) => a.title.localeCompare(b.title) || time(b) - time(a));
    case 'stage': return copy.sort((a, b) =>
      LANE_ORDER.indexOf(laneForStatus(a.status)) - LANE_ORDER.indexOf(laneForStatus(b.status)) || time(b) - time(a));
    case 'recent':
    default: return copy.sort((a, b) => time(b) - time(a));
  }
}

module.exports = { fuzzyScore, isStrongMatch, filterJobs, searchJobs, sortJobs };
