'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// No database configured: a correction must fail loudly, never report success.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  process.env[key] = '';
}
const { upsertFieldMapping } = require('../src/db/supabase');

test('upsertFieldMapping rejects when Supabase is not configured instead of silently doing nothing', async () => {
  await assert.rejects(
    upsertFieldMapping({ platform: 'generic', fieldSignature: 'q|q|why', meaning: 'personal.email', confidence: 1 }),
    /not configured/i
  );
});
