'use strict';

const NO_FIELDS_NOTE = 'Scout found no form fields on this page. It may be the job posting rather than the application form — open the apply page in the browser and continue by hand.';

/**
 * The `applications` row update that records the outcome of an adapter run.
 * An adapter `note` ("sign in first", "stopped before Submit") means the candidate has to act,
 * so the status becomes awaiting_review and the note travels inside fill_report.
 *
 * @param {{report?: object|null, note?: string|null}} result  adapter result
 * @param {string} atsName
 */
function buildApplicationUpdate(result, atsName) {
  const report = result.report || null;
  const noFields = !report || report.total === 0;
  const note = result.note || (noFields ? NO_FIELDS_NOTE : null);
  const fillReport = note ? { ...(report || {}), note } : report;

  return {
    status:                note ? 'awaiting_review' : 'autofill_completed',
    ats_platform:          atsName,
    fields_detected:       report?.total || 0,
    fields_filled:         report?.filled || 0,
    fields_skipped:        report?.skipped || 0,
    ai_questions_answered: report?.aiGenerated || 0,
    fill_report:           fillReport,
  };
}

module.exports = { buildApplicationUpdate };
