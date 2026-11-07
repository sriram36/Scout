'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, canonicalizeUrl, formatSalary } = require('../n8n/normalize');

const himalayasJob = (over = {}) => ({
  title: 'Senior Backend Engineer',
  companyName: 'Acme',
  locationRestrictions: ['US', 'Canada'],
  minSalary: 80000,
  maxSalary: 120000,
  applicationLink: 'https://boards.greenhouse.io/acme/jobs/1?utm_source=himalayas',
  guid: 'g1',
  excerpt: '<p>Build APIs</p>',
  pubDate: 1700000000,
  ...over,
});

const arbeitnowJob = (over = {}) => ({
  title: 'React Developer',
  company_name: 'Beta',
  location: 'Berlin',
  remote: true,
  url: 'https://www.arbeitnow.com/jobs/beta/react-1',
  description: '<b>Hi</b>&nbsp;there &amp; welcome',
  created_at: 1700000100,
  ...over,
});

const remoteokJob = (over = {}) => ({
  position: 'Python Engineer',
  company: 'Gamma',
  location: 'Worldwide',
  salary_min: 90000,
  salary_max: 110000,
  url: 'https://remoteok.com/remote-jobs/1',
  apply_url: 'https://jobs.lever.co/gamma/abc',
  description: '<p>x</p>',
  date: '2024-01-02T03:04:05+00:00',
  ...over,
});

// ── mapping ──────────────────────────────────────────────────────────────────

test('maps a Himalayas job to the listings row shape', () => {
  const [row] = normalize({ himalayas: [himalayasJob()] });
  assert.deepEqual(row, {
    title: 'Senior Backend Engineer',
    company: 'Acme',
    location: 'US, Canada',
    salary: '$80,000 - $120,000',
    source: 'Himalayas',
    description: 'Build APIs',
    apply_url: 'https://boards.greenhouse.io/acme/jobs/1?utm_source=himalayas',
    canonical_url: 'https://boards.greenhouse.io/acme/jobs/1',
    posted_date: new Date(1700000000 * 1000).toISOString(),
    is_internship: false,
  });
});

test('Arbeitnow: only remote jobs, HTML stripped and entities decoded', () => {
  const rows = normalize({ arbeitnow: [arbeitnowJob(), arbeitnowJob({ title: 'Node Developer', remote: false, url: 'https://www.arbeitnow.com/jobs/x' })] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'Arbeitnow');
  assert.equal(rows[0].description, 'Hi there & welcome');
  assert.equal(rows[0].salary, 'Competitive');
  assert.equal(rows[0].company, 'Beta');
});

test('RemoteOK: skips the metadata element and prefers apply_url', () => {
  const rows = normalize({ remoteok: [{ legal: 'metadata' }, remoteokJob()] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].apply_url, 'https://jobs.lever.co/gamma/abc');
  assert.equal(rows[0].canonical_url, 'https://jobs.lever.co/gamma/abc');
  assert.equal(rows[0].salary, '$90,000 - $110,000');
  assert.equal(rows[0].posted_date, '2024-01-02T03:04:05.000Z');
});

test('RemoteOK falls back to url when apply_url is missing', () => {
  const [row] = normalize({ remoteok: [{}, remoteokJob({ apply_url: undefined })] });
  assert.equal(row.apply_url, 'https://remoteok.com/remote-jobs/1');
});

test('description is capped at 400 characters', () => {
  const [row] = normalize({ himalayas: [himalayasJob({ excerpt: 'a'.repeat(1000) })] });
  assert.equal(row.description.length, 400);
});

test('posted_date is null when the source date is unparseable or missing', () => {
  const rows = normalize({ himalayas: [himalayasJob({ pubDate: 'garbage' }), himalayasJob({ pubDate: undefined, applicationLink: 'https://a.com/2' })] });
  assert.equal(rows[0].posted_date, null);
  assert.equal(rows[1].posted_date, null);
});

test('location defaults to Remote when the source gives none', () => {
  const [row] = normalize({ himalayas: [himalayasJob({ locationRestrictions: [] })] });
  assert.equal(row.location, 'Remote');
});

// ── filtering ────────────────────────────────────────────────────────────────

test('keyword filter is case-insensitive and word-bounded', () => {
  const titles = ['FRONTEND developer', 'AI Researcher', 'Retail Store Manager', 'Marketing Manager', 'Full-Stack Developer'];
  const rows = normalize({
    himalayas: titles.map((title, i) => himalayasJob({ title, applicationLink: `https://a.com/${i}` })),
  });
  assert.deepEqual(rows.map(r => r.title), ['FRONTEND developer', 'AI Researcher', 'Full-Stack Developer']);
});

test('rows missing title, company or url are dropped', () => {
  const rows = normalize({
    himalayas: [
      himalayasJob({ title: undefined }),
      himalayasJob({ companyName: undefined, applicationLink: 'https://a.com/2' }),
      himalayasJob({ applicationLink: undefined, guid: undefined }),
    ],
  });
  assert.deepEqual(rows, []);
});

// ── dedup + canonical urls ───────────────────────────────────────────────────

test('canonicalizeUrl strips tracking params, fragment and trailing slash; keeps real params and path case', () => {
  assert.equal(
    canonicalizeUrl('https://Example.com/Jobs/1/?utm_campaign=x&id=5&ref=tw&fbclid=a&gclid=b#top'),
    'https://example.com/Jobs/1?id=5'
  );
  assert.equal(canonicalizeUrl('https://example.com/'), 'https://example.com');
});

test('canonicalizeUrl returns null for non-http(s) or unparseable input', () => {
  for (const bad of ['ftp://x.com/a', 'javascript:alert(1)', 'garbage', '', undefined, null, 42]) {
    assert.equal(canonicalizeUrl(bad), null);
  }
});

test('the same job with URL variants collapses to one row', () => {
  const rows = normalize({
    himalayas: [
      himalayasJob({ applicationLink: 'https://x.com/j/1/' }),
      himalayasJob({ applicationLink: 'https://X.com/j/1?utm_source=a#frag' }),
    ],
  });
  assert.equal(rows.length, 1);
});

test('across sources the first source wins', () => {
  const rows = normalize({
    himalayas: [himalayasJob({ applicationLink: 'https://x.com/j/1' })],
    arbeitnow: [arbeitnowJob({ url: 'https://x.com/j/1/?utm_source=an' })],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'Himalayas');
});

// ── robustness ───────────────────────────────────────────────────────────────

test('empty, missing and garbage inputs return [] without throwing', () => {
  assert.deepEqual(normalize({}), []);
  assert.deepEqual(normalize(), []);
  assert.deepEqual(normalize({ himalayas: null, arbeitnow: 'oops', remoteok: [{}] }), []);
  assert.deepEqual(normalize({ himalayas: [null, 5, 'x', himalayasJob({ title: { not: 'a string' } })] }), []);
});

test('one bad source does not stop the others', () => {
  const rows = normalize({ himalayas: 'boom', arbeitnow: [arbeitnowJob()], remoteok: [{}, remoteokJob()] });
  assert.deepEqual(rows.map(r => r.source), ['Arbeitnow', 'RemoteOK']);
});

// ── internship flag + salary ─────────────────────────────────────────────────

test('is_internship matches intern/internship titles but not Internal', () => {
  const titles = ['Software Engineering Intern', 'Engineering Internship', 'Senior Engineer', 'Internal Tools Engineer'];
  const rows = normalize({
    himalayas: titles.map((title, i) => himalayasJob({ title, applicationLink: `https://a.com/${i}` })),
  });
  assert.deepEqual(rows.map(r => r.is_internship), [true, true, false, false]);
});

test('formatSalary', () => {
  assert.equal(formatSalary(80000, 120000), '$80,000 - $120,000');
  assert.equal(formatSalary(undefined, 120000), 'Competitive');
  assert.equal(formatSalary(80000, null), 'Competitive');
  assert.equal(formatSalary('a', 'b'), 'Competitive');
  assert.equal(formatSalary(0, 0), 'Competitive');
});

test('salary uses the currency symbol the source gave, defaulting to dollars', () => {
  const salaryFor = (currency) => normalize({ himalayas: [himalayasJob({ currency })] })[0].salary;
  assert.equal(salaryFor('EUR'), '€80,000 - €120,000');
  assert.equal(salaryFor('GBP'), '£80,000 - £120,000');
  assert.equal(salaryFor('INR'), '₹80,000 - ₹120,000');
  assert.equal(salaryFor('CHF'), 'CHF 80,000 - CHF 120,000');
  assert.equal(salaryFor('USD'), '$80,000 - $120,000');
  assert.equal(salaryFor(undefined), '$80,000 - $120,000');
  assert.equal(formatSalary(80000, 120000, 'EUR'), '€80,000 - €120,000');
});
