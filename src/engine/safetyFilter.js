'use strict';

/**
 * Safety Filter — the last gate before any field is touched.
 *
 * shouldNeverTouch(field) must return true for any field that Scout
 * must NEVER fill, regardless of what the LLM or rules say.
 *
 * Default behaviour: uncertain → skip. Never: uncertain → guess.
 */

// ─── Pattern sets ─────────────────────────────────────────────────────────────

/** Demographic / EEOC fields — legally protected, must never be auto-filled */
const DEMOGRAPHIC_PATTERNS = [
  /gender/i,
  /pronouns?/i,
  /sex\b/i,
  /race/i,
  /ethnic/i,
  /hispanic/i,
  /latino/i,
  /veteran/i,
  /disability/i,
  /disabled/i,
  /accommodation/i,
  /eeoc/i,
  /equal.?employ/i,
  /protected/i,
  /age\b/i,
  /birth.?date/i,
  /date.?of.?birth/i,
  /national.?origin/i,
  /religion/i,
  /marital/i,
  /pregnan/i,
  /sexual.?orientation/i,
];

/** CAPTCHA and bot-detection fields */
const CAPTCHA_PATTERNS = [
  /captcha/i,
  /recaptcha/i,
  /hcaptcha/i,
  /turnstile/i,
  /cf.?turnstile/i,
  /arkose/i,
  /funcaptcha/i,
  /g-recaptcha/i,
  /h-captcha/i,
];

/**
 * Legal-status questions (work authorization, sponsorship, citizenship, criminal record,
 * clearance). Wrong answers can have legal consequences, so the candidate answers these.
 */
const LEGAL_STATUS_PATTERNS = [
  /sponsor/i,
  /work.?auth/i,
  /authori[sz]ed.{0,30}work/i,
  /legally.{0,30}(authori[sz]ed|eligible|permitted|allowed)/i,
  /right.?to.?work/i,
  /work.?permit/i,
  /visa/i,
  /citizen/i,
  /immigration/i,
  /convict/i,
  /felon/i,
  /criminal/i,
  /clearance/i,
];

/** ATS internal / tracking fields that should never be manipulated */
const TRACKING_PATTERNS = [
  /^origin$/i,
  /^referer$/i,
  /^timezone$/i,
  /^source$/i,
  /social.?referral/i,
  /social.?source/i,
  /linked.?in.?data/i,
  /account.?id/i,
  /resume.?storage/i,
  /applicant.?id/i,
  /candidate.?id/i,
  /tracking/i,
  /utm_/i,
  /session.?id/i,
  /csrf/i,
  /authenticity.?token/i,
  /__/,          // double-underscore fields are often internal
];

/** Security fields — passwords, security questions, etc. */
const SECURITY_PATTERNS = [
  /password/i,
  /security.?question/i,
  /secret/i,
  /pin\b/i,
  /ssn/i,
  /social.?security/i,
  /tax.?id/i,
  /passport/i,
];

/** Exact field names that are always blocked (ATS-specific internal names) */
const BLOCKED_EXACT = new Set([
  'accountId', 'linkedInData', 'origin', 'referer', 'timezone',
  'socialReferralKey', 'socialSource', 'resumeStorageId', 'source',
  '__RequestVerificationToken', '_token', 'csrf_token', 'authenticity_token',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the field must NEVER be touched by automation.
 * Accepts a FieldDescriptor or a plain string (key/name/label).
 */
function shouldNeverTouch(fieldOrString) {
  if (!fieldOrString) return false;

  // Accept either a FieldDescriptor object or a raw string
  const texts = [];
  if (typeof fieldOrString === 'string') {
    texts.push(fieldOrString);
  } else {
    // FieldDescriptor
    if (fieldOrString.name)        texts.push(fieldOrString.name);
    if (fieldOrString.id)          texts.push(fieldOrString.id);
    if (fieldOrString.label)       texts.push(fieldOrString.label);
    if (fieldOrString.ariaLabel)   texts.push(fieldOrString.ariaLabel);
    if (fieldOrString.placeholder) texts.push(fieldOrString.placeholder);
    if (fieldOrString.type === 'hidden')   return true;
    if (fieldOrString.type === 'password') return true;
    if (fieldOrString.visible === false)   return true;
  }

  for (const text of texts) {
    if (!text) continue;

    // Exact match first (fastest)
    if (BLOCKED_EXACT.has(text)) return true;

    // Pattern checks
    for (const pattern of [...DEMOGRAPHIC_PATTERNS, ...CAPTCHA_PATTERNS, ...LEGAL_STATUS_PATTERNS, ...TRACKING_PATTERNS, ...SECURITY_PATTERNS]) {
      if (pattern.test(text)) return true;
    }
  }

  return false;
}

/**
 * Returns true if confidence is below the minimum threshold.
 * Anything below this threshold is skipped rather than guessed.
 */
function isTooUncertain(confidence, threshold = 0.65) {
  return typeof confidence !== 'number' || confidence < threshold;
}

/**
 * Returns a human-readable reason string for why a field was skipped.
 * Useful for the fill report shown in the dashboard.
 */
function getSkipReason(fieldOrString) {
  const texts = typeof fieldOrString === 'string'
    ? [fieldOrString]
    : [fieldOrString?.name, fieldOrString?.id, fieldOrString?.label, fieldOrString?.ariaLabel, fieldOrString?.placeholder].filter(Boolean);

  for (const text of texts) {
    if (!text) continue;
    if (DEMOGRAPHIC_PATTERNS.some(p => p.test(text))) return 'EEOC/demographic field — protected';
    if (CAPTCHA_PATTERNS.some(p => p.test(text)))     return 'CAPTCHA — requires human action';
    if (SECURITY_PATTERNS.some(p => p.test(text)))    return 'Security field — never auto-filled';
    if (LEGAL_STATUS_PATTERNS.some(p => p.test(text))) return 'Legal-status question — answer this yourself';
    if (TRACKING_PATTERNS.some(p => p.test(text)))    return 'ATS tracking field — skipped';
    if (BLOCKED_EXACT.has(text))                       return 'Blocked field name — skipped';
    if (fieldOrString?.type === 'hidden')              return 'Hidden field — skipped';
    if (fieldOrString?.type === 'password')            return 'Password field — skipped';
    if (fieldOrString?.visible === false)              return 'Invisible field — skipped';
  }
  return 'Safety rule matched';
}

module.exports = { shouldNeverTouch, isTooUncertain, getSkipReason };
