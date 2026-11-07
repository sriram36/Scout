'use strict';

/**
 * Scout — AI Job Application Copilot
 * Local application server
 *
 * Responsibilities:
 *  - Serve the /apply endpoint (triggers browser automation)
 *  - Serve the /profile endpoint (for dashboard display)
 *  - Poll Supabase for pending applications
 *
 * This file is intentionally thin. All business logic lives in src/.
 */

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const { chromium } = require('playwright');
const log        = require('./src/logger');
const { getProfile } = require('./src/config/profile');
const { getSupabase, updateApplication } = require('./src/db/supabase');
const { detectATS, getAdapter }          = require('./src/adapters/index');

// ─── Startup ──────────────────────────────────────────────────────────────────

const PORT     = process.env.PORT || 3001;
const isCloud  = process.platform === 'linux' || !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT);
const isHeadless = process.env.HEADLESS
  ? process.env.HEADLESS === 'true'
  : isCloud;

// Validate profile on startup
const profile = getProfile();
log.info('Scout application server starting', { port: PORT, headless: isHeadless });

// ─── Express setup ────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /profile
 * Returns a safe subset of the candidate profile for the dashboard.
 * Never returns email, phone, or resume path.
 */
app.get('/profile', (req, res) => {
  const p = getProfile();
  res.json({
    name: `${p.personal?.firstName || ''} ${p.personal?.lastName || ''}`.trim(),
    location: p.personal?.location,
    links: p.links,
    education: p.education,
    skills: p.skills,
    preferences: p.preferences,
  });
});

/**
 * GET /health
 * Simple health check for the dashboard to verify local server is running.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', headless: isHeadless });
});

/**
 * POST /apply
 * Body: { url, jobId?, title?, company?, description? }
 *
 * Launches Playwright, detects ATS, runs the fill pipeline,
 * and returns the fill report. Does NOT auto-submit.
 */
app.post('/apply', async (req, res) => {
  let browser = null;
  const startedAt = new Date().toISOString();

  try {
    const { url, jobId, title = '', company = '', description = '' } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing job URL' });

    const job = { id: jobId, title, company, description, apply_url: url };

    log.info('Starting application', { url: url.substring(0, 80), title, company });

    browser = await chromium.launch({
      headless: isHeadless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(30000);

    // Status: opening browser
    if (jobId) await updateApplication(jobId, { status: 'application_opened', started_at: startedAt });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    // Detect ATS
    const atsName = await detectATS(url, page);
    const adapter = getAdapter(atsName);
    log.info('ATS detected', { ats: atsName });

    if (jobId) await updateApplication(jobId, { status: 'form_analyzed', ats_platform: atsName });

    // Run the fill pipeline
    const result = await adapter.fill(page, job, { useLLM: true, generateAnswers: true });

    if (jobId) {
      await updateApplication(jobId, {
        status: 'autofill_completed',
        ats_platform: atsName,
        fields_detected: (result.report?.total || 0),
        fields_filled:   (result.report?.filled || 0),
        fields_skipped:  (result.report?.skipped || 0),
        ai_questions_answered: (result.report?.aiGenerated || 0),
        fill_report:     result.report,
      });
    }

    log.info('Autofill complete — awaiting human review', {
      ats: atsName,
      filled: result.filled?.length,
      skipped: result.skipped?.length,
      errors: result.errors?.length,
    });

    // In headless mode, take a screenshot and close
    let screenshotBase64 = null;
    if (isHeadless) {
      screenshotBase64 = await page.screenshot({ fullPage: true, encoding: 'base64' });
      await browser.close();
      browser = null;
    }
    // In headed mode, keep browser open for human review — DO NOT close

    res.json({
      platform: atsName,
      filled:   result.filled,
      skipped:  result.skipped,
      errors:   result.errors,
      report:   result.report,
      screenshot: screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : null,
      status: isHeadless ? 'autofill_completed' : 'awaiting_review',
      note: isHeadless
        ? 'Application drafted in cloud browser.'
        : 'Browser is open — please review all fields, then submit manually.',
    });

  } catch (error) {
    log.error('Application pipeline error', { error: error.message, stack: error.stack?.substring(0, 500) });

    if (browser) {
      try { await browser.close(); } catch (_) {}
    }

    const { jobId } = req.body || {};
    if (jobId) {
      await updateApplication(jobId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      }).catch(() => {});
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /corrections
 * Body: { platform, fieldSignature, meaning, confidence }
 * Records a user correction for the learning system.
 */
app.post('/corrections', async (req, res) => {
  try {
    const { platform, domain, fieldSignature, meaning, confidence = 1.0 } = req.body;
    if (!fieldSignature || !meaning) return res.status(400).json({ error: 'Missing fieldSignature or meaning' });

    const { upsertFieldMapping } = require('./src/db/supabase');
    await upsertFieldMapping({ platform, domain, fieldSignature, meaning, confidence });
    log.info('Field mapping correction recorded', { platform, fieldSignature, meaning });
    res.json({ success: true });
  } catch (e) {
    log.error('Failed to record correction', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  log.error('Unhandled server error', { error: err.message });
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// ─── Supabase polling ─────────────────────────────────────────────────────────

const supabase = getSupabase();
if (supabase) {
  log.info('Supabase polling enabled — checking for pending applications every 8 seconds');

  setInterval(async () => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*, listings!inner(*)')
        .eq('status', 'pending_application')
        .limit(1);

      if (error || !data || data.length === 0) return;

      const appRecord = data[0];
      const job = appRecord.listings;
      log.info('Picked up pending application', { jobId: job.id, title: job.title });

      await supabase
        .from('applications')
        .update({ status: 'applying', status_updated_at: new Date().toISOString() })
        .eq('id', appRecord.id);

      const applyUrl = job.apply_url || job.canonical_url;

      try {
        const resp = await fetch(`http://localhost:${PORT}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url:         applyUrl,
            jobId:       appRecord.id,
            title:       job.title,
            company:     job.company,
            description: job.description || '',
          }),
        });

        const result = await resp.json();

        if (result.error) throw new Error(result.error);

        // Status updated inside /apply route — just log here
        log.info('Application autofill complete — awaiting human review', { jobId: job.id });

      } catch (err) {
        log.error('Application pipeline failed', { jobId: job.id, error: err.message });
        await updateApplication(appRecord.id, {
          status: 'failed',
          error_message: err.message,
          completed_at: new Date().toISOString(),
        });
      }

    } catch (e) {
      // Ignore transient network errors during polling
    }
  }, 8000);
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  log.info(`Scout apply-service ready on port ${PORT}`);
  log.info('Endpoints: POST /apply, GET /profile, GET /health, POST /corrections');
});
