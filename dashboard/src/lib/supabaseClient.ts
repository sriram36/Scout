import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let client: SupabaseClient | null = null;
let clientError: string | null = null;

/**
 * Create the Supabase client on first use, so a missing or malformed env var
 * shows the setup panel instead of crashing the page at import time.
 */
export function getSupabase(): SupabaseClient | null {
  if (client || clientError) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    clientError = err instanceof Error ? err.message : String(err);
  }
  return client;
}

export function supabaseConfigError(): string | null {
  getSupabase();
  return clientError;
}

/** Application columns the board needs. listing_id is included so realtime and refetches line up. */
export const APPLICATION_COLUMNS =
  "id,listing_id,status,ats_platform,fields_detected,fields_filled,fields_skipped,ai_questions_answered,fill_report,error_message,started_at,completed_at,status_updated_at";

export const LISTING_SELECT =
  "*, applications(id,status,ats_platform,fields_detected,fields_filled,fields_skipped,ai_questions_answered,fill_report,error_message,started_at,completed_at,status_updated_at)";
