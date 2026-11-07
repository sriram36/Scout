'use strict';

/**
 * FillPlan Builder
 *
 * Architecture:
 *   FieldDescriptor[]
 *   → Safety Filter
 *   → Field Matcher (3 stages)
 *   → Value Resolver
 *   → FillPlan[]
 *
 * The FillPlan is a pure data structure describing what to do.
 * The Playwright Executor (playwrightExecutor.js) consumes it.
 * The LLM never touches the browser — it only informs the plan.
 */

const { shouldNeverTouch, isTooUncertain, getSkipReason } = require('./safetyFilter');
const { matchFields, resolveValue } = require('./fieldMatcher');
const log = require('../logger');

// ─── FillPlan entry structure ─────────────────────────────────────────────────
//
// {
//   elementId:    string   — matches FieldDescriptor.elementId
//   selector:     object   — internal selector ({type, value})
//   descriptor:   object   — original FieldDescriptor (for executor reference)
//   meaning:      string   — dot-path like 'personal.email'
//   value:        string   — resolved value to fill/select
//   confidence:   number   — 0–1
//   stage:        number   — 0=learned, 1=rule, 2=semantic, 3=llm
//   action:       string   — 'fill' | 'select' | 'upload' | 'skip'
//   skipReason:   string?  — present when action === 'skip'
//   isAIGenerated: boolean — true when value came from answer generator
// }

/**
 * Build a FillPlan from FieldDescriptors.
 *
 * @param {object[]} descriptors  — from fieldDescriptor.extractFields()
 * @param {object}   options
 * @param {string}   options.platform  — ATS platform
 * @param {boolean}  options.useLLM    — allow Stage 3 LLM matching
 * @param {object[]} options.aiAnswers — pre-generated [{elementId, answer}] for free-text fields
 * @returns {Promise<FillPlan[]>}
 */
async function buildFillPlan(descriptors, { platform = 'unknown', useLLM = true, aiAnswers = [] } = {}) {
  const log = require('../logger').child ? require('../logger').child({ component: 'FillPlan' }) : require('../logger');
  const aiAnswerMap = new Map(aiAnswers.map(a => [a.elementId, a]));

  // ── Safety pass: immediately mark protected fields ────────────────────────
  const safeDescriptors   = [];
  const plan              = [];

  for (const desc of descriptors) {
    if (shouldNeverTouch(desc)) {
      plan.push({
        elementId:  desc.elementId,
        selector:   desc.selector,
        descriptor: desc,
        meaning:    'protected',
        value:      null,
        confidence: 1.0,
        stage:      -1,
        action:     'skip',
        skipReason: getSkipReason(desc),
        isAIGenerated: false,
      });
    } else {
      safeDescriptors.push(desc);
    }
  }

  // ── Classification pass ───────────────────────────────────────────────────
  const matches = await matchFields(safeDescriptors, { platform, useLLM });

  for (let i = 0; i < safeDescriptors.length; i++) {
    const desc  = safeDescriptors[i];
    const match = matches[i];

    // A pre-generated AI answer for a free-text question. (Safety-blocked fields never get
    // here.) Weak or empty answers are left for the candidate rather than guessed.
    const aiEntry = aiAnswerMap.get(desc.elementId);
    if (aiEntry) {
      const answer = typeof aiEntry.answer === 'string' ? aiEntry.answer.trim() : '';
      if (!answer || isTooUncertain(aiEntry.confidence)) {
        plan.push({
          elementId:  desc.elementId,
          selector:   desc.selector,
          descriptor: desc,
          meaning:    match.meaning,
          value:      null,
          confidence: aiEntry.confidence || 0,
          stage:      match.stage,
          action:     'skip',
          skipReason: 'AI answer too uncertain — write this one yourself',
          isAIGenerated: false,
        });
      } else {
        plan.push({
          elementId:  desc.elementId,
          selector:   desc.selector,
          descriptor: desc,
          meaning:    match.meaning === 'unknown' ? 'free-text answer' : match.meaning,
          value:      answer,
          confidence: aiEntry.confidence,
          stage:      3,
          action:     determineAction(desc),
          skipReason: null,
          isAIGenerated: true,
        });
      }
      continue;
    }

    // Unknown meaning → skip. (Checked before uncertainty: an unknown field has confidence 0,
    // and the answer generator looks for exactly this reason to find free-text questions.)
    if (match.meaning === 'unknown') {
      plan.push({
        elementId:  desc.elementId,
        selector:   desc.selector,
        descriptor: desc,
        meaning:    'unknown',
        value:      null,
        confidence: 0,
        stage:      match.stage,
        action:     'skip',
        skipReason: 'Could not classify field',
        isAIGenerated: false,
      });
      continue;
    }

    // Low confidence → skip
    if (isTooUncertain(match.confidence)) {
      plan.push({
        elementId:  desc.elementId,
        selector:   desc.selector,
        descriptor: desc,
        meaning:    match.meaning,
        value:      null,
        confidence: match.confidence,
        stage:      match.stage,
        action:     'skip',
        skipReason: `Low confidence (${(match.confidence * 100).toFixed(0)}%) — manual review`,
        isAIGenerated: false,
      });
      continue;
    }

    // Resolve the value from the profile
    const value = resolveValue(match.meaning);
    if (!value) {
      plan.push({
        elementId:  desc.elementId,
        selector:   desc.selector,
        descriptor: desc,
        meaning:    match.meaning,
        value:      null,
        confidence: match.confidence,
        stage:      match.stage,
        action:     'skip',
        skipReason: `No value in profile for '${match.meaning}'`,
        isAIGenerated: false,
      });
      continue;
    }

    plan.push({
      elementId:  desc.elementId,
      selector:   desc.selector,
      descriptor: desc,
      meaning:    match.meaning,
      value,
      confidence: match.confidence,
      stage:      match.stage,
      action:     determineAction(desc, value),
      skipReason: null,
      isAIGenerated: false,
    });
  }

  const filled  = plan.filter(p => p.action !== 'skip').length;
  const skipped = plan.filter(p => p.action === 'skip').length;
  log.info('FillPlan built', { platform, total: plan.length, willFill: filled, willSkip: skipped });

  return plan;
}

/**
 * Determine the appropriate action for a field based on its type.
 */
function determineAction(descriptor, value) {
  const { tag, type } = descriptor;
  if (type === 'file')     return 'upload';
  if (tag === 'select')    return 'select';
  if (type === 'radio')    return 'radio';
  if (type === 'checkbox') return 'checkbox';
  return 'fill';
}

/**
 * Generate a summary report from a completed FillPlan + execution results.
 */
function buildReport(fillPlan, executionResults) {
  return {
    total:        fillPlan.length,
    filled:       executionResults.filled.length,
    skipped:      executionResults.skipped.length,
    errors:       executionResults.errors.length,
    aiGenerated:  fillPlan.filter(p => p.isAIGenerated && p.action !== 'skip').length,
    stageBreakdown: {
      learned:      fillPlan.filter(p => p.stage === 0 && p.action !== 'skip').length,
      deterministic:fillPlan.filter(p => p.stage === 1 && p.action !== 'skip').length,
      semantic:     fillPlan.filter(p => p.stage === 2 && p.action !== 'skip').length,
      llm:          fillPlan.filter(p => p.stage === 3 && p.action !== 'skip').length,
    },
    // Per-field detail lives under `details`; the top-level counts above must stay
    // numeric (they feed INTEGER columns and the dashboard's report modal).
    details: {
      filled:  executionResults.filled,
      skipped: executionResults.skipped,
      errors:  executionResults.errors,
    },
  };
}

module.exports = { buildFillPlan, buildReport, determineAction };
