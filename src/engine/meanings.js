'use strict';

/**
 * Field meanings a user may assign when correcting a skipped field.
 * = everything the engine can resolve from the profile: the LLM's list (minus "unknown")
 * plus the virtual full-name path the rule matcher also produces.
 */

const { VALID_MEANINGS } = require('../llm/operations');

const CORRECTABLE_MEANINGS = [
  ...VALID_MEANINGS.filter(m => m !== 'unknown'),
  'personal.fullName',
];

module.exports = { CORRECTABLE_MEANINGS };
