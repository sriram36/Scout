'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isOriginAllowed, createCorsOptions, resolveHost } = require('../src/api/access');

test('default allowed origins are the local dashboard on localhost and 127.0.0.1', () => {
  assert.equal(isOriginAllowed('http://localhost:3000', {}), true);
  assert.equal(isOriginAllowed('http://127.0.0.1:3000', {}), true);
});

test('arbitrary websites are not allowed', () => {
  assert.equal(isOriginAllowed('https://evil.example', {}), false);
  assert.equal(isOriginAllowed('http://localhost:3000.evil.example', {}), false);
  assert.equal(isOriginAllowed('http://localhost:9999', {}), false);
});

test('requests without an Origin header (curl, the queue calling itself) are allowed', () => {
  assert.equal(isOriginAllowed(undefined, {}), true);
});

test('DASHBOARD_ORIGIN replaces the defaults and accepts a comma-separated list', () => {
  const env = { DASHBOARD_ORIGIN: 'https://scout.example.com, https://alt.example.com' };
  assert.equal(isOriginAllowed('https://scout.example.com', env), true);
  assert.equal(isOriginAllowed('https://alt.example.com', env), true);
  assert.equal(isOriginAllowed('http://localhost:3000', env), false);
});

test('createCorsOptions plugs the check into the cors origin callback', () => {
  const { origin } = createCorsOptions({});
  let result;
  origin('https://evil.example', (err, allowed) => { result = [err, allowed]; });
  assert.deepEqual(result, [null, false]);
  origin('http://localhost:3000', (err, allowed) => { result = [err, allowed]; });
  assert.deepEqual(result, [null, true]);
});

test('the server binds to loopback unless HOST says otherwise', () => {
  assert.equal(resolveHost({}), '127.0.0.1');
  assert.equal(resolveHost({ HOST: '0.0.0.0' }), '0.0.0.0');
});
