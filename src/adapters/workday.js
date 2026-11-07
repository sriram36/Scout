'use strict';

/**
 * Workday Adapter
 *
 * Workday applications are a multi-step wizard behind a sign-in. This adapter:
 *  - stops, without typing anything, at a sign-in / create-account wall (it never handles
 *    credentials; the candidate signs in in the open browser and continues by hand)
 *  - waits for each step to settle (title, fields and button label unchanged for a moment)
 *    before it fills or clicks, because a step can render before its footer does
 *  - fills the current step, then moves on only by a plain continue/next button. The button's
 *    label is read AND the click made in one synchronous browser call, so nothing can change in
 *    between, and it never clicks anything on a step titled Review/Submit.
 *  - stops when a step is not accepted (a required field needs the candidate)
 *
 * Built from Workday's public data-automation-id conventions and tested on a fixture wizard;
 * not verified against live company tenants.
 */

const { runPipeline, mergeResults, isSignInWall, SIGN_IN_NOTE } = require('./pipeline');
const log = require('../logger');

const name = 'workday';

const NEXT_BUTTON = '[data-automation-id="bottom-navigation-next-button"]';
const STEP_TITLE = '[data-automation-id="stepTitle"], [data-automation-id="progressBarActiveStep"]';
const MAX_STEPS = 8;
const DEFAULT_STEP_TIMEOUT_MS = 8000;
const DEFAULT_SETTLE_MS = 800;
const SETTLE_CAP_MS = 6000;

/** Only a plain "continue" label may be clicked. Anything else (Submit, Review and Submit…) stops us. */
const CONTINUE_SOURCE = '^(save\\s*(and|&)\\s*continue|continue|next)$';

/** A step with one of these titles is where the application gets submitted: never click on it. */
const FINAL_STEP = /review|submit/i;

/** Workday's own field names for the basics. Anchored: other sections (emergency contact, referrals) have first names too. */
const KNOWN_NAME_PATTERNS = [
  [/^legalname.*first.?name$/i, 'personal.firstName'],
  [/^legalname.*last.?name$/i, 'personal.lastName'],
  [/^phone.?number$/i, 'personal.phone'],
];
const annotate = (d) => {
  const hit = d.name && KNOWN_NAME_PATTERNS.find(([pattern]) => pattern.test(d.name));
  return hit ? { ...d, _knownMeaning: hit[1] } : d;
};

/** One string that changes whenever the step, its fields or the button label change. */
function stepFingerprint(page) {
  return page.evaluate(({ titleSelector, nextSelector }) => {
    const title = document.querySelector(titleSelector)?.textContent?.trim() || '';
    const label = document.querySelector(nextSelector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const fields = Array.from(document.querySelectorAll('input, select, textarea'))
      .map(el => el.id || el.name || el.type).join('|');
    return `${title}::${label}::${fields}`;
  }, { titleSelector: STEP_TITLE, nextSelector: NEXT_BUTTON });
}

const currentTitle = (page) => page.evaluate((selector) => document.querySelector(selector)?.textContent?.trim() || '', STEP_TITLE);

/** Wait until the wizard has stopped changing for `stableMs` (or the cap is reached). */
async function waitForStable(page, stableMs) {
  if (stableMs <= 0) return;
  const deadline = Date.now() + SETTLE_CAP_MS;
  let last = await stepFingerprint(page);
  let since = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    const now = await stepFingerprint(page);
    if (now !== last) { last = now; since = Date.now(); }
    else if (Date.now() - since >= stableMs) return;
  }
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

/**
 * Click the wizard button only if its label right now is a plain continue label.
 * Read and click happen inside one synchronous page.evaluate, so the label cannot change in between.
 */
function clickContinueIfPlain(page) {
  return page.evaluate(({ selector, source }) => {
    const button = document.querySelector(selector);
    if (!button) return { found: false, clicked: false, label: '', disabled: false };
    const label = (button.textContent || '').replace(/\s+/g, ' ').trim();
    const disabled = !!button.disabled || button.getAttribute('aria-disabled') === 'true';
    if (disabled || !new RegExp(source, 'i').test(label)) return { found: true, clicked: false, label, disabled };
    button.click();
    return { found: true, clicked: true, label, disabled: false };
  }, { selector: NEXT_BUTTON, source: CONTINUE_SOURCE });
}

async function fill(page, job = {}, options = {}) {
  const {
    maxSteps = MAX_STEPS,
    stepTimeout = DEFAULT_STEP_TIMEOUT_MS,
    settleMs = DEFAULT_SETTLE_MS,
    ...pipelineOptions
  } = options;

  try {
    await page.waitForSelector(`${NEXT_BUTTON}, input, textarea, select`, { timeout: 20000 });
  } catch (_) {
    log.warn(`[${name}] Nothing rendered in time — proceeding anyway`);
  }

  const results = [];
  let note = null;

  for (let step = 0; step < maxSteps; step++) {
    await waitForStable(page, settleMs);

    if (await isSignInWall(page)) {
      log.info(`[${name}] Sign-in wall — leaving it to the candidate`);
      note = SIGN_IN_NOTE;
      break;
    }

    results.push(await runPipeline(page, job, pipelineOptions, { platform: name, annotate }));

    const title = await currentTitle(page);
    if (FINAL_STEP.test(title)) {
      note = `Stopped at the "${title}" step — review the whole application and press Submit yourself.`;
      break;
    }

    const before = await stepFingerprint(page);
    const outcome = await clickContinueIfPlain(page);
    if (!outcome.found) break;
    if (!outcome.clicked) {
      note = outcome.disabled
        ? 'Workday\'s Continue button is disabled — a required field probably needs you. Finish this step in the browser.'
        : `Stopped before "${outcome.label}" — review the whole application and submit it yourself.`;
      break;
    }
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
