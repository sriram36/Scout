'use strict';

/**
 * Shared fill pipeline used by every ATS adapter.
 *
 *   wait for form → extract fields → (platform annotations) → fill plan
 *   → AI answers for free-text questions → resume upload → execute → report
 *
 * `target` is a Playwright Page or Frame (iCIMS renders its form inside an iframe).
 * An adapter only supplies what is platform-specific:
 *   platform   name used for learned mappings and logs
 *   waitFor    async (target) => void   wait until the form has rendered
 *   annotate   (descriptor) => descriptor   e.g. add `_knownMeaning` for the platform's own field ids
 */

const { extractFields }              = require('../engine/fieldDescriptor');
const { buildFillPlan, buildReport } = require('../engine/fillPlan');
const { generateAnswersForPlan }     = require('../engine/answerGenerator');
const { executeFillPlan }            = require('../engine/playwrightExecutor');
const { getProfile }                 = require('../config/profile');
const log = require('../logger');

const RESUME_FIELD = /resume|cv/i;

/** Add upload entries for resume file inputs that the plan has not already handled. */
function addResumeUploads(plan, descriptors, resumePath) {
  if (!resumePath) return plan;
  const resumeFields = descriptors.filter(d =>
    d.type === 'file' && RESUME_FIELD.test(`${d.name || ''} ${d.id || ''} ${d.label || ''}`)
  );
  for (const field of resumeFields) {
    if (plan.find(p => p.elementId === field.elementId && p.action !== 'skip')) continue;
    // replace a planned skip for this element instead of adding a duplicate entry
    const skipped = plan.findIndex(p => p.elementId === field.elementId);
    if (skipped >= 0) plan.splice(skipped, 1);
    plan.push({
      elementId:  field.elementId,
      selector:   field.selector,
      descriptor: field,
      meaning:    'resume',
      value:      resumePath,
      confidence: 0.99,
      stage:      1,
      action:     'upload',
      skipReason: null,
      isAIGenerated: false,
    });
  }
  return plan;
}

/**
 * @param {import('playwright').Page | import('playwright').Frame} target
 * @param {object} job  { id, title, company, description, apply_url }
 * @param {{useLLM?: boolean, generateAnswers?: boolean}} options
 * @param {{platform: string, waitFor?: Function, annotate?: Function}} spec
 * @returns {Promise<{filled: object[], skipped: object[], errors: object[], report: object|null}>}
 */
async function runPipeline(target, job = {}, { useLLM = true, generateAnswers = true } = {}, spec) {
  const { platform, waitFor, annotate } = spec;
  const profile = getProfile();

  if (waitFor) {
    try {
      await waitFor(target);
    } catch (_) {
      log.warn(`[${platform}] Form not ready in time — proceeding anyway`);
    }
  }

  const extracted = await extractFields(target);
  log.info(`[${platform}] Extracted ${extracted.length} fields`);
  if (extracted.length === 0) {
    log.warn(`[${platform}] No fillable fields found on page`);
    return { filled: [], skipped: [], errors: [], report: null };
  }

  const descriptors = annotate ? extracted.map(annotate) : extracted;

  let plan = await buildFillPlan(descriptors, { platform, useLLM });

  if (generateAnswers && job.title) {
    const aiAnswers = await generateAnswersForPlan(descriptors, plan, job);
    if (aiAnswers.length > 0) {
      log.info(`[${platform}] Generated ${aiAnswers.length} AI answers`);
      plan = await buildFillPlan(descriptors, { platform, useLLM, aiAnswers });
    }
  }

  plan = addResumeUploads(plan, descriptors, profile.resume?.defaultPath);

  const executionResults = await executeFillPlan(target, plan);
  const report = buildReport(plan, executionResults);

  log.info(`[${platform}] Fill complete`, {
    filled: report.filled, skipped: report.skipped, errors: report.errors, aiGenerated: report.aiGenerated,
  });

  return { ...executionResults, report };
}

/**
 * Combine the results of several pipeline runs (one per step of a multi-step form).
 * Results with no report (a step with no fillable fields) contribute nothing to the counts.
 */
function mergeResults(results) {
  const filled = [];
  const skipped = [];
  const errors = [];
  const reports = [];
  for (const r of results) {
    filled.push(...(r.filled || []));
    skipped.push(...(r.skipped || []));
    errors.push(...(r.errors || []));
    if (r.report) reports.push(r.report);
  }
  if (reports.length === 0) return { filled, skipped, errors, report: null };

  const sum = (key) => reports.reduce((n, r) => n + (r[key] || 0), 0);
  const stage = (key) => reports.reduce((n, r) => n + (r.stageBreakdown?.[key] || 0), 0);
  const detail = (key) => reports.flatMap(r => r.details?.[key] || []);

  return {
    filled, skipped, errors,
    report: {
      total: sum('total'),
      filled: sum('filled'),
      skipped: sum('skipped'),
      errors: sum('errors'),
      aiGenerated: sum('aiGenerated'),
      stageBreakdown: {
        learned: stage('learned'), deterministic: stage('deterministic'), semantic: stage('semantic'), llm: stage('llm'),
      },
      details: { filled: detail('filled'), skipped: detail('skipped'), errors: detail('errors') },
    },
  };
}

module.exports = { runPipeline, addResumeUploads, mergeResults };
