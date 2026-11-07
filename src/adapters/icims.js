'use strict';

/**
 * iCIMS Adapter
 *
 * iCIMS renders the application form inside an iframe (typically #icims_content_iframe), so
 * the shared pipeline is pointed at that frame instead of the host page. If the page has no
 * iframe the form is inline and the page itself is used.
 *
 * Built from the platform's public markup conventions and tested on a fixture; not verified
 * against live company pages.
 */

const { runPipeline } = require('./pipeline');
const log = require('../logger');

const name = 'icims';

const FORM_FIELDS = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';

async function hasFields(frame) {
  try {
    return (await frame.locator(FORM_FIELDS).count()) > 0;
  } catch (_) {
    return false; // frame navigating or detached
  }
}

/**
 * The child frame that holds the application form, or null if the form is inline.
 * @param {import('playwright').Page} page
 * @param {number} timeoutMs
 */
async function findFormFrame(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const iframeCount = await page.locator('iframe').count();
    for (const frame of page.frames()) {
      if (frame !== page.mainFrame() && await hasFields(frame)) return frame;
    }
    // No iframe at all and the page itself has the form: nothing to wait for.
    if (iframeCount === 0 && await hasFields(page.mainFrame())) return null;
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
  log.info(`[${name}] ${frame ? 'Filling the application iframe' : 'No iframe form found — using the page itself'}`);
  return runPipeline(frame || page, job, pipelineOptions, { platform: name });
}

module.exports = { name, fill, findFormFrame };
