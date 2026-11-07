'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fuzzyScore, filterJobs, searchJobs, sortJobs } = require('../dashboard/src/lib/filters');

const jobs = [
  { id: '1', title: 'Software Engineer Intern', company: 'Stripe', location: 'Bengaluru', source: 'LinkedIn', isInternship: true, status: 'Discovered', discoveredAt: '2026-11-07T08:00:00Z' },
  { id: '2', title: 'Frontend Developer', company: 'Razorpay', location: 'Remote', source: 'Wellfound', isInternship: false, status: 'awaiting_review', discoveredAt: '2026-11-06T08:00:00Z' },
  { id: '3', title: 'Data Analyst', company: 'Swiggy', location: 'Hyderabad', source: 'LinkedIn', isInternship: false, status: 'failed', discoveredAt: '2026-11-07T09:00:00Z' },
  { id: '4', title: 'Backend Engineer', company: 'Atlassian', location: 'Remote', source: 'Greenhouse', isInternship: false, status: 'submitted', discoveredAt: '2026-11-01T09:00:00Z' },
];

test('fuzzyScore matches subsequences, case-insensitively, and rejects non-matches', () => {
  assert.ok(fuzzyScore('stripe', 'Stripe') > 0);
  assert.ok(fuzzyScore('sfe', 'Software Engineer') > 0);
  assert.equal(fuzzyScore('xyz', 'Software Engineer'), -1);
  assert.equal(fuzzyScore('', 'anything'), 0);
});

test('fuzzyScore prefers contiguous and word-start matches', () => {
  assert.ok(fuzzyScore('eng', 'Engineer') > fuzzyScore('eng', 'Electronic Neighbourhood Guide'));
  assert.ok(fuzzyScore('front', 'Frontend Developer') > fuzzyScore('front', 'Software Front Office'));
});

test('filterJobs searches title, company and location', () => {
  assert.deepEqual(filterJobs(jobs, { query: 'razor' }).map(j => j.id), ['2']);
  assert.deepEqual(filterJobs(jobs, { query: 'remote' }).map(j => j.id), ['2', '4']);
  assert.deepEqual(filterJobs(jobs, { query: '  ' }).map(j => j.id), ['1', '2', '3', '4']);
});

test('filterJobs combines source, lane and internship filters', () => {
  assert.deepEqual(filterJobs(jobs, { source: 'LinkedIn' }).map(j => j.id), ['1', '3']);
  assert.deepEqual(filterJobs(jobs, { lane: 'review' }).map(j => j.id), ['2']);
  assert.deepEqual(filterJobs(jobs, { internshipOnly: true }).map(j => j.id), ['1']);
  assert.deepEqual(filterJobs(jobs, { source: 'LinkedIn', lane: 'attention' }).map(j => j.id), ['3']);
});

test('searchJobs ranks the best matches first and honours the limit', () => {
  const hits = searchJobs(jobs, 'eng', 2);
  assert.equal(hits.length, 2);
  assert.ok(['1', '4'].includes(hits[0].id));
  assert.deepEqual(searchJobs(jobs, 'zzz', 5), []);
  assert.equal(searchJobs(jobs, '', 3).length, 3);
});

test('sortJobs sorts by recency, company or title without mutating its input', () => {
  const copy = [...jobs];
  assert.deepEqual(sortJobs(jobs, 'recent').map(j => j.id), ['3', '1', '2', '4']);
  assert.deepEqual(sortJobs(jobs, 'company').map(j => j.id), ['4', '2', '1', '3']);
  assert.deepEqual(sortJobs(jobs, 'title').map(j => j.id), ['4', '3', '2', '1']);
  assert.deepEqual(jobs, copy);
});

test('sortJobs by stage follows the pipeline order', () => {
  assert.deepEqual(sortJobs(jobs, 'stage').map(j => j.id), ['1', '2', '4', '3']);
});

const { isStrongMatch } = require('../dashboard/src/lib/filters');

test('isStrongMatch rejects weak scattered matches but keeps substrings and initials', () => {
  assert.equal(isStrongMatch('strip', 'Show internships only'), false);
  assert.equal(isStrongMatch('stripe', 'Stripe'), true);
  assert.equal(isStrongMatch('sei', 'Software Engineer Intern'), true);   // word initials
  assert.equal(isStrongMatch('dvlr', 'Frontend Developer'), false);
  assert.equal(isStrongMatch('', 'anything'), true);
});

test('searchJobs drops weak scattered matches', () => {
  assert.deepEqual(searchJobs(jobs, 'dvlr', 5), []);
});
