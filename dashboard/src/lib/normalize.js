/**
 * Turn Supabase rows into the shapes the UI renders, and apply realtime changes.
 */

const { pickApplication } = require('./pickApplication');

/**
 * @typedef {{
 *   id: string, listing_id?: string, status: string, status_updated_at?: string | null,
 *   ats_platform?: string | null, started_at?: string | null, completed_at?: string | null,
 *   fields_detected?: number | null, fields_filled?: number | null, fields_skipped?: number | null,
 *   ai_questions_answered?: number | null, fill_report?: unknown, error_message?: string | null, notes?: string | null
 * }} Application
 */

/**
 * @typedef {{
 *   id: string, title: string, company: string, location: string, salary: string | null, source: string,
 *   description: string, url: string | null, postedDate: string | null, discoveredAt: string | null,
 *   isInternship: boolean, status: string, application: Application | null
 * }} Job
 */

/**
 * @typedef {{ field: string, label?: string, meaning?: string, value?: unknown, confidence?: number, stage?: string | number, isAIGenerated?: boolean }} FilledDetail
 * @typedef {{ field: string, label?: string, signature?: string, meaning?: string, reason?: string }} SkippedDetail
 * @typedef {{ field: string, label?: string, meaning?: string, error?: string }} ErrorDetail
 * @typedef {{
 *   total: number, filled: number, skipped: number, errors: number, aiGenerated: number,
 *   stageBreakdown: { learned: number, deterministic: number, semantic: number, llm: number },
 *   details: { filled: FilledDetail[], skipped: SkippedDetail[], errors: ErrorDetail[] },
 *   hasDetails: boolean,
 *   note: string | null
 * }} FillReport
 */

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** @param {unknown} v */
const int = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
/** @param {unknown} v */
const arr = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);

/**
 * @param {any} row  a `listings` row with `applications` embedded
 * @returns {Job}
 */
function normalizeListing(row) {
  const app = /** @type {Application | null} */ (pickApplication(row.applications));
  return {
    id: row.id,
    title: str(row.title) || 'Untitled role',
    company: str(row.company) || 'Unknown company',
    location: str(row.location) || 'Location not listed',
    salary: str(row.salary),
    source: str(row.source) || 'Unknown',
    description: str(row.description) || '',
    url: str(row.apply_url) || str(row.canonical_url),
    postedDate: str(row.posted_date),
    discoveredAt: str(row.discovered_at),
    isInternship: row.is_internship === true,
    status: (app && app.status) || 'Discovered',
    application: app,
  };
}

/**
 * Coerce a fill_report jsonb value into a safe, fully-populated shape.
 * @param {unknown} report
 * @returns {FillReport | null}
 */
function normalizeReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null;
  const r = /** @type {any} */ (report);
  const sb = r.stageBreakdown && typeof r.stageBreakdown === 'object' ? r.stageBreakdown : {};
  const d = r.details && typeof r.details === 'object' ? r.details : null;
  return {
    total: int(r.total),
    filled: int(r.filled),
    skipped: int(r.skipped),
    errors: int(r.errors),
    aiGenerated: int(r.aiGenerated),
    stageBreakdown: { learned: int(sb.learned), deterministic: int(sb.deterministic), semantic: int(sb.semantic), llm: int(sb.llm) },
    details: { filled: arr(d && d.filled), skipped: arr(d && d.skipped), errors: arr(d && d.errors) },
    hasDetails: !!d,
    // Set by adapters when the candidate has to act ("sign in first", "stopped before Submit").
    note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
  };
}

/**
 * Patch jobs from a Supabase realtime `postgres_changes` payload on `applications`.
 * Returns the same array when nothing matched, so React can skip a render.
 * @param {Job[]} jobs
 * @param {{ eventType: string, new?: any, old?: any }} payload
 * @returns {Job[]}
 */
function applyRealtimeChange(jobs, payload) {
  if (payload.eventType === 'DELETE') {
    const id = payload.old && payload.old.id;
    if (!id || !jobs.some(j => j.application && j.application.id === id)) return jobs;
    return jobs.map(j => (j.application && j.application.id === id ? { ...j, application: null, status: 'Discovered' } : j));
  }
  const next = payload.new;
  if (!next || !next.listing_id || !jobs.some(j => j.id === next.listing_id)) return jobs;
  return jobs.map(j => {
    if (j.id !== next.listing_id) return j;
    const application = { ...(j.application || {}), ...next };
    return { ...j, application, status: application.status || 'Discovered' };
  });
}

module.exports = { normalizeListing, normalizeReport, applyRealtimeChange };
