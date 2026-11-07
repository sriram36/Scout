/**
 * Corrections: teach Scout what a skipped form field means (POST /corrections).
 */

/** Mirrors the classifier vocabulary on the apply server (minus "unknown"). Used when GET /meanings is unavailable. */
const FALLBACK_MEANINGS = [
  'personal.firstName', 'personal.lastName', 'personal.email', 'personal.phone', 'personal.location',
  'links.linkedin', 'links.github', 'links.portfolio',
  'education.university', 'education.degree', 'education.specialization', 'education.graduationYear', 'education.cgpa',
  'experience.current.company', 'experience.current.role',
  'resume',
];

const WORDS = /** @type {Record<string, string>} */ ({
  github: 'GitHub', linkedin: 'LinkedIn', cgpa: 'CGPA', url: 'URL',
});

/**
 * "education.graduationYear" → "Education: graduation year"
 * @param {string} meaning
 * @returns {string}
 */
function meaningLabel(meaning) {
  const parts = String(meaning).split('.');
  const words = (/** @type {string} */ s) => s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(' ')
    .map(w => WORDS[w] || w)
    .join(' ');
  const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (parts.length === 1) return cap(words(parts[0]));
  return `${cap(words(parts[0]))}: ${parts.slice(1).map(words).join(' ')}`;
}

/**
 * @typedef {{ platform: string, fieldSignature: string, meaning: string, confidence: number, domain?: string }} CorrectionPayload
 */

/**
 * @param {{ platform?: string | null, signature?: string | null, meaning?: string | null, confidence?: number, applyUrl?: string | null }} input
 * @returns {CorrectionPayload}
 */
function buildCorrectionPayload({ platform, signature, meaning, confidence = 1, applyUrl }) {
  if (!signature || !String(signature).trim()) throw new Error('This field has no signature, so Scout cannot learn it.');
  if (!meaning || !String(meaning).trim()) throw new Error('Pick a meaning for this field first.');
  const c = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 1;
  /** @type {CorrectionPayload} */
  const payload = { platform: (platform && String(platform).trim()) || 'generic', fieldSignature: String(signature), meaning: String(meaning), confidence: c };
  if (applyUrl) {
    try { payload.domain = new URL(applyUrl).hostname; } catch { /* not a URL: leave domain out */ }
  }
  return payload;
}

/**
 * Skipped entries that can be taught (the server needs a field signature).
 * @param {any} report
 * @returns {{ field: string, label?: string, signature: string, meaning?: string, reason?: string }[]}
 */
function teachableSkipped(report) {
  const skipped = report && report.details && Array.isArray(report.details.skipped) ? report.details.skipped : [];
  return skipped.filter((/** @type {any} */ s) => s && typeof s.signature === 'string' && s.signature.trim());
}

/**
 * Human-readable message for a failed POST /corrections.
 * @param {number} status
 * @param {any} body
 * @returns {string}
 */
function describeCorrectionError(status, body) {
  if (body && typeof body.error === 'string') {
    const issues = Array.isArray(body.issues) ? body.issues.map((/** @type {any} */ i) => `${i.path}: ${i.message}`).join('; ') : '';
    return issues ? `${body.error}: ${issues}` : body.error;
  }
  return `The apply server answered with HTTP ${status}.`;
}

module.exports = { FALLBACK_MEANINGS, meaningLabel, buildCorrectionPayload, teachableSkipped, describeCorrectionError };
