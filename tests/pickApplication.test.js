'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pickApplication } = require('../dashboard/src/lib/pickApplication');

// PostgREST embeds a to-one relation (unique FK) as an object or null, a to-many relation as an array.

test('an embedded object (unique listing_id FK) is returned as is', () => {
  assert.deepEqual(pickApplication({ id: 'a', status: 'failed' }), { id: 'a', status: 'failed' });
});

test('an embedded array returns its first element', () => {
  assert.deepEqual(pickApplication([{ id: 'a' }, { id: 'b' }]), { id: 'a' });
});

test('null, undefined and an empty array mean no application', () => {
  assert.equal(pickApplication(null), null);
  assert.equal(pickApplication(undefined), null);
  assert.equal(pickApplication([]), null);
});
