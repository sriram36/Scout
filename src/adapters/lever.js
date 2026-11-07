'use strict';

/**
 * Lever ATS Adapter
 *
 * Lever identifies fields by their `name` attribute, so its standard names are
 * pre-classified before the generic matching stages run.
 */

const { runPipeline } = require('./pipeline');

const name = 'lever';

/** Known Lever field name attributes → profile paths */
const KNOWN_FIELDS = {
  'name':            'personal.fullName',
  'email':           'personal.email',
  'phone':           'personal.phone',
  'urls[LinkedIn]':  'links.linkedin',
  'urls[GitHub]':    'links.github',
  'urls[Portfolio]': 'links.portfolio',
  'urls[Other]':     'links.portfolio',
};

const annotate = (d) => (d.name && KNOWN_FIELDS[d.name] ? { ...d, _knownMeaning: KNOWN_FIELDS[d.name] } : d);
const waitFor = (page) => page.waitForSelector('.lever-apply, form[method="POST"]', { timeout: 15000 });

function fill(page, job = {}, options = {}) {
  return runPipeline(page, job, options, { platform: name, waitFor, annotate });
}

module.exports = { name, fill, KNOWN_FIELDS };
