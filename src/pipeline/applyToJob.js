'use strict';

/**
 * Apply to one job: open a browser, detect the ATS, run its adapter, record progress.
 *
 * Used by both the POST /apply route and the application queue, so the queue calls it directly
 * instead of making an HTTP request to its own server (which would hit a fetch timeout on a
 * long fill). Dependencies are injected so the flow is testable without a real browser.
 *
 * It never submits: in headed mode the browser is left open for the human review.
 */

const { buildApplicationUpdate } = require('../api/applicationUpdate');
const { captureScreenshotDataUrl } = require('../engine/screenshot');

/**
 * @param {{
 *   launchBrowser: () => Promise<import('playwright').Browser>,
 *   detectATS: (url: string, page: any) => Promise<string>,
 *   getAdapter: (name: string) => { fill: Function },
 *   updateApplication: (id: string, update: object) => Promise<void>,
 *   isHeadless: boolean,
 *   log: { info: Function, error: Function },
 * }} deps
 */
function createApplier({ launchBrowser, detectATS, getAdapter, updateApplication, isHeadless, log }) {
  /**
   * @param {{url: string, jobId?: string, title?: string, company?: string, description?: string}} input
   * @returns {Promise<object>} the response body: platform, filled, skipped, errors, report, screenshot, status, note
   */
  return async function applyToJob({ url, jobId, title = '', company = '', description = '' }) {
    let browser = null;
    const startedAt = new Date().toISOString();

    try {
      const job = { id: jobId, title, company, description, apply_url: url };
      log.info('Starting application', { url: url.substring(0, 80), title, company });

      browser = await launchBrowser();
      const page = await browser.newPage();
      await page.setDefaultTimeout(30000);

      if (jobId) await updateApplication(jobId, { status: 'application_opened', started_at: startedAt });

      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      const atsName = await detectATS(url, page);
      const adapter = getAdapter(atsName);
      log.info('ATS detected', { ats: atsName });

      if (jobId) await updateApplication(jobId, { status: 'form_analyzed', ats_platform: atsName });

      const result = await adapter.fill(page, job, { useLLM: true, generateAnswers: true });

      const update = buildApplicationUpdate(result, atsName);
      if (jobId) await updateApplication(jobId, update);

      log.info('Autofill complete — awaiting human review', {
        ats: atsName,
        filled: result.filled?.length,
        skipped: result.skipped?.length,
        errors: result.errors?.length,
      });

      // Headless: take a screenshot and close. Headed: keep the browser open for the human review.
      let screenshot = null;
      if (isHeadless) {
        screenshot = await captureScreenshotDataUrl(page);
        await browser.close();
        browser = null;
      }

      return {
        platform: atsName,
        filled:   result.filled,
        skipped:  result.skipped,
        errors:   result.errors,
        report:   result.report,
        screenshot,
        status: update.status === 'awaiting_review' || !isHeadless ? 'awaiting_review' : 'autofill_completed',
        note: update.fill_report?.note || (isHeadless
          ? 'Application drafted in cloud browser.'
          : 'Browser is open — please review all fields, then submit manually.'),
      };
    } catch (error) {
      log.error('Application pipeline error', { error: error.message, stack: error.stack?.substring(0, 500) });

      if (browser) {
        try { await browser.close(); } catch (_) { /* already gone */ }
      }
      if (jobId) {
        await updateApplication(jobId, {
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        }).catch(() => {});
      }
      throw error;
    }
  };
}

module.exports = { createApplier };
