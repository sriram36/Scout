'use strict';

/**
 * Three-Stage Field Matcher
 *
 * Stage 1 — Deterministic rules: exact/regex match on name/id/label
 * Stage 2 — Semantic aliases: normalized text matching with a broader alias map
 * Stage 3 — LLM fallback: only genuinely ambiguous fields go to the AI
 *
 * Returns a FieldMatch: { meaning, confidence, stage, action }
 */

const { resolvePath } = require('../config/profile');
const { lookupFieldMapping } = require('../db/supabase');
const { normalizeText, fieldSignature } = require('./fieldIdentity');
const log = require('../logger');

// ─── Stage 1: Deterministic Rule Map ─────────────────────────────────────────
//
// Keys are regex patterns tested against: name, id, aria-label, placeholder, label
// Values are dot-paths into the candidate profile.
// Order matters — first match wins.

const DETERMINISTIC_RULES = [
  // ── Personal ──────────────────────────────────────────────────────────────
  { pattern: /^first[_\-. ]?name$|^fname$|^given[_\-. ]?name$|^candidate[_\-. ]?first/i, meaning: 'personal.firstName' },
  { pattern: /^last[_\-. ]?name$|^lname$|^surname$|^family[_\-. ]?name$|^candidate[_\-. ]?last/i, meaning: 'personal.lastName' },
  { pattern: /^(full[_\-. ]?)?name$|^your[_\-. ]?name$|^applicant[_\-. ]?name$|^candidate[_\-. ]?name$/i, meaning: 'personal.fullName' },
  { pattern: /email[_\-. ]?address|^email$|^e[_\-. ]?mail$|candidate[_\-. ]?email/i, meaning: 'personal.email' },
  { pattern: /phone[_\-. ]?number|^phone$|^mobile$|^cell$|^telephone$|^tel$/i, meaning: 'personal.phone' },
  { pattern: /^location$|^city$|^city[_\-. ]?state$|^current[_\-. ]?location$|^address$/i, meaning: 'personal.location' },

  // ── Links ─────────────────────────────────────────────────────────────────
  { pattern: /linkedin/i, meaning: 'links.linkedin' },
  { pattern: /github/i,   meaning: 'links.github' },
  { pattern: /portfolio|personal[_\-. ]?website|personal[_\-. ]?url|^website$/i, meaning: 'links.portfolio' },

  // ── Education ─────────────────────────────────────────────────────────────
  { pattern: /university|college|school[_\-. ]?name|institution|^school$/i, meaning: 'education.university' },
  { pattern: /^gpa$|^cgpa$|grade[_\-. ]?point|cumulative[_\-. ]?gpa/i, meaning: 'education.cgpa' },
  { pattern: /degree|qualification|diploma/i, meaning: 'education.degree' },
  { pattern: /major|specialization|field[_\-. ]?of[_\-. ]?study|concentration/i, meaning: 'education.specialization' },
  { pattern: /graduation[_\-. ]?year|grad[_\-. ]?year|expected[_\-. ]?(graduation|grad)|class[_\-. ]?of/i, meaning: 'education.graduationYear' },
];

// ─── Stage 2: Semantic Alias Map ──────────────────────────────────────────────
//
// Normalized label text → profile path. Used after Stage 1 fails.
// Keys are lowercased and stripped of punctuation for fuzzy matching.

const SEMANTIC_ALIASES = {
  'first name': 'personal.firstName',
  'given name': 'personal.firstName',
  'your first name': 'personal.firstName',
  'last name': 'personal.lastName',
  'family name': 'personal.lastName',
  'surname': 'personal.lastName',
  'your last name': 'personal.lastName',
  'full name': 'personal.fullName',
  'your name': 'personal.fullName',
  'name': 'personal.fullName',
  'email': 'personal.email',
  'email address': 'personal.email',
  'your email': 'personal.email',
  'phone': 'personal.phone',
  'phone number': 'personal.phone',
  'mobile number': 'personal.phone',
  'telephone': 'personal.phone',
  'mobile': 'personal.phone',
  'city': 'personal.location',
  'location': 'personal.location',
  'current location': 'personal.location',
  'where are you based': 'personal.location',
  'linkedin url': 'links.linkedin',
  'linkedin profile': 'links.linkedin',
  'linkedin': 'links.linkedin',
  'github url': 'links.github',
  'github profile': 'links.github',
  'github': 'links.github',
  'portfolio url': 'links.portfolio',
  'portfolio website': 'links.portfolio',
  'personal website': 'links.portfolio',
  'website': 'links.portfolio',
  'university': 'education.university',
  'college': 'education.university',
  'school': 'education.university',
  'educational institution': 'education.university',
  'institution name': 'education.university',
  'where did you study': 'education.university',
  'degree': 'education.degree',
  'highest degree': 'education.degree',
  'level of education': 'education.degree',
  'education level': 'education.degree',
  'major': 'education.specialization',
  'field of study': 'education.specialization',
  'specialization': 'education.specialization',
  'concentration': 'education.specialization',
  'graduation year': 'education.graduationYear',
  'expected graduation': 'education.graduationYear',
  'year of graduation': 'education.graduationYear',
  'gpa': 'education.cgpa',
  'cgpa': 'education.cgpa',
  'grade point average': 'education.cgpa',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute profile value for a meaning path.
 * 'personal.fullName' is a virtual computed path.
 */
function resolveValue(meaning) {
  if (meaning === 'personal.fullName') {
    const first = resolvePath('personal.firstName');
    const last  = resolvePath('personal.lastName');
    if (first && last) return `${first} ${last}`;
    return first || last || null;
  }
  if (meaning === 'experience.current.company') return resolvePath('experience.0.company');
  if (meaning === 'experience.current.role')    return resolvePath('experience.0.role');
  return resolvePath(meaning);
}

// ─── Stage 1 ──────────────────────────────────────────────────────────────────

function stage1Match(descriptor) {
  // An adapter that knows the platform's own field ids can pre-classify a field.
  if (descriptor._knownMeaning) {
    return { meaning: descriptor._knownMeaning, confidence: 0.99, stage: 1 };
  }

  const candidates = [
    descriptor.name,
    descriptor.id,
    descriptor.ariaLabel,
    descriptor.label,
    descriptor.placeholder,
    descriptor.autocomplete,
  ].filter(Boolean);

  for (const rule of DETERMINISTIC_RULES) {
    for (const text of candidates) {
      if (rule.pattern.test(text.trim())) {
        return { meaning: rule.meaning, confidence: 0.99, stage: 1 };
      }
    }
  }
  return null;
}

// ─── Stage 2 ──────────────────────────────────────────────────────────────────

function stage2Match(descriptor) {
  const candidates = [
    descriptor.label,
    descriptor.ariaLabel,
    descriptor.placeholder,
    descriptor.name,
    descriptor.id,
  ].filter(Boolean).map(normalizeText);

  for (const text of candidates) {
    if (SEMANTIC_ALIASES[text]) {
      return { meaning: SEMANTIC_ALIASES[text], confidence: 0.90, stage: 2 };
    }
    // Substring containment check for labels like "Your LinkedIn Profile URL"
    for (const [alias, meaning] of Object.entries(SEMANTIC_ALIASES)) {
      if (text.includes(alias)) {
        return { meaning, confidence: 0.80, stage: 2 };
      }
    }
  }
  return null;
}

// ─── Stage 3: LLM Fallback ───────────────────────────────────────────────────

async function stage3Match(descriptor, platform) {
  // Lazy-load to avoid circular deps
  const { classifyField } = require('../llm');

  // Build a minimal, non-PII description for the LLM
  const fieldDescription = {
    label:       descriptor.label,
    placeholder: descriptor.placeholder,
    ariaLabel:   descriptor.ariaLabel,
    name:        descriptor.name,
    type:        descriptor.type,
    tag:         descriptor.tag,
    section:     descriptor.sectionHeading,
    options:     descriptor.options?.slice(0, 20), // limit options sent to LLM
  };

  try {
    const result = await classifyField(fieldDescription);
    if (result && result.meaning && result.meaning !== 'unknown') {
      return {
        meaning:    result.meaning,
        confidence: result.confidence || 0.70,
        stage:      3,
      };
    }
  } catch (e) {
    log.warn('Stage 3 LLM classification failed', { error: e.message, field: descriptor.elementId });
  }

  return null;
}

// ─── Main Matcher ─────────────────────────────────────────────────────────────

/**
 * Classify a single FieldDescriptor through the 3-stage pipeline.
 *
 * @param {object} descriptor - FieldDescriptor
 * @param {object} options
 * @param {string} options.platform  - ATS platform name (for learned mappings)
 * @param {boolean} options.useLLM  - whether to allow Stage 3 (default true)
 * @returns {Promise<FieldMatch>}
 */
async function matchField(descriptor, { platform = 'unknown', useLLM = true } = {}) {
  // 0. Check learned mappings from Supabase (fastest)
  try {
    const learned = await lookupFieldMapping(platform, fieldSignature(descriptor));
    if (learned && learned.confidence >= 0.70) {
      return { meaning: learned.meaning, confidence: learned.confidence, stage: 0, action: 'fill' };
    }
  } catch (_) { /* non-fatal */ }

  // 1. Deterministic rules
  const s1 = stage1Match(descriptor);
  if (s1) return { ...s1, action: 'fill' };

  // 2. Semantic aliases
  const s2 = stage2Match(descriptor);
  if (s2) return { ...s2, action: 'fill' };

  // 3. LLM fallback (only if enabled and field has enough context)
  if (useLLM && (descriptor.label || descriptor.ariaLabel || descriptor.placeholder)) {
    const s3 = await stage3Match(descriptor, platform);
    if (s3) return { ...s3, action: 'fill' };
  }

  return { meaning: 'unknown', confidence: 0, stage: -1, action: 'skip' };
}

/**
 * Classify all descriptors. Returns parallel array of FieldMatch objects.
 */
async function matchFields(descriptors, options = {}) {
  const { cache } = options;   // optional Map(elementId -> match): a second pass must not re-classify
  const results = [];
  for (const descriptor of descriptors) {
    if (cache && cache.has(descriptor.elementId)) {
      results.push(cache.get(descriptor.elementId));
      continue;
    }
    const match = await matchField(descriptor, options);
    if (cache) cache.set(descriptor.elementId, match);
    results.push(match);
  }
  return results;
}

module.exports = { matchField, matchFields, resolveValue, normalizeText };
