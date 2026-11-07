'use strict';

/**
 * Workday Adapter
 *
 * Workday applications are a multi-step wizard behind a sign-in. This adapter:
 *  - stops, without typing anything, if it meets a sign-in / create-account wall
 *    (it never handles credentials: the candidate signs in in the open browser)
 *  - fills the current step, then moves on only by clicking the wizard's button when its
 *    label is exactly a continue/next label. It READS THE LABEL BEFORE EVERY CLICK: on the
 *    final step Workday reuses the same button id for "Submit", and that is never clicked.
 *  - stops when a step is not accepted (a required field needs the candidate)
 *
 * Built from Workday's public data-automation-id conventions and tested on a fixture wizard;
 * not verified against live company tenants.
 */

const { runPipeline, mergeResults } = require('./pipeline');
const log = require('../logger');

const name = 'workday';

const NEXT_BUTTON = '[data-automation-id="bottom-navigation-next-button"]';
const STEP_TITLE = '[data-automation-id="stepTitle"], [data-automation-id="progressBarActiveStep"]';
const MAX_STEPS = 8;
const DEFAULT_STEP_TIMEOUT_MS = 8000;

/** Only a plain "continue" label may be clicked. Anything else (Submit, Review and Submit…) stops us. */
const CONTINUE_LABEL = /^(save\s*(and|&)\s*continue|continue|next)$/i;

/** Workday's own field names for the basics, as a head start for the matcher. */
const KNOWN_NAME_PATTERNS = [
  [/first.?name/i, 'personal.firstName'],
  [/last.?name|family.?name/i, 'personal.lastName'],
  [/phone.?number/i, 'personal.phone'],
];
const annotate = (d) => {
  const hit = d.name && KNOWN_NAME_PATTERNS.find(([pattern]) => pattern.test(d.name));
  return hit ? { ...d, _knownMeaning: hit[1] } : d;
};

async function isSignInWall(page) {
  return (await page.locator('input[type="password"]:visible').count()) > 0;
}

async function stepFingerprint(page) {
  return page.evaluate((titleSelector) => {
    const title = document.querySelector(titleSelector)?.textContent?.trim() || '';
    const fields = Array.from(document.querySelectorAll('input, select, textarea'))
      .map(el => el.id || el.name || el.type).join('|');
    return `${title}::${fields}`;
  }, STEP_TITLE);
}

/** Wait until the wizard shows something different from `before`; false on timeout. */
async function waitForStepChange(page, before, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await stepFingerprint(page)) !== before) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

async function fill(page, job = {}, options = {}) {
  const { maxSteps = MAX_STEPS, stepTimeout = DEFAULT_STEP_TIMEOUT_MS, ...pipelineOptions } = options;

  try {
    await page.waitForSelector(`${NEXT_BUTTON}, input, textarea, select`, { timeout: 20000 });
  } catch (_) {
    log.warn(`[${name}] Nothing rendered in time — proceeding anyway`);
  }

  if (await isSignInWall(page)) {
    log.info(`[${name}] Sign-in wall — leaving it to the candidate`);
    return {
      filled: [], skipped: [], errors: [], report: null, steps: 0,
      note: 'Workday needs you to sign in or create an account first. Do that in the open browser, then queue this job again.',
    };
  }

  const results = [];
  let note = null;

  for (let step = 0; step < maxSteps; step++) {
    results.push(await runPipeline(page, job, pipelineOptions, { platform: name, annotate }));

    const button = page.locator(NEXT_BUTTON).first();
    if ((await button.count()) === 0) break;

    const label = ((await button.textContent()) || '').replace(/\s+/g, ' ').trim();
    if (!CONTINUE_LABEL.test(label)) {
      note = `Stopped before "${label}" — review the whole application and submit it yourself.`;
      break;
    }

    const before = await stepFingerprint(page);
    await button.click();
    if (!(await waitForStepChange(page, before, stepTimeout))) {
      note = 'Workday did not accept this step — a required field probably needs you. Finish this step in the browser.';
      break;
    }
    if (step === maxSteps - 1) note = `Stopped after ${maxSteps} steps — continue in the browser.`;
  }

  const merged = mergeResults(results);
  log.info(`[${name}] Fill complete`, { steps: results.length, filled: merged.report?.filled ?? 0 });
  return { ...merged, steps: results.length, note };
}

module.exports = { name, fill };
