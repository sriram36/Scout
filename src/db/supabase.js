'use strict';

/**
 * Centralized Supabase client.
 * Single instance shared across the entire server process.
 */

const { createClient } = require('@supabase/supabase-js');
const log = require('../logger');

let _client = null;

/**
 * Pick the key this server should use. The service-role key (server-side only,
 * bypasses RLS) is preferred; the anon key is a degraded fallback.
 */
function resolveSupabaseKey(env = process.env) {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return { key: env.SUPABASE_SERVICE_ROLE_KEY, role: 'service' };
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, role: 'anon' };
  return { key: null, role: null };
}

function getSupabase() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const { key, role } = resolveSupabaseKey();

  if (!url || !key) {
    log.warn('Supabase credentials not configured — DB features disabled');
    return null;
  }

  if (role === 'anon') {
    log.warn('SUPABASE_SERVICE_ROLE_KEY not set — using the anon key; server writes will be rejected by RLS');
  }

  _client = createClient(url, key);
  log.info('Supabase client initialised', { url, role });
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

// ─── Application queue store ──────────────────────────────────────────────────

/**
 * Oldest application waiting to be processed, joined with its listing.
 * @returns {Promise<object|null>}
 */
async function fetchPendingApplication() {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('applications')
    .select('*, listings!inner(*)')
    .eq('status', 'pending_application')
    .order('status_updated_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

/**
 * Atomically move an application from pending_application to applying.
 * @returns {Promise<boolean>} true only if this call changed the row
 */
async function claimApplication(id) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('applications')
    .update({ status: 'applying', status_updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending_application')
    .select('id');

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

async function markApplicationFailed(id, message) {
  await updateApplication(id, {
    status: 'failed',
    error_message: message,
    completed_at: new Date().toISOString(),
  });
}

/**
 * Subscribe to Realtime changes and call onPending whenever an application
 * enters pending_application. Returns an unsubscribe function.
 */
function subscribePendingApplications(onPending) {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel('scout-pending-applications')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, (payload) => {
      if (payload.new?.status === 'pending_application') onPending();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') log.info('Realtime subscription active for pending applications');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        log.warn('Realtime subscription problem — falling back to polling', { status });
      }
    });

  return () => { supabase.removeChannel(channel); };
}

module.exports = {
  getSupabase,
  resolveSupabaseKey,
  updateApplication,
  upsertFieldMapping,
  lookupFieldMapping,
  fetchPendingApplication,
  claimApplication,
  markApplicationFailed,
  subscribePendingApplications,
};
