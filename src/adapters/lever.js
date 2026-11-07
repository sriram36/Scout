'use strict';

/**
 * Lever ATS Adapter
 *
 * Fast path for Lever job applications.
 * Lever uses `name` attributes as the primary field identifier.
 * Known Lever name-map is handled deterministically before engine pipeline.
 */

const { extractFields }              = require('../engine/fieldDescriptor');
const { buildFillPlan, buildReport } = require('../engine/fillPlan');
const { generateAnswersForPlan }     = require('../engine/answerGenerator');
const { executeFillPlan }            = require('../engine/playwrightExecutor');
const { getProfile, resolvePath }    = require('../config/profile');
const log = require('../logger');

const name = 'lever';

/** Known Lever field name attributes → profile paths */
const LEVER_KNOWN_FIELDS = {
  'name':            'personal.fullName',
  'email':           'personal.email',
  'phone':           'personal.phone',
  'urls[LinkedIn]':  'links.linkedin',
  'urls[GitHub]':    'links.github',
  'urls[Portfolio]': 'links.portfolio',
  'urls[Other]':     'links.portfolio',
};

async function fill(page, job = {}, { useLLM = true, generateAnswers = true } = {}) {
  const profile = getProfile();
  log.info('[lever] Waiting for application form...');

  try {
    await page.waitForSelector('.lever-apply, form[method="POST"]', { timeout: 15000 });
  } catch (_) {
    log.warn('[lever] Form selector not found — proceeding anyway');
  }

  const descriptors = await extractFields(page);
  log.info(`[lever] Extracted ${descriptors.length} fields`);

  // Pre-map known Lever fields before engine processes them
  // We do this by creating synthetic "learned" overrides
  const patchedDescriptors = descriptors.map(d => {
    const knownMeaning = d.name ? LEVER_KNOWN_FIELDS[d.name] : null;
    if (knownMeaning) return { ...d, _knownMeaning: knownMeaning };
    return d;
  });

  let plan = await buildFillPlan(patchedDescriptors, { platform: name, useLLM });

  if (generateAnswers && job.title) {
    const aiAnswers = await generateAnswersForPlan(patchedDescriptors, plan, job);
    if (aiAnswers.length > 0) {
      plan = await buildFillPlan(patchedDescriptors, { platform: name, useLLM, aiAnswers });
    }
  }

  // Resume upload — Lever uses name="resume"
  const resumePath = profile.resume?.defaultPath;
  if (resumePath) {
    const fileFields = patchedDescriptors.filter(d => d.name === 'resume' && d.type === 'file');
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

  log.info('[lever] Fill complete', {
    filled: report.filled, skipped: report.skipped, errors: report.errors,
  });

  return { ...executionResults, report };
}

module.exports = { name, fill };
