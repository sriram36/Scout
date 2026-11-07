'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeHttpUrl } = require('../dashboard/src/lib/safeUrl');

test('http and https URLs pass through unchanged', () => {
  assert.equal(safeHttpUrl('https://boards.greenhouse.io/acme/jobs/1'), 'https://boards.greenhouse.io/acme/jobs/1');
  assert.equal(safeHttpUrl('http://example.com/apply?x=1'), 'http://example.com/apply?x=1');
});

test('other schemes, junk and non-strings are rejected', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://x.com', 'not a url', '', '  ', null, undefined, 42]) {
    assert.equal(safeHttpUrl(bad), null, String(bad));
  }
});
