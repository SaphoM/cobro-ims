/**
 * Per-request, USER-SCOPED Supabase client (real Supabase Auth).
 *
 * Built from the request's auth cookies via @supabase/ssr, using the ANON
 * key — so every query runs AS THE AUTHENTICATED USER and `auth.uid()`
 * resolves to their id, which means Row Level Security actually applies.
 * This is the client the application data layer uses for ordinary employee
 * reads/writes. It is NOT the service-role client — see ./service.ts for the
 * narrow set of privileged admin operations that genuinely need to bypass RLS.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: {
      // Session cookies must never travel over plain HTTP in production, must
      // be scoped to the whole app, and lax is the right CSRF posture for a
      // first-party dashboard (top-level navigations still carry the cookie).
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // `setAll` was called from a Server Component render, where cookies
          // are read-only. The refresh is instead written by proxy.ts on the
          // next request, so ignoring this is safe and expected.
        }
      },
    },
  });
}
