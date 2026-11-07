'use strict';

/**
 * SmartRecruiters Adapter
 *
 * SmartRecruiters application pages are built from web components, so their fields live in
 * (open) shadow roots. The field extractor walks those, and Playwright's CSS locators pierce
 * them, so this adapter only has to wait for the form and then run the shared pipeline.
 *
 * Built from the platform's public markup conventions and tested on a fixture; not verified
 * against live company pages.
 */

const { runPipeline } = require('./pipeline');

const name = 'smartrecruiters';

const waitFor = (page) =>
  page.waitForSelector('input:not([type="hidden"]), textarea, select', { timeout: 20000 });

function fill(page, job = {}, options = {}) {
  return runPipeline(page, job, options, { platform: name, waitFor });
}

module.exports = { name, fill };
