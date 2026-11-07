'use strict';

/**
 * Ashby HQ ATS Adapter
 *
 * Ashby renders its form with React after load, so this waits for the form and gives
 * React a moment to finish before running the shared pipeline.
 */

const { runPipeline } = require('./pipeline');

const name = 'ashby';

const waitFor = async (page) => {
  await page.waitForSelector('form, [data-ashby-form]', { timeout: 20000 });
  await page.waitForTimeout(1500);
};

function fill(page, job = {}, options = {}) {
  return runPipeline(page, job, options, { platform: name, waitFor });
}

module.exports = { name, fill };
