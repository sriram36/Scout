'use strict';

/**
 * Scout — AI Job Application Copilot
 * Local application server
 *
 * Responsibilities:
 *  - Serve the /apply endpoint (triggers browser automation)
 *  - Serve the /profile endpoint (for dashboard display)
 *  - Pick up pending applications from Supabase (Realtime + fallback poll)
 *
 * This file is intentionally thin. All business logic lives in src/.
 */

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const { chromium } = require('playwright');
const log        = require('./src/logger');
const { getProfile } = require('./src/config/profile');
const {
  getSupabase,
  updateApplication,
  upsertFieldMapping,
  fetchPendingApplication,
  claimApplication,
  markApplicationFailed,
  markInterruptedApplications,
  subscribePendingApplications,
} = require('./src/db/supabase');
const { createCorsOptions, resolveHost } = require('./src/api/access');
const { detectATS, getAdapter }          = require('./src/adapters/index');
const { applyBodySchema, validateBody } = require('./src/api/schemas');
const { createRouter }                   = require('./src/api/routes');
const { createApplier }                  = require('./src/pipeline/applyToJob');
const { createQueue }                    = require('./src/queue/applicationQueue');

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
app.use(cors(createCorsOptions()));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use(createRouter({ getProfile, isHeadless, upsertFieldMapping })); // /health, /profile, /meanings, /corrections

const applyToJob = createApplier({
  launchBrowser: () => chromium.launch({ headless: isHeadless, args: ['--no-sandbox', '--disable-setuid-sandbox'] }),
  detectATS,
  getAdapter,
  updateApplication,
  isHeadless,
  log,
});

/**
 * POST /apply
 * Body: { url, jobId?, title?, company?, description? }
 *
 * Launches Playwright, detects the ATS, runs the fill pipeline and returns the fill report.
 * Does NOT auto-submit.
 */
app.post('/apply', validateBody(applyBodySchema), async (req, res) => {
  try {
    res.json(await applyToJob(req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  log.error('Unhandled server error', { error: err.message });
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// ─── Application queue (Supabase Realtime + fallback poll) ────────────────────

/**
 * Run one queued application. Throws on failure so the queue can mark it failed.
 * (Called directly: an HTTP request to this server would hit fetch's 5-minute header timeout on a long fill.)
 */
async function runQueuedApplication(appRecord) {
  const job = appRecord.listings;
  const input = applyBodySchema.parse({
    url:         job.apply_url || job.canonical_url,
    jobId:       appRecord.id,
    title:       job.title,
    company:     job.company,
    description: job.description || '',
  });
  await applyToJob(input);
  log.info('Application autofill complete — awaiting human review', { id: appRecord.id });
}

const queue = createQueue({
  store: {
    fetchPending: fetchPendingApplication,
    claim:        claimApplication,
    markFailed:   markApplicationFailed,
    subscribe:    subscribePendingApplications,
    recoverInterrupted: markInterruptedApplications,
  },
  runApply: runQueuedApplication,
  log,
  // How often the fallback poll looks for queued applications (Realtime normally wakes it sooner).
  intervalMs: Number(process.env.QUEUE_POLL_MS) || 30000,
});

// ─── Start ────────────────────────────────────────────────────────────────────

const HOST = resolveHost();

app.listen(PORT, HOST, () => {
  log.info(`Scout apply-service ready on ${HOST}:${PORT}`);
  log.info('Endpoints: POST /apply, GET /health, GET /profile, GET /meanings, POST /corrections');

  if (getSupabase()) {
    queue.start();
    log.info('Application queue started — Realtime pickup with a 30s fallback poll');
  } else {
    log.warn('Supabase not configured — queued applications will not be picked up');
  }
});
