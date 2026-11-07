'use strict';

/**
 * Greenhouse ATS Adapter
 *
 * Fast path for Greenhouse job applications.
 * Uses the full engine pipeline but with Greenhouse-specific optimizations:
 *  - Waits for #application_form to be ready
 *  - Pre-maps standard Greenhouse field IDs deterministically
 *  - Batch-generates answers for question_* fields
 */

const { extractFields }              = require('../engine/fieldDescriptor');
const { buildFillPlan, buildReport } = require('../engine/fillPlan');
const { generateAnswersForPlan }     = require('../engine/answerGenerator');
const { executeFillPlan }            = require('../engine/playwrightExecutor');
const { getProfile }                 = require('../config/profile');
const log = require('../logger');

const name = 'greenhouse';

/** Known Greenhouse standard field IDs → profile paths */
const GREENHOUSE_KNOWN_FIELDS = {
  first_name: 'personal.firstName',
  last_name:  'personal.lastName',
  email:      'personal.email',
  phone:      'personal.phone',
};

async function fill(page, job = {}, { useLLM = true, generateAnswers = true } = {}) {
  const profile = getProfile();
  log.info('[greenhouse] Waiting for application form...');

  // Wait for Greenhouse form to be ready
  try {
    await page.waitForSelector('#application_form, form.application', { timeout: 15000 });
  } catch (_) {
    log.warn('[greenhouse] Form not found within 15s — proceeding anyway');
  }

  const descriptors = await extractFields(page);
  log.info(`[greenhouse] Extracted ${descriptors.length} fields`);

  // Inject known Greenhouse field mappings into the matcher's Stage 0 cache
  // by pre-populating a match override for known IDs
  const knownOverrides = new Map(
    Object.entries(GREENHOUSE_KNOWN_FIELDS).map(([id, meaning]) => [id, meaning])
  );

  // Patch descriptors: if id matches a known Greenhouse field, annotate it
  const patchedDescriptors = descriptors.map(d => {
    if (d.id && knownOverrides.has(d.id)) {
      return { ...d, _knownMeaning: knownOverrides.get(d.id) };
    }
    return d;
  });

  let plan = await buildFillPlan(patchedDescriptors, { platform: name, useLLM });

  if (generateAnswers && job.title) {
    const aiAnswers = await generateAnswersForPlan(patchedDescriptors, plan, job);
    if (aiAnswers.length > 0) {
      plan = await buildFillPlan(patchedDescriptors, { platform: name, useLLM, aiAnswers });
    }
  }

  // Resume upload
  const resumePath = profile.resume?.defaultPath;
  if (resumePath) {
    const fileFields = patchedDescriptors.filter(d => d.id === 'resume' && d.type === 'file');
    for (const ff of fileFields) {
      if (!plan.find(p => p.elementId === ff.elementId && p.action !== 'skip')) {
        plan.push({
          elementId: ff.elementId, selector: ff.selector, descriptor: ff,
          meaning: 'resume', value: resumePath, confidence: 0.99,
          stage: 1, action: 'upload', skipReason: null, isAIGenerated: false,
        });
      }
    }
  }

  const executionResults = await executeFillPlan(page, plan);
  const report = buildReport(plan, executionResults);

  log.info('[greenhouse] Fill complete', {
    filled: report.filled, skipped: report.skipped, errors: report.errors,
  });

  return { ...executionResults, report };
}

module.exports = { name, fill };
