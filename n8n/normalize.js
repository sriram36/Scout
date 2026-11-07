'use strict';

/**
 * Job normalization for the Scout n8n workflow.
 *
 * Pure functions, no imports: build-workflow.js embeds this file's source into the
 * n8n Code node, and tests run it directly.
 *
 * Input  — the raw arrays from the three sources:
 *   himalayas : response.jobs
 *   arbeitnow : response.data
 *   remoteok  : the whole response array (element 0 is API metadata)
 * Output — rows shaped for the `listings` table.
 */

const KEYWORDS = /\b(?:engineer\w*|developer\w*|software|full[ -]?stack|back[ -]?end|front[ -]?end|node(?:\.?js)?|react\w*|python|ai|ml)\b/i;
const INTERN = /\bintern(?:ship)?s?\b/i;
const TRACKING_PARAMS = ['ref', 'fbclid', 'gclid'];
const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

// Pure string parsing on purpose: the n8n Code sandbox is not guaranteed to expose
// the URL global, and a thrown ReferenceError here would silently drop every job.
const URL_PATTERN = /^(https?):\/\/([^\/?#\s]+)([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i;

function isTrackingParam(pair) {
  const key = pair.split('=')[0].toLowerCase();
  return /^utm_/.test(key) || TRACKING_PARAMS.includes(key);
}

function canonicalizeUrl(url) {
  if (typeof url !== 'string') return null;
  const match = URL_PATTERN.exec(url.trim());
  if (!match) return null;

  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const pathname = match[3].replace(/\/+$/, '');
  const kept = (match[4] ? match[4].slice(1).split('&') : []).filter((pair) => pair && !isTrackingParam(pair));
  return `${scheme}://${host}${pathname}${kept.length > 0 ? `?${kept.join('&')}` : ''}`;
}

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', CAD: 'CA$', AUD: 'A$' };

function formatSalary(min, max, currency) {
  const ok = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (!ok(min) || !ok(max)) return 'Competitive';
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  const symbol = !code ? '$' : (CURRENCY_SYMBOLS[code] || `${code} `);
  return `${symbol}${min.toLocaleString('en-US')} - ${symbol}${max.toLocaleString('en-US')}`;
}

function cleanText(value, limit) {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim();
  return limit ? text.substring(0, limit) : text;
}

function toIso(value, inSeconds) {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'number' ? new Date(inSeconds ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Each mapper returns { title, company, location, salary, description, url, postedDate } or null.

function mapHimalayas(job) {
  if (typeof job.title !== 'string' || !KEYWORDS.test(job.title)) return null;
  const restrictions = Array.isArray(job.locationRestrictions) ? job.locationRestrictions.filter(Boolean) : [];
  return {
    title: job.title,
    company: job.companyName,
    location: restrictions.length > 0 ? restrictions.join(', ') : 'Remote',
    salary: formatSalary(job.minSalary, job.maxSalary, job.currency),
    description: job.excerpt,
    url: job.applicationLink || job.guid,
    postedDate: toIso(job.pubDate, true),
  };
}

function mapArbeitnow(job) {
  if (job.remote !== true) return null;
  if (typeof job.title !== 'string' || !KEYWORDS.test(job.title)) return null;
  return {
    title: job.title,
    company: job.company_name,
    location: str(job.location) || 'Remote',
    salary: 'Competitive',
    description: job.description,
    url: job.url,
    postedDate: toIso(job.created_at, true),
  };
}

function mapRemoteOk(job) {
  if (typeof job.position !== 'string' || !KEYWORDS.test(job.position)) return null;
  return {
    title: job.position,
    company: job.company,
    location: str(job.location) || 'Remote',
    salary: formatSalary(job.salary_min, job.salary_max),
    description: job.description,
    url: job.apply_url || job.url,
    postedDate: toIso(job.date, false),
  };
}

function normalize(input) {
  const { himalayas, arbeitnow, remoteok } = input || {};
  const sources = [
    { name: 'Himalayas', items: himalayas, map: mapHimalayas },
    { name: 'Arbeitnow', items: arbeitnow, map: mapArbeitnow },
    { name: 'RemoteOK', items: Array.isArray(remoteok) ? remoteok.slice(1) : [], map: mapRemoteOk },
  ];

  const rows = [];
  const seen = new Set();

  for (const { name, items, map } of sources) {
    if (!Array.isArray(items)) continue;
    for (const job of items) {
      if (!isObject(job)) continue;
      try {
        const m = map(job);
        if (!m) continue;

        const title = str(m.title);
        const company = str(m.company);
        const applyUrl = str(m.url);
        const canonical = canonicalizeUrl(applyUrl);
        if (!title || !company || !canonical || seen.has(canonical)) continue;
        seen.add(canonical);

        rows.push({
          title,
          company,
          location: m.location,
          salary: m.salary,
          source: name,
          description: cleanText(m.description, 400),
          apply_url: applyUrl,
          canonical_url: canonical,
          posted_date: m.postedDate,
          is_internship: INTERN.test(title),
        });
      } catch (_) {
        // one malformed job must never stop the batch
      }
    }
  }
  return rows;
}

module.exports = { normalize, canonicalizeUrl, formatSalary };
