'use strict';

/**
 * ATS Adapter Registry
 *
 * Detects which ATS a job URL/page belongs to and returns the appropriate adapter.
 * Each adapter implements: { name, detect(url, page), fill(page, job, options) }
 *
 * Detection order matters — more specific checks first.
 */

const log = require('../logger');

// ─── Hostname detection (fast, no DOM needed) ─────────────────────────────────

const HOST_MAP = [
  { host: 'greenhouse.io',       name: 'greenhouse' },
  { host: 'lever.co',            name: 'lever' },
  { host: 'ashbyhq.com',         name: 'ashby' },
  { host: 'myworkdayjobs.com',   name: 'workday' },
  { host: 'myworkdaysite.com',   name: 'workday' },
  { host: 'icims.com',           name: 'icims' },
  { host: 'smartrecruiters.com', name: 'smartrecruiters' },
];

// ─── DOM fingerprinting (for ambiguous URLs) ──────────────────────────────────

const DOM_FINGERPRINTS = [
  { selector: '#application_form, #gs_form, [data-provider="greenhouse"]', name: 'greenhouse' },
  { selector: '[data-qa="lever-application-form"], .lever-apply',           name: 'lever' },
  { selector: '[data-ashby-form], .ashby-form',                             name: 'ashby' },
  { selector: '[data-automation-id="applicationWidget"]',                   name: 'workday' },
  { selector: '#icims_content_iframe',                                      name: 'icims' },
];

/**
 * Detect ATS from URL (fast path — no browser needed).
 */
function detectFromURL(url) {
  try {
    const { hostname } = new URL(url);
    for (const { host, name } of HOST_MAP) {
      // match the registered domain or a subdomain of it, never a look-alike such as greenhouse.io.evil.com
      if (hostname === host || hostname.endsWith('.' + host)) return name;
    }
  } catch (_) {}
  return null;
}

/**
 * Detect ATS from the live page DOM.
 * @param {import('playwright').Page} page
 */
async function detectFromDOM(page) {
  for (const { selector, name } of DOM_FINGERPRINTS) {
    try {
      const el = await page.$(selector);
      if (el) return name;
    } catch (_) {}
  }
  return null;
}

/**
 * Detect ATS from URL + optionally the live page.
 * Falls back to 'generic' if nothing matches.
 */
async function detectATS(url, page = null) {
  const fromURL = detectFromURL(url);
  if (fromURL) {
    log.info('ATS detected from URL', { ats: fromURL, url: url.substring(0, 80) });
    return fromURL;
  }

  if (page) {
    const fromDOM = await detectFromDOM(page);
    if (fromDOM) {
      log.info('ATS detected from DOM', { ats: fromDOM });
      return fromDOM;
    }
  }

  log.info('ATS unknown — using generic adapter');
  return 'generic';
}

/**
 * Load the appropriate adapter module.
 */
function getAdapter(atsName) {
  const ADAPTERS = {
    greenhouse:     () => require('./greenhouse'),
    lever:          () => require('./lever'),
    ashby:          () => require('./ashby'),
    generic:        () => require('./generic'),
    workday:        () => require('./workday'),
    icims:          () => require('./icims'),
    smartrecruiters:() => require('./smartrecruiters'),
  };

  const loader = ADAPTERS[atsName] || ADAPTERS.generic;
  return loader();
}

module.exports = { detectATS, detectFromURL, getAdapter };
