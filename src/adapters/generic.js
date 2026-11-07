'use strict';

/**
 * Generic ATS Adapter
 *
 * Used when the platform is unknown or doesn't have a dedicated adapter.
 * Uses the full engine pipeline:
 *   DOM extraction → FieldDescriptor[] → 3-stage matching → safety filter
 *   → FillPlan → (optional AI answers) → Playwright execution
 */

const { extractFields }          = require('../engine/fieldDescriptor');
const { buildFillPlan, buildReport } = require('../engine/fillPlan');
const { generateAnswersForPlan } = require('../engine/answerGenerator');
const { executeFillPlan }        = require('../engine/playwrightExecutor');
const { getProfile }             = require('../config/profile');
const log = require('../logger');

const name = 'generic';

/**
 * Main fill function.
 * @param {import('playwright').Page} page
 * @param {object} job    — { id, title, company, description, apply_url }
 * @param {object} options
 * @param {boolean} options.useLLM     — whether Stage 3 LLM matching is allowed
 * @param {boolean} options.generateAnswers — whether to generate free-text answers
 * @returns {Promise<{ filled, skipped, errors, report }>}
 */
async function fill(page, job = {}, { useLLM = true, generateAnswers = true } = {}) {
  const profile = getProfile();
  log.info(`[${name}] Starting form analysis`);

  // ── 1. Extract all fields from DOM ────────────────────────────────────────
  const descriptors = await extractFields(page);
  log.info(`[${name}] Extracted ${descriptors.length} fields from page`);

  if (descriptors.length === 0) {
    log.warn(`[${name}] No fillable fields found on page`);
    return { filled: [], skipped: [], errors: [], report: null };
  }

  // ── 2. Build initial FillPlan (without AI-generated answers) ──────────────
  let plan = await buildFillPlan(descriptors, { platform: name, useLLM });

  // ── 3. Generate AI answers for unresolved free-text questions ─────────────
  if (generateAnswers && job.title) {
    const aiAnswers = await generateAnswersForPlan(descriptors, plan, job);
    if (aiAnswers.length > 0) {
      log.info(`[${name}] Generated ${aiAnswers.length} AI answers`);
      // Rebuild plan with AI answers included
      plan = await buildFillPlan(descriptors, { platform: name, useLLM, aiAnswers });
    }
  }

  // ── 4. Handle resume upload ───────────────────────────────────────────────
  const resumePath = profile.resume?.defaultPath;
  if (resumePath) {
    // Find any file upload fields not yet in the plan
    const fileFields = descriptors.filter(d =>
      d.type === 'file' &&
      /resume|cv/i.test(`${d.name || ''} ${d.label || ''}`)
    );
    for (const ff of fileFields) {
      const alreadyPlanned = plan.find(p => p.elementId === ff.elementId);
      if (!alreadyPlanned || alreadyPlanned.action === 'skip') {
        plan.push({
          elementId:  ff.elementId,
          selector:   ff.selector,
          descriptor: ff,
          meaning:    'resume',
          value:      resumePath,
          confidence: 0.99,
          stage:      1,
          action:     'upload',
          skipReason: null,
          isAIGenerated: false,
        });
      }
    }
  }

  // ── 5. Execute the plan ───────────────────────────────────────────────────
  const executionResults = await executeFillPlan(page, plan);
  const report = buildReport(plan, executionResults);

  log.info(`[${name}] Fill complete`, {
    filled: report.filled,
    skipped: report.skipped,
    errors: report.errors,
    aiGenerated: report.aiGenerated,
  });

  return { ...executionResults, report };
}

module.exports = { name, fill };
