/**
 * Decide how the dashboard runs:
 *   'demo'         NEXT_PUBLIC_DEMO=true or ?demo=1 — built-in sample data, no network
 *   'live'         Supabase URL and anon key are both set
 *   'unconfigured' neither — show the setup panel
 *
 * @param {{ demoEnv?: string, search?: string, supabaseUrl?: string, supabaseKey?: string }} input
 * @returns {'demo' | 'live' | 'unconfigured'}
 */
function resolveMode({ demoEnv = '', search = '', supabaseUrl = '', supabaseKey = '' } = {}) {
  if (demoEnv === 'true') return 'demo';
  const params = new URLSearchParams(search);
  if (params.get('demo') === '1') return 'demo';
  return supabaseUrl && supabaseKey ? 'live' : 'unconfigured';
}

module.exports = { resolveMode };
