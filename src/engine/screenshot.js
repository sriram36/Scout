'use strict';

/**
 * Capture a full-page screenshot as a PNG data URL.
 * Playwright's page.screenshot() returns a Buffer (it has no `encoding` option),
 * so the base64 conversion happens here.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<string>}
 */
async function captureScreenshotDataUrl(page) {
  const buffer = await page.screenshot({ fullPage: true });
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

module.exports = { captureScreenshotDataUrl };
