'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { captureScreenshotDataUrl } = require('../src/engine/screenshot');

test('captureScreenshotDataUrl encodes the Buffer as a PNG data URL', async () => {
  const page = { screenshot: async () => Buffer.from('abc') };
  assert.equal(await captureScreenshotDataUrl(page), 'data:image/png;base64,YWJj');
});

test('captureScreenshotDataUrl asks for a full-page shot and passes no encoding option', async () => {
  let received;
  const page = { screenshot: async (opts) => { received = opts; return Buffer.from('x'); } };
  await captureScreenshotDataUrl(page);
  assert.equal(received.fullPage, true);
  assert.equal('encoding' in received, false);
});
