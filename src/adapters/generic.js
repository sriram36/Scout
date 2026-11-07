'use strict';

/**
 * Generic ATS Adapter
 *
 * Used when the platform is unknown or has no dedicated adapter. Runs the shared pipeline
 * with no platform-specific hooks.
 */

const { runPipeline } = require('./pipeline');

const name = 'generic';

/**
 * @param {import('playwright').Page} page
 * @param {object} job
 * @param {{useLLM?: boolean, generateAnswers?: boolean}} options
 */
function fill(page, job = {}, options = {}) {
  return runPipeline(page, job, options, { platform: name });
}

module.exports = { name, fill };
