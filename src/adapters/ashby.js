'use strict';

/**
 * Ashby HQ ATS Adapter
 *
 * Ashby uses a React-based form with data-* attributes.
 * This adapter waits for the form, then delegates to the generic engine.
 */

const { extractFields }              = require('../engine/fieldDescriptor');
const { buildFillPlan, buildReport } = require('../engine/fillPlan');
const { generateAnswersForPlan }     = require('../engine/answerGenerator');
const { executeFillPlan }            = require('../engine/playwrightExecutor');
const { getProfile }                 = require('../config/profile');
const log = require('../logger');

const name = 'ashby';

async function fill(page, job = {}, { useLLM = true, generateAnswers = true } = {}) {
  const profile = getProfile();
  log.info('[ashby] Waiting for application form...');

  try {
    // Ashby forms typically load async
    await page.waitForSelector('form, [data-ashby-form]', { timeout: 20000 });
    await page.waitForTimeout(1500); // Let React finish rendering
  } catch (_) {
    log.warn('[ashby] Form not found — proceeding anyway');
  }

  const descriptors = await extractFields(page);
  log.info(`[ashby] Extracted ${descriptors.length} fields`);

  let plan = await buildFillPlan(descriptors, { platform: name, useLLM });

  if (generateAnswers && job.title) {
    const aiAnswers = await generateAnswersForPlan(descriptors, plan, job);
    if (aiAnswers.length > 0) {
      plan = await buildFillPlan(descriptors, { platform: name, useLLM, aiAnswers });
    }
  }

  const resumePath = profile.resume?.defaultPath;
  if (resumePath) {
    const fileFields = descriptors.filter(d => d.type === 'file' && /resume|cv/i.test(`${d.name || ''} ${d.label || ''}`));
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

  log.info('[ashby] Fill complete', { filled: report.filled, skipped: report.skipped });
  return { ...executionResults, report };
}

module.exports = { name, fill };
