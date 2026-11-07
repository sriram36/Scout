'use strict';

/**
 * Safety Filter — the last gate before any field is touched.
 *
 * shouldNeverTouch(field) must return true for any field that Scout
 * must NEVER fill, regardless of what the LLM or rules say.
 *
 * Default behaviour: uncertain → skip. Never: uncertain → guess.
 *
 * A field is judged on its own texts (name, id, label, aria-label, placeholder), on the
 * heading of the section it sits in, and on its option labels — a radio group's "label" is
 * often just its first option ("Male"), and a Name field under "Voluntary Self-Identification
 * of Disability" belongs to the form it is in, not to a rule about names.
 *
 * This is pattern-based and cannot be exhaustive; Scout never submits, so the candidate
 * still reviews everything.
 */

// ─── Pattern sets ─────────────────────────────────────────────────────────────

/** Demographic / EEOC fields — legally protected, must never be auto-filled */
const DEMOGRAPHIC_PATTERNS = [
  /gender/i,
  /pronouns?/i,
  /\bsex\b/i,
  /\brace\b/i,
  /ethnic/i,
  /hispanic/i,
  /latino/i,
  /veteran/i,
  /disabilit/i,
  /disabled/i,
  /accommodation/i,
  /eeoc/i,
  /\beeo\b/i,
  /equal.?employ/i,
  /equal.?opportunit/i,
  /self.?identif/i,
  /protected/i,
  /\bage\b/i,
  /birth.?date/i,
  /date.?of.?birth/i,
  /national.?origin/i,
  /religio/i,
  /marital/i,
  /pregnan/i,
  /sexual.?orientation/i,
  /transgender/i,
  /non.?binary/i,
  /^(male|female|man|woman)$/i,   // a radio group labelled by its first option
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
  /eligib/i,
  /right.?to.?work/i,
  /work.?permit/i,
  /\bvisa\b/i,
  /green.?card/i,
  /\bh-?1b\b/i,
  /\b(opt|cpt)\b/i,
  /permanent.?resident/i,
  /u\.?s\.?\s*person|\bitar\b|export.?control/i,
  /citizen/i,
  /immigration/i,
  /background.?(check|screen)/i,
  /convict/i,
  /felon/i,
  /criminal/i,
  /misdemean/i,
  /\bguilty\b|\bpled\b|\barrest/i,
  /clearance/i,
];

/** Fields that ask about someone else — never fill them with the candidate's own details. */
const THIRD_PARTY_PATTERNS = [
  /emergency.?contact/i,
  /\breferences?\b/i,
  /referred.?by/i,
  /next.?of.?kin/i,
  /\bspouse\b/i,
  /\bdependents?\b/i,
  /beneficiar/i,
  /\bguardian\b/i,
  /\bsupervisor\b/i,
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
  /\bpin\b/i,
  /\bssn\b/i,
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

/**
 * Section headings that mark everything beneath them as protected. Deliberately narrower than
 * the field patterns: a heading such as "Manage your application" or "Your data is protected"
 * must not block a whole form.
 */
const SECTION_DEMOGRAPHIC_PATTERNS = [
  /self.?identif/i,
  /\beeo\b/i,
  /equal.?(employ|opportunit)/i,
  /voluntary.?(self|disclos)/i,
  /demographic/i,
  /disabilit/i,
  /veteran/i,
  /\bgender\b/i,
  /\brace\b|ethnic/i,
  /sexual.?orientation/i,
];
const SECTION_LEGAL_PATTERNS = [
  /work.?auth/i,
  /sponsor/i,
  /\bvisa\b/i,
  /immigration/i,
  /citizen/i,
  /criminal|convict/i,
  /background.?check/i,
  /legal.?(status|declaration)/i,
];

/** Answer options that only appear in demographic questions. */
const OPTION_DEMOGRAPHIC_PATTERNS = [
  /decline to (self.?)?(identify|answer|disclose)/i,
  /hispanic|latino/i,
  /veteran/i,
  /i (do not|don'?t) wish to (answer|disclose|identify)/i,
  /prefer not to (say|answer|disclose)/i,
  /non.?binary|transgender/i,
  /american indian|alaska native|pacific islander/i,
];

const REASONS = {
  demographic: 'EEOC/demographic field — protected',
  captcha:     'CAPTCHA — requires human action',
  security:    'Security field — never auto-filled',
  legal:       'Legal-status question — answer this yourself',
  thirdParty:  'Asks about another person — fill this yourself',
  tracking:    'ATS tracking field — skipped',
  blocked:     'Blocked field name — skipped',
  hidden:      'Hidden field — skipped',
  password:    'Password field — skipped',
  invisible:   'Invisible field — skipped',
};

const OWN_TEXT_CATEGORIES = [
  ['demographic', DEMOGRAPHIC_PATTERNS],
  ['captcha',     CAPTCHA_PATTERNS],
  ['security',    SECURITY_PATTERNS],
  ['legal',       LEGAL_STATUS_PATTERNS],
  ['thirdParty',  THIRD_PARTY_PATTERNS],
  ['tracking',    TRACKING_PATTERNS],
];

const matchesAny = (text, patterns) => patterns.some(p => p.test(text));

/**
 * Why a field must be left alone, or null if it may be considered.
 * Accepts a FieldDescriptor or a plain string (key/name/label).
 * @returns {keyof REASONS | null}
 */
function classify(fieldOrString) {
  if (!fieldOrString) return null;

  const field = typeof fieldOrString === 'string' ? {} : fieldOrString;
  const texts = typeof fieldOrString === 'string'
    ? [fieldOrString]
    : [field.name, field.id, field.label, field.ariaLabel, field.placeholder].filter(Boolean);

  if (field.type === 'hidden')   return 'hidden';
  if (field.type === 'password') return 'password';
  if (field.visible === false)   return 'invisible';

  for (const [category, patterns] of OWN_TEXT_CATEGORIES) {
    if (texts.some(t => matchesAny(t, patterns))) return category;
  }
  if (texts.some(t => BLOCKED_EXACT.has(t))) return 'blocked';

  if (typeof field.sectionHeading === 'string') {
    if (matchesAny(field.sectionHeading, SECTION_DEMOGRAPHIC_PATTERNS)) return 'demographic';
    if (matchesAny(field.sectionHeading, SECTION_LEGAL_PATTERNS))       return 'legal';
  }

  if (Array.isArray(field.options)) {
    const labels = field.options.map(o => (typeof o === 'string' ? o : o && o.label)).filter(Boolean);
    if (labels.some(l => matchesAny(l, OPTION_DEMOGRAPHIC_PATTERNS))) return 'demographic';
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns true if the field must NEVER be touched by automation. */
function shouldNeverTouch(fieldOrString) {
  return classify(fieldOrString) !== null;
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
  const category = classify(fieldOrString);
  return category ? REASONS[category] : 'Safety rule matched';
}

module.exports = { shouldNeverTouch, isTooUncertain, getSkipReason };
