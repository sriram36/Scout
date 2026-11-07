'use strict';

/**
 * Central candidate profile loader.
 *
 * Priority:
 *  1. profile.json in project root  (preferred — gitignored)
 *  2. PROFILE_JSON environment variable  (Docker / CI)
 *
 * The schema is validated on load. Missing required fields emit warnings
 * but do NOT crash the server — Scout can still run with partial data.
 */

const fs   = require('fs');
const path = require('path');
const log  = require('../logger');

// ─── Schema definition ───────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['personal.firstName', 'personal.lastName', 'personal.email'];

// ─── Loader ──────────────────────────────────────────────────────────────────

let _profile = null;

function loadProfile() {
  if (_profile) return _profile;

  let raw = null;
  const profilePath = path.join(__dirname, '..', '..', 'profile.json');

  if (fs.existsSync(profilePath)) {
    try {
      raw = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      log.info('Profile loaded from profile.json');
    } catch (e) {
      log.error('Failed to parse profile.json', { error: e.message });
    }
  } else if (process.env.PROFILE_JSON) {
    try {
      raw = JSON.parse(process.env.PROFILE_JSON);
      log.info('Profile loaded from PROFILE_JSON env var');
    } catch (e) {
      log.error('Failed to parse PROFILE_JSON env var', { error: e.message });
    }
  }

  if (!raw) {
    log.warn('No profile.json or PROFILE_JSON found — profile will be empty');
    raw = {};
  }

  _profile = normalise(raw);
  validate(_profile);
  return _profile;
}

/**
 * Normalise handles both the new schema and legacy flat schemas from older
 * versions of Scout, so existing profile.json files don't instantly break.
 */
function normalise(raw) {
  // Already using new nested schema
  if (raw.personal) return raw;

  // Legacy flat schema migration
  log.warn('Legacy flat profile.json detected — auto-migrating to new schema. Please update your profile.json.');
  return {
    personal: {
      firstName:   raw.first_name || '',
      lastName:    raw.last_name  || '',
      email:       raw.email      || '',
      phone:       raw.phone      || '',
      location:    raw.location   || '',
    },
    links: {
      linkedin:  raw.links?.linkedin  || '',
      github:    raw.links?.github    || '',
      portfolio: raw.links?.portfolio || '',
    },
    education: {},
    experience: [],
    skills: {},
    projects: [],
    preferences: {},
    resume: {
      defaultPath: raw.resume_path || '',
    },
  };
}

function validate(profile) {
  for (const dotPath of REQUIRED_FIELDS) {
    const value = dotPath.split('.').reduce((obj, k) => obj?.[k], profile);
    if (!value) {
      log.warn(`Profile is missing required field: ${dotPath}`);
    }
  }
}

// ─── Accessor helpers ─────────────────────────────────────────────────────────

/** Get the full profile object */
function getProfile() {
  return loadProfile();
}

/**
 * Resolve a dot-path string against the profile.
 * e.g. resolvePath('personal.email') → 'user@example.com'
 */
function resolvePath(dotPath) {
  const profile = getProfile();
  return dotPath.split('.').reduce((obj, k) => obj?.[k], profile) ?? null;
}

/**
 * Return a sanitised subset of the profile safe to send to an LLM.
 * Strips the resume path and trims experience descriptions to save tokens.
 */
function profileForLLM() {
  const p = getProfile();
  return {
    personal: {
      firstName: p.personal?.firstName,
      lastName:  p.personal?.lastName,
      location:  p.personal?.location,
    },
    links:    p.links,
    education: p.education,
    skills:   p.skills,
    experience: (p.experience || []).map(e => ({
      company:      e.company,
      role:         e.role,
      type:         e.type,
      startDate:    e.startDate,
      endDate:      e.endDate,
      technologies: e.technologies,
      // description trimmed to avoid huge token usage
      description:  (e.description || '').substring(0, 300),
    })),
    projects: (p.projects || []).map(proj => ({
      name:         proj.name,
      description:  (proj.description || '').substring(0, 200),
      technologies: proj.technologies,
      url:          proj.url,
    })),
    preferences: p.preferences,
  };
}

/** Force reload of the profile (useful for tests / hot-reload) */
function reloadProfile() {
  _profile = null;
  return loadProfile();
}

module.exports = { getProfile, resolvePath, profileForLLM, reloadProfile };
