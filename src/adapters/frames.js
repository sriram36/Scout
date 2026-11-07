'use strict';

/**
 * Where is the form? Many company career pages embed their ATS form in an iframe, so the page
 * itself has little or nothing to fill. pickTarget returns the page, or the child frame that has
 * clearly more fillable fields.
 */

const FORM_FIELDS = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';

/** A page with at least this many fields is assumed to hold the form itself. */
const FORM_ON_PAGE_THRESHOLD = 4;

async function countFields(target) {
  try {
    return await target.locator(FORM_FIELDS).count();
  } catch (_) {
    return 0; // frame navigating or detached
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {{waitMs?: number}} options  how long to wait for a slow iframe to appear
 * @returns {Promise<import('playwright').Page | import('playwright').Frame>}
 */
async function pickTarget(page, { waitMs = 3000 } = {}) {
  const deadline = Date.now() + waitMs;
  while (true) {
    const children = page.frames().filter(f => f !== page.mainFrame());
    if (children.length === 0) return page;

    const onPage = await countFields(page.mainFrame());
    if (onPage >= FORM_ON_PAGE_THRESHOLD) return page;

    let best = { target: page, count: onPage };
    for (const frame of children) {
      const n = await countFields(frame);
      if (n > best.count) best = { target: frame, count: n };
    }
    if (best.target !== page || Date.now() >= deadline) return best.target;
    await page.waitForTimeout(250);
  }
}

module.exports = { pickTarget, countFields, FORM_FIELDS };
