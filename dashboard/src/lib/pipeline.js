/**
 * Pipeline model: the exact application statuses the database allows, how they map
 * onto the kanban lanes, which actions each stage offers, and how an action turns
 * into a permitted Supabase write.
 *
 * Browser write permissions (RLS + column grants):
 *   INSERT applications (listing_id, status='pending_application', status_updated_at)
 *   UPDATE applications (status, status_updated_at, error_message)
 *          only to 'pending_application' | 'Discovered' | 'submitted'
 */

/** @typedef {'Discovered'|'pending_application'|'applying'|'application_opened'|'form_analyzed'|'autofill_completed'|'awaiting_review'|'submitted'|'failed'} Status */
/** @typedef {'discovered'|'queued'|'filling'|'review'|'applied'|'attention'} LaneId */
/** @typedef {'autofill'|'retry'|'dismiss'|'submit'} Action */
/** @typedef {{ id: LaneId, label: string, hint: string, statuses: string[] }} Lane */

/** @type {Status[]} */
const STATUSES = [
  'Discovered', 'pending_application', 'applying', 'application_opened', 'form_analyzed',
  'autofill_completed', 'awaiting_review', 'submitted', 'failed',
];

/** @type {Lane[]} */
const LANES = [
  { id: 'discovered', label: 'Discovered', hint: 'Found, not queued yet', statuses: ['Discovered'] },
  { id: 'queued', label: 'Queued', hint: 'Waiting for the apply server', statuses: ['pending_application'] },
  { id: 'filling', label: 'Filling', hint: 'Browser is filling the form', statuses: ['applying', 'application_opened', 'form_analyzed'] },
  { id: 'review', label: 'Review', hint: 'Filled. Check it and submit', statuses: ['autofill_completed', 'awaiting_review'] },
  { id: 'applied', label: 'Applied', hint: 'Submitted by you', statuses: ['submitted'] },
  { id: 'attention', label: 'Needs attention', hint: 'Failed. Retry or move back', statuses: ['failed'] },
];

/** @type {Record<string, string>} */
const STATUS_LABELS = {
  Discovered: 'New',
  pending_application: 'Queued',
  applying: 'Launching browser',
  application_opened: 'Form opened',
  form_analyzed: 'Filling fields',
  autofill_completed: 'Filled',
  awaiting_review: 'Ready for review',
  submitted: 'Submitted',
  failed: 'Failed',
};

/**
 * @param {string | null | undefined} status
 * @returns {LaneId}
 */
function laneForStatus(status) {
  if (status == null || status === '') return 'discovered';
  const lane = LANES.find(l => l.statuses.includes(status));
  return lane ? lane.id : 'attention';
}

/**
 * @param {string} status
 * @returns {string}
 */
function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

/**
 * @template {{ status: string }} T
 * @param {T[]} jobs
 * @returns {Record<LaneId, T[]>}
 */
function groupByLane(jobs) {
  /** @type {Record<string, T[]>} */
  const groups = {};
  for (const lane of LANES) groups[lane.id] = [];
  for (const job of jobs) groups[laneForStatus(job.status)].push(job);
  return /** @type {Record<LaneId, T[]>} */ (groups);
}

/**
 * @param {string} status
 * @returns {Action[]}
 */
function availableActions(status) {
  switch (laneForStatus(status)) {
    case 'discovered': return ['autofill'];
    case 'review': return ['submit'];
    case 'attention': return status === 'failed' ? ['retry', 'dismiss'] : [];
    default: return [];
  }
}

/**
 * @typedef {{ kind: 'insert', values: { listing_id: string, status: 'pending_application', status_updated_at: string } }
 *         | { kind: 'update', id: string, values: { status: string, status_updated_at: string, error_message?: null } }} StatusChange
 */

/**
 * Turn a UI action into the one database write the browser is allowed to make.
 *
 * @param {Action} action
 * @param {{ listingId: string, applicationId?: string | null }} target
 * @param {string} nowIso
 * @returns {StatusChange}
 */
function planStatusChange(action, { listingId, applicationId }, nowIso) {
  /** @param {{ status: string, status_updated_at: string, error_message?: null }} values */
  const update = (values) => {
    if (!applicationId) throw new Error(`Cannot ${action}: this listing has no application yet.`);
    return /** @type {StatusChange} */ ({ kind: 'update', id: applicationId, values });
  };
  switch (action) {
    case 'autofill':
      if (!applicationId) {
        return { kind: 'insert', values: { listing_id: listingId, status: 'pending_application', status_updated_at: nowIso } };
      }
      return update({ status: 'pending_application', status_updated_at: nowIso });
    case 'retry':
      return update({ status: 'pending_application', status_updated_at: nowIso, error_message: null });
    case 'dismiss':
      return update({ status: 'Discovered', status_updated_at: nowIso, error_message: null });
    case 'submit':
      return update({ status: 'submitted', status_updated_at: nowIso });
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

module.exports = { STATUSES, LANES, STATUS_LABELS, laneForStatus, statusLabel, groupByLane, availableActions, planStatusChange };
