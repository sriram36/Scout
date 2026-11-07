'use strict';

/**
 * Generic ATS Adapter
 *
 * Used when the platform is unknown or has no dedicated adapter. Runs the shared pipeline on the
 * page, or on the iframe that holds the form when the page itself has little to fill (company
 * career pages often embed their ATS form). On an unknown page it fills only something that looks
 * like an application (a name or resume field): never a search, location or newsletter box.
 */

const { runPipeline } = require('./pipeline');
const { pickTarget } = require('./frames');

const name = 'generic';

/**
 * @param {import('playwright').Page} page
 * @param {object} job
 * @param {{useLLM?: boolean, generateAnswers?: boolean}} options
 */
async function fill(page, job = {}, options = {}) {
  const target = await pickTarget(page);
  return runPipeline(target, job, options, { platform: name, requireIdentity: true });
}

module.exports = { name, fill };
