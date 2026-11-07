'use strict';

/**
 * Picks which <option> of a <select> corresponds to a profile value.
 * Pure: works on the option list captured at extraction time, so the executor never has to
 * guess against the live page (a blind selectOption waits out Playwright's whole timeout).
 */

const normalise = (s) => String(s ?? '').toLowerCase().replace(/[.\-_]/g, ' ').replace(/\s+/g, ' ').trim();
const letters = (s) => normalise(s).replace(/[^a-z]/g, '');

/** Placeholder entries such as "", "Select…", "--Please choose--" are never real answers. */
function isPlaceholder(option) {
  const value = String(option.value ?? '').trim();
  const label = normalise(option.label).replace(/[^a-z ]/g, '').trim();
  return value === '' || label === '' || /^(select|please select|please choose|choose|pick)\b/.test(label);
}

const BACHELOR = new Set(['btech', 'be', 'bsc', 'bs', 'ba', 'bcom', 'bca', 'beng', 'bba']);
const MASTER = new Set(['mtech', 'me', 'msc', 'ms', 'ma', 'mcom', 'mca', 'meng']);

/**
 * Coarse degree level of a text: 'bachelor' | 'master' | 'mba' | 'doctorate' | 'associate' | null.
 */
function degreeLevel(text) {
  const s = letters(text);
  if (!s) return null;
  if (s.includes('mba') || s.includes('masterofbusiness')) return 'mba';
  if (s.includes('phd') || s.includes('doctor')) return 'doctorate';
  if (s.includes('associate')) return 'associate';
  if (s.includes('bachelor') || BACHELOR.has(s)) return 'bachelor';
  if (s.includes('master') || MASTER.has(s)) return 'master';
  return null;
}

/**
 * @param {string|number} value  profile value, e.g. "B.Tech"
 * @param {{value: string, label: string}[]} options
 * @returns {{value: string, label: string} | null}
 */
function chooseOption(value, options) {
  const wanted = normalise(value);
  if (!wanted || !Array.isArray(options)) return null;
  const real = options.filter(o => !isPlaceholder(o));
  if (real.length === 0) return null;

  const byValue = real.find(o => normalise(o.value) === wanted);
  if (byValue) return byValue;

  const byLabel = real.find(o => normalise(o.label) === wanted);
  if (byLabel) return byLabel;

  const level = degreeLevel(value);
  if (level) {
    const byLevel = real.find(o => degreeLevel(o.label) === level || degreeLevel(o.value) === level);
    return byLevel || null; // never fall through to a different degree level
  }

  const contained = real.find((o) => {
    const label = normalise(o.label);
    return label.length >= 3 && wanted.length >= 3 && (label.includes(wanted) || wanted.includes(label));
  });
  return contained || null;
}

module.exports = { chooseOption, degreeLevel, isPlaceholder };
