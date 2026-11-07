'use strict';

/**
 * Centralized Supabase client.
 * Single instance shared across the entire server process.
 */

const { createClient } = require('@supabase/supabase-js');
const log = require('../logger');

let _client = null;

function getSupabase() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    log.warn('Supabase credentials not configured — DB features disabled');
    return null;
  }

  _client = createClient(url, key);
  log.info('Supabase client initialised', { url });
  return _client;
}

/**
 * Update application record with structured fill report.
 */
async function updateApplication(id, updates) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from('applications')
    .update({ ...updates, status_updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) log.error('Failed to update application', { id, error: error.message });
}

/**
 * Upsert a learned field mapping so future applications can reuse it
 * without calling the LLM.
 */
async function upsertFieldMapping({ platform, domain, fieldSignature, meaning, confidence = 1.0 }) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from('field_mappings')
    .upsert(
      { platform, domain, field_signature: fieldSignature, meaning, confidence },
      { onConflict: 'platform,field_signature', ignoreDuplicates: false }
    );

  if (error) log.warn('Failed to upsert field mapping', { fieldSignature, error: error.message });
}

/**
 * Look up a previously learned field mapping.
 */
async function lookupFieldMapping(platform, fieldSignature) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('field_mappings')
    .select('meaning, confidence')
    .eq('platform', platform)
    .eq('field_signature', fieldSignature)
    .order('usage_count', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

module.exports = { getSupabase, updateApplication, upsertFieldMapping, lookupFieldMapping };
