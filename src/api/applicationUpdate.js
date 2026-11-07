'use strict';

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
  const fillReport = result.note ? { ...(report || {}), note: result.note } : report;

  return {
    status:                result.note ? 'awaiting_review' : 'autofill_completed',
    ats_platform:          atsName,
    fields_detected:       report?.total || 0,
    fields_filled:         report?.filled || 0,
    fields_skipped:        report?.skipped || 0,
    ai_questions_answered: report?.aiGenerated || 0,
    fill_report:           fillReport,
  };
}

module.exports = { buildApplicationUpdate };
