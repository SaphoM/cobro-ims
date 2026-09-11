'use client';

/**
 * Browser Supabase client (real Supabase Auth). Reads the session from the
 * cookies @supabase/ssr manages, so client components can call auth methods
 * (e.g. the MFA enrolment/verify challenge in Security) as the signed-in user.
 * Uses the public ANON key only — never the service-role key.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createBrowserSupabaseClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
