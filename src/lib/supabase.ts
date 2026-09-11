/**
 * Server-side Supabase client. Uses the service-role key so it bypasses RLS —
 * this is correct for the current phase where auth is still mock (cookie-based,
 * not Supabase Auth) and all access control is enforced at the Server Action
 * layer via requirePermission(). When real Supabase Auth lands, this switches
 * to per-request clients built from the user's JWT via @supabase/ssr.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — ' +
          'check .env.local. These are required when DATA_SOURCE=supabase.'
      );
    }
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
