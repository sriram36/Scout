'use strict';

/**
 * DOM Field Descriptor Extractor
 *
 * Runs inside the Playwright page context via page.evaluate().
 * Collects structured metadata about every potentially fillable element
 * WITHOUT exposing raw CSS selectors to the LLM.
 *
 * Returns FieldDescriptor[] — one entry per interactive element.
 */

/**
 * This function is serialised and injected into the browser page.
 * Must be self-contained — no imports, no closures over Node.js variables.
 */
const DOM_EXTRACTOR_SCRIPT = /* javascript */ `
(function extractFields() {
  const INTERACTIVE_SELECTORS = 'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select';
  const elements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS));

  function getLabel(el) {
    // 1. Explicit <label for="id">
    if (el.id) {
      const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl) return lbl.innerText.trim();
    }
    // 2. Wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      // Remove the input itself from the clone so we don't include its value
      clone.querySelectorAll('input,textarea,select').forEach(n => n.remove());
      const t = clone.innerText.trim();
      if (t) return t;
    }
    // 3. aria-labelledby
    if (el.getAttribute('aria-labelledby')) {
      const ids = el.getAttribute('aria-labelledby').split(' ');
      const texts = ids.map(id => {
        const el2 = document.getElementById(id);
        return el2 ? el2.innerText.trim() : '';
      }).filter(Boolean);
      if (texts.length) return texts.join(' ');
    }
    // 4. Previous sibling text (common in custom forms)
    const prev = el.previousElementSibling;
    if (prev && ['LABEL','SPAN','P','DIV','LEGEND'].includes(prev.tagName)) {
      const t = prev.innerText.trim();
      if (t && t.length < 120) return t;
    }
    return null;
  }

  function getSectionHeading(el) {
    // Walk up the DOM looking for the nearest fieldset legend or h2/h3/h4
    let node = el.parentElement;
    let depth = 0;
    while (node && depth < 8) {
      const legend = node.querySelector(':scope > legend, :scope > h2, :scope > h3, :scope > h4');
      if (legend) return legend.innerText.trim();
      const heading = node.closest('fieldset, section, [role="group"]');
      if (heading) {
        const inner = heading.querySelector('legend, h2, h3, h4');
        if (inner) return inner.innerText.trim();
      }
      node = node.parentElement;
      depth++;
    }
    return null;
  }

  function getNearbyHelp(el) {
    // Look for associated help/hint text (common pattern: sibling with class hint/help/error)
    const parent = el.parentElement;
    if (!parent) return null;
    const help = parent.querySelector('.help, .hint, .field-help, [class*="help"], [class*="hint"], [id*="hint"], [id*="help"]');
    if (help) return help.innerText.trim().substring(0, 200);
    return null;
  }

  function getOptions(el) {
    if (el.tagName === 'SELECT') {
      return Array.from(el.options).map(o => ({ value: o.value, label: o.text.trim() }));
    }
    // For radio groups — find all radios with the same name
    if (el.type === 'radio' && el.name) {
      return Array.from(document.querySelectorAll('input[type="radio"][name="' + CSS.escape(el.name) + '"]'))
        .map(r => {
          let lbl = null;
          if (r.id) { const l = document.querySelector('label[for="' + CSS.escape(r.id) + '"]'); if (l) lbl = l.innerText.trim(); }
          if (!lbl) { const pl = r.closest('label'); if (pl) { const c = pl.cloneNode(true); c.querySelectorAll('input').forEach(n=>n.remove()); lbl = c.innerText.trim(); } }
          return { value: r.value, label: lbl || r.value };
        });
    }
    return [];
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetParent !== null;
  }

  // Build a unique stable selector for each element (used internally, not sent to LLM)
  function buildSelector(el, index) {
    if (el.id) return { type: 'id', value: el.id };
    if (el.name) return { type: 'name', value: el.name };
    return { type: 'index', value: index };
  }

  const descriptors = [];
  const seenRadioNames = new Set();

  elements.forEach((el, index) => {
    // Skip duplicate radio buttons — we only need one per group
    if (el.type === 'radio') {
      if (seenRadioNames.has(el.name)) return;
      seenRadioNames.add(el.name);
    }

    const label = getLabel(el);
    const descriptor = {
      elementId:    'field_' + index,
      selector:     buildSelector(el, index),
      tag:          el.tagName.toLowerCase(),
      type:         el.type || null,
      name:         el.name || null,
      id:           el.id   || null,
      ariaLabel:    el.getAttribute('aria-label') || null,
      placeholder:  el.placeholder || null,
      autocomplete: el.autocomplete || null,
      label:        label,
      required:     el.required || el.getAttribute('aria-required') === 'true',
      visible:      isVisible(el),
      sectionHeading: getSectionHeading(el),
      helpText:     getNearbyHelp(el),
      options:      getOptions(el),
    };
    descriptors.push(descriptor);
  });

  return descriptors;
})();
`;

/**
 * Run the extractor on a Playwright page and return FieldDescriptor[].
 * @param {import('playwright').Page} page
 * @returns {Promise<FieldDescriptor[]>}
 */
async function extractFields(page) {
  try {
    const descriptors = await page.evaluate(DOM_EXTRACTOR_SCRIPT);
    return Array.isArray(descriptors) ? descriptors : [];
  } catch (e) {
    const log = require('../logger');
    log.error('Field extraction failed', { error: e.message });
    return [];
  }
}

module.exports = { extractFields, DOM_EXTRACTOR_SCRIPT };
