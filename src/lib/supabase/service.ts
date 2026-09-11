/**
 * SERVICE-ROLE Supabase client — bypasses RLS. Use ONLY for genuinely
 * privileged server-side administrative operations that cannot run as the
 * requesting user, and never as a blanket replacement for the user-scoped
 * client (see ./server.ts).
 *
 * Legitimate uses in this app:
 *   - Supabase Auth Admin API (creating/deleting auth users) — there is no
 *     user-scoped equivalent.
 *   - The login path's profile lookup, which must read public.users BEFORE a
 *     session cookie exists (so auth.uid() isn't available yet).
 *
 * The key has no NEXT_PUBLIC_ prefix, so it is server-only and never reaches
 * the browser. Every call site is audited in docs and must justify why the
 * user-scoped client won't do.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check .env.local.'
      );
    }
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
