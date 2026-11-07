'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectFromURL, getAdapter } = require('../src/adapters');

test('ATS platforms are detected from the hostname', () => {
  const cases = {
    'https://boards.greenhouse.io/acme/jobs/1': 'greenhouse',
    'https://job-boards.greenhouse.io/acme/jobs/1': 'greenhouse',
    'https://jobs.lever.co/acme/abc': 'lever',
    'https://jobs.ashbyhq.com/acme/abc': 'ashby',
    'https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/x/apply': 'workday',
    'https://acme.myworkdaysite.com/recruiting/acme/careers': 'workday',
    'https://careers-acme.icims.com/jobs/1/engineer/job': 'icims',
    'https://jobs.smartrecruiters.com/Acme/123-engineer': 'smartrecruiters',
  };
  for (const [url, expected] of Object.entries(cases)) assert.equal(detectFromURL(url), expected, url);
});

test('unknown, malformed and look-alike hosts are not detected', () => {
  assert.equal(detectFromURL('https://example.com/careers'), null);
  assert.equal(detectFromURL('not a url'), null);
  assert.equal(detectFromURL('https://greenhouse.io.evil.example/jobs'), null);
  assert.equal(detectFromURL('https://evil.example/?next=boards.greenhouse.io'), null);
  assert.equal(detectFromURL('https://notgreenhouse.io/jobs'), null);
});

test('every detectable platform has its own adapter; unknown names fall back to generic', () => {
  for (const platform of ['greenhouse', 'lever', 'ashby', 'workday', 'icims', 'smartrecruiters', 'generic']) {
    assert.equal(getAdapter(platform).name, platform, platform);
  }
  assert.equal(getAdapter('nonsense').name, 'generic');
});
