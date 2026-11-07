'use strict';

/**
 * Job-board listing pages (RemoteOK, Arbeitnow, Himalayas, Adzuna) are not application forms: the form
 * lives behind an "Apply" control that leads to the employer's own page. This follows that control so
 * the adapters see the real form.
 *
 * Deliberately narrow: it only ever clicks a link or button whose whole accessible name is a plain
 * "Apply" phrase, never anything else (so never Submit, Subscribe, Sign up, Post a job...), at most
 * `maxHops` times, and only while the current page does not already look like an application form.
 */

const { FORM_FIELDS } = require('./frames');
const log = require('../logger');

/** The whole accessible name must be one of these. */
const APPLY_NAME = /^(apply|apply now|apply here|apply for this (job|position|role)|apply on (the )?company('s)? (site|website)|apply externally)$/i;

const NAVIGATION_WAIT_MS = 6000;

/**
 * Runs in the page: does it look like an application (a file upload, or several fields including a name)?
 * Search, location and job-alert boxes do not qualify.
 */
const LOOKS_LIKE_APPLICATION = `(selector) => {
  const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const fields = Array.from(document.querySelectorAll(selector)).filter(visible);
  if (fields.some(f => f.type === 'file')) return true;
  const nameLike = fields.some(f => /first.?name|last.?name|full.?name|(^|[^a-z])name([^a-z]|$)|resume|\\bcv\\b/i.test(
    [f.name, f.id, f.getAttribute('placeholder'), f.getAttribute('aria-label'), (f.labels && f.labels[0] && f.labels[0].innerText) || ''].join(' ')));
  return fields.length >= 3 && nameLike;
}`;

async function looksLikeApplicationPage(page) {
  for (const frame of page.frames()) {
    try {
      if (await frame.evaluate(`(${LOOKS_LIKE_APPLICATION})(${JSON.stringify(FORM_FIELDS)})`)) return true;
    } catch (_) { /* frame navigating or detached */ }
  }
  return false;
}

async function findApplyControl(page) {
  for (const role of ['link', 'button']) {
    const matches = page.getByRole(role, { name: APPLY_NAME });
    const count = await matches.count();
    for (let i = 0; i < count; i++) {
      if (await matches.nth(i).isVisible()) return matches.nth(i);
    }
  }
  return null;
}

/** Click the control; resolves to the page that now holds the next step, or null if nothing happened. */
async function hop(page) {
  const control = await findApplyControl(page);
  if (!control) return null;

  const before = page.url();
  const popupOpened = page.context().waitForEvent('page', { timeout: NAVIGATION_WAIT_MS }).then(p => ({ popup: p }), () => null);
  const navigated = page.waitForURL(u => u.toString() !== before, { timeout: NAVIGATION_WAIT_MS, waitUntil: 'domcontentloaded' }).then(() => ({ same: true }), () => null);
  await control.click({ timeout: 8000 }).catch(() => {});
  const outcome = await Promise.race([popupOpened, navigated]);
  if (!outcome) return null;

  const target = outcome.popup || page;
  await target.waitForLoadState('domcontentloaded').catch(() => {});
  if (outcome.popup) await target.bringToFront().catch(() => {});
  await target.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
  await target.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await target.waitForTimeout(800); // let a client-side app finish rendering
  return target;
}

const hostOf = (url) => { try { return new URL(url).hostname; } catch (_) { return url; } };

/**
 * @param {import('playwright').Page} page
 * @param {{maxHops?: number}} options
 * @returns {Promise<{page: import('playwright').Page, hops: number, path: string[]}>}
 */
async function followApplyLink(page, { maxHops = 2 } = {}) {
  let current = page;
  let hops = 0;
  const path = [hostOf(page.url())];

  while (hops < maxHops && !(await looksLikeApplicationPage(current))) {
    const next = await hop(current);
    if (!next) break;
    current = next;
    hops += 1;
    path.push(hostOf(current.url()));
    log.info('Followed an Apply control', { hop: hops, to: path[path.length - 1] });
  }
  return { page: current, hops, path };
}

module.exports = { followApplyLink, looksLikeApplicationPage, APPLY_NAME };
