'use strict';

/**
 * Playwright Executor
 *
 * Consumes a FillPlan[] and performs the actual browser interactions.
 * The LLM never calls this directly — it only informs the FillPlan.
 *
 * Handles:
 *  - text / email / tel / url inputs
 *  - textareas
 *  - <select> (value-matched, not arbitrary text insertion)
 *  - radio buttons (option-matched)
 *  - checkboxes
 *  - file uploads
 */

const fs  = require('fs');
const { describeEntry } = require('./fieldIdentity');
const log = require('../logger').child
  ? require('../logger').child({ component: 'Executor' })
  : require('../logger');

/**
 * Execute a FillPlan against a Playwright page.
 *
 * @param {import('playwright').Page} page
 * @param {object[]} fillPlan    — from fillPlan.buildFillPlan()
 * @returns {Promise<ExecutionResult>}
 */
async function executeFillPlan(page, fillPlan) {
  const filled  = [];
  const skipped = [];
  const errors  = [];

  for (const entry of fillPlan) {
    if (entry.action === 'skip') {
      skipped.push({ ...describeEntry(entry), reason: entry.skipReason });
      continue;
    }

    try {
      const success = await executeEntry(page, entry);
      if (success) {
        filled.push({
          ...describeEntry(entry),
          value:        entry.value,
          confidence:   entry.confidence,
          stage:        entry.stage,
          isAIGenerated: entry.isAIGenerated,
          via:          stageLabel(entry.stage),
        });
      } else {
        skipped.push({ ...describeEntry(entry), reason: 'Execution returned false' });
      }
    } catch (e) {
      log.warn('Field execution error', { field: entry.elementId, error: e.message });
      errors.push({ ...describeEntry(entry), error: e.message });
    }
  }

  log.info('Execution complete', { filled: filled.length, skipped: skipped.length, errors: errors.length });
  return { filled, skipped, errors };
}

// ─── Entry dispatcher ─────────────────────────────────────────────────────────

async function executeEntry(page, entry) {
  const { action, selector, value, descriptor } = entry;

  const locator = buildLocator(page, selector);

  // Verify element exists before acting
  const count = await locator.count();
  if (count === 0) {
    log.warn('Element not found', { selector, elementId: entry.elementId });
    return false;
  }

  switch (action) {
    case 'fill':     return fillText(locator, value);
    case 'select':   return selectOption(locator, value, descriptor.options);
    case 'radio':    return selectRadio(page, descriptor, value);
    case 'checkbox': return handleCheckbox(locator, value);
    case 'upload':   return uploadFile(locator, value);
    default:
      log.warn('Unknown action', { action, elementId: entry.elementId });
      return false;
  }
}

// ─── Action implementations ───────────────────────────────────────────────────

async function fillText(locator, value) {
  await locator.first().focus();
  await locator.first().fill(String(value));
  return true;
}

async function selectOption(locator, value, options = []) {
  // Try matching by value first, then by label text
  const valueStr = String(value);

  // Direct value match
  try {
    await locator.first().selectOption({ value: valueStr });
    return true;
  } catch (_) {}

  // Label match (case-insensitive, normalized)
  if (options.length > 0) {
    const normalize = s => s.toLowerCase().replace(/[.\-_]/g, ' ').trim();
    const normValue = normalize(valueStr);

    const byLabel = options.find(o => normalize(o.label) === normValue);
    if (byLabel) {
      await locator.first().selectOption({ value: byLabel.value });
      return true;
    }

    // Partial/contains match
    const partial = options.find(o => normalize(o.label).includes(normValue) || normValue.includes(normalize(o.label)));
    if (partial) {
      await locator.first().selectOption({ value: partial.value });
      return true;
    }

    // Degree equivalence mappings (B.Tech → Bachelor's Degree etc.)
    const degreeMap = {
      'btech': ["bachelor", "b.tech", "be", "b.e"],
      'mtech': ["master", "m.tech", "me", "m.e"],
      'bsc':   ["bachelor", "b.sc", "bsc"],
      'msc':   ["master", "m.sc", "msc"],
      'phd':   ["phd", "ph.d", "doctor"],
      'mba':   ["mba", "master of business"],
    };
    const normLower = normValue.replace(/\s+/g, '');
    for (const [key, aliases] of Object.entries(degreeMap)) {
      if (aliases.some(a => normLower.includes(a.replace(/\s+/g, '')))) {
        const match = options.find(o => aliases.some(a => normalize(o.label).includes(a.replace(/[.\-]/g, ''))));
        if (match) {
          await locator.first().selectOption({ value: match.value });
          return true;
        }
      }
    }
  }

  log.warn('Could not match select option', { value: valueStr, availableOptions: options.map(o => o.label) });
  return false;
}

async function selectRadio(page, descriptor, value) {
  if (!descriptor.options || descriptor.options.length === 0) return false;
  const normalize = s => s.toLowerCase().replace(/[.\-_]/g, ' ').trim();
  const normValue = normalize(String(value));

  const match = descriptor.options.find(o =>
    normalize(o.label) === normValue ||
    normalize(o.value) === normValue ||
    normalize(o.label).includes(normValue) ||
    normValue.includes(normalize(o.label))
  );

  if (!match) return false;

  // Click the radio button with the matched value
  const radioSelector = `input[type="radio"][name="${descriptor.name}"][value="${match.value}"]`;
  try {
    await page.locator(radioSelector).first().click();
    return true;
  } catch (_) {
    // Fallback: click the label
    try {
      const labelSelector = `label:has(input[type="radio"][value="${match.value}"])`;
      await page.locator(labelSelector).first().click();
      return true;
    } catch (e) {
      log.warn('Radio click failed', { error: e.message });
      return false;
    }
  }
}

async function handleCheckbox(locator, value) {
  const shouldCheck = /yes|true|1|agree|accept/i.test(String(value));
  const isChecked = await locator.first().isChecked();
  if (shouldCheck && !isChecked) {
    await locator.first().check();
  } else if (!shouldCheck && isChecked) {
    await locator.first().uncheck();
  }
  return true;
}

async function uploadFile(locator, filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    log.warn('Resume file not found', { path: filePath });
    return false;
  }
  await locator.first().setInputFiles(filePath);
  return true;
}

// ─── Locator builder ──────────────────────────────────────────────────────────

function buildLocator(page, selector) {
  if (!selector) throw new Error('No selector provided');
  switch (selector.type) {
    case 'id':    return page.locator(`#${CSS_escape(selector.value)}`);
    case 'name':  return page.locator(`[name="${selector.value}"]`);
    case 'index': return page.locator('input, textarea, select').nth(selector.value);
    default:      throw new Error(`Unknown selector type: ${selector.type}`);
  }
}

// Basic CSS escaping for IDs
function CSS_escape(str) {
  return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function stageLabel(stage) {
  return { 0: 'learned', 1: 'rule', 2: 'semantic', 3: 'llm', '-1': 'safety' }[stage] ?? 'unknown';
}

module.exports = { executeFillPlan };
