'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSupabaseKey } = require('../src/db/supabase');

test('service key is preferred when both keys are present', () => {
  assert.deepEqual(
    resolveSupabaseKey({ SUPABASE_SERVICE_ROLE_KEY: 'svc', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
    { key: 'svc', role: 'service' }
  );
});

test('falls back to the anon key when no service key is set', () => {
  assert.deepEqual(
    resolveSupabaseKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
    { key: 'anon', role: 'anon' }
  );
});

test('neither key, or empty strings, resolves to nothing', () => {
  assert.deepEqual(resolveSupabaseKey({}), { key: null, role: null });
  assert.deepEqual(
    resolveSupabaseKey({ SUPABASE_SERVICE_ROLE_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }),
    { key: null, role: null }
  );
});
