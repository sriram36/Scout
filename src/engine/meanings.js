'use strict';

/**
 * Field meanings a user may assign when correcting a skipped field.
 * = text values the engine can resolve from the profile: the LLM list minus "unknown" and
 * "resume" (a file upload, handled by the adapters) plus the virtual full-name path the rule
 * matcher also produces.
 */

const { VALID_MEANINGS } = require('../llm/operations');

const CORRECTABLE_MEANINGS = [
  ...VALID_MEANINGS.filter(m => m !== 'unknown' && m !== 'resume'),
  'personal.fullName',
];

module.exports = { CORRECTABLE_MEANINGS };
