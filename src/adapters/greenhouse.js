'use strict';

/**
 * Greenhouse ATS Adapter
 *
 * Waits for #application_form and pre-classifies Greenhouse's standard field ids.
 */

const { runPipeline } = require('./pipeline');

const name = 'greenhouse';

/** Known Greenhouse standard field ids → profile paths */
const KNOWN_FIELDS = {
  first_name: 'personal.firstName',
  last_name:  'personal.lastName',
  email:      'personal.email',
  phone:      'personal.phone',
};

const annotate = (d) => (d.id && KNOWN_FIELDS[d.id] ? { ...d, _knownMeaning: KNOWN_FIELDS[d.id] } : d);
const waitFor = (page) => page.waitForSelector('#application_form, form.application', { timeout: 15000 });

function fill(page, job = {}, options = {}) {
  return runPipeline(page, job, options, { platform: name, waitFor, annotate });
}

module.exports = { name, fill, KNOWN_FIELDS };
