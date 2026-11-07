'use strict';

/**
 * iCIMS Adapter
 *
 * iCIMS renders the application form inside an iframe (#icims_content_iframe), so the shared
 * pipeline is pointed at that frame instead of the host page. The named frame is preferred
 * over any other frame (chat widgets and analytics frames also contain inputs). If the page has
 * no iframe the form is inline and the page itself is used. A login step is left to the
 * candidate: nothing is typed and a note explains why.
 *
 * Built from the platform's public markup conventions and tested on fixtures; not verified
 * against live company pages.
 */

const { runPipeline, isSignInWall, SIGN_IN_NOTE } = require('./pipeline');
const log = require('../logger');

const name = 'icims';

const APPLICATION_FRAME = '#icims_content_iframe';
const FORM_FIELDS = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';

async function hasFields(frame) {
  try {
    return (await frame.locator(FORM_FIELDS).count()) > 0;
  } catch (_) {
    return false; // frame navigating or detached
  }
}

async function namedFrame(page) {
  const handle = await page.$(APPLICATION_FRAME);
  return handle ? handle.contentFrame() : null;
}

/**
 * The child frame that holds the application form, or null if the form is inline.
 * @param {import('playwright').Page} page
 * @param {number} timeoutMs
 */
async function findFormFrame(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const preferred = await namedFrame(page);
    if (preferred) {
      // the application frame exists: wait for it, never fall back to some other frame
      if (await hasFields(preferred)) return preferred;
    } else {
      for (const frame of page.frames()) {
        if (frame !== page.mainFrame() && await hasFields(frame)) return frame;
      }
      // no iframe at all and the page itself has the form: nothing to wait for
      if ((await page.locator('iframe').count()) === 0 && await hasFields(page.mainFrame())) return null;
    }
    if (Date.now() >= deadline) return null;
    await page.waitForTimeout(250);
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {object} job
 * @param {{useLLM?: boolean, generateAnswers?: boolean, frameTimeout?: number}} options
 */
async function fill(page, job = {}, options = {}) {
  const { frameTimeout = 15000, ...pipelineOptions } = options;
  const frame = await findFormFrame(page, frameTimeout);
  const target = frame || page;
  log.info(`[${name}] ${frame ? 'Filling the application iframe' : 'No iframe form found — using the page itself'}`);

  if (await isSignInWall(target)) {
    log.info(`[${name}] Login step — leaving it to the candidate`);
    return { filled: [], skipped: [], errors: [], report: null, note: SIGN_IN_NOTE };
  }

  return runPipeline(target, job, pipelineOptions, { platform: name });
}

module.exports = { name, fill, findFormFrame };
