'use strict';

/**
 * Read-only and learning routes of the local apply server.
 * (/apply stays in server.js because it launches a browser.)
 *
 * Dependencies are injected so the routes can be tested without a profile file or a database.
 */

const express = require('express');
const log = require('../logger');
const { correctionBodySchema, validateBody } = require('./schemas');
const { CORRECTABLE_MEANINGS } = require('../engine/meanings');

function createRouter({ getProfile, isHeadless, upsertFieldMapping }) {
  const router = express.Router();

  /** Health check for the dashboard's "server online" badge. */
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '2.0.0', headless: isHeadless });
  });

  /** Safe subset of the profile for display. Never email, phone or resume path. */
  router.get('/profile', (req, res) => {
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

  /** Meanings the dashboard may offer when the user teaches Scout a skipped field. */
  router.get('/meanings', (req, res) => {
    res.json({ meanings: CORRECTABLE_MEANINGS });
  });

  /** Record a user correction so the matcher can reuse it (stage 0). */
  router.post('/corrections', validateBody(correctionBodySchema), async (req, res) => {
    try {
      const { platform, domain, fieldSignature, meaning, confidence } = req.body;
      await upsertFieldMapping({ platform, domain, fieldSignature, meaning, confidence });
      log.info('Field mapping correction recorded', { platform, fieldSignature, meaning });
      res.json({ success: true });
    } catch (e) {
      log.error('Failed to record correction', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createRouter };
