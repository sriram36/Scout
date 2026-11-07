'use strict';

/**
 * Field identity helpers shared by the matcher (learned mappings) and the fill report.
 *
 * The signature is the exact key under which a learned mapping is stored and looked up,
 * so a correction made from the dashboard must use the signature the report carries.
 */

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/[_\-.,\/#!$%^&*;:{}=`~()]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {{name?: string, id?: string, label?: string}} descriptor
 * @returns {string}
 */
function fieldSignature(descriptor) {
  const d = descriptor || {};
  return [d.name, d.id, normalizeText(d.label)].filter(Boolean).join('|');
}

/**
 * Human-readable name for a field.
 * @param {object} descriptor
 * @param {string} fallback
 */
function fieldLabel(descriptor, fallback = '') {
  const d = descriptor || {};
  return d.label || d.ariaLabel || d.placeholder || d.name || d.id || fallback;
}

/**
 * The identifying part of a fill-report entry.
 * @param {{elementId: string, meaning?: string, descriptor?: object}} entry
 */
function describeEntry(entry) {
  return {
    field:     entry.elementId,
    label:     fieldLabel(entry.descriptor, entry.elementId),
    // protected fields get no signature: a learned mapping could never apply to them
    signature: entry.meaning === 'protected' ? '' : fieldSignature(entry.descriptor),
    meaning:   entry.meaning,
  };
}

module.exports = { normalizeText, fieldSignature, fieldLabel, describeEntry };
