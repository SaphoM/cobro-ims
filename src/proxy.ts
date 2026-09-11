/**
 * Next.js 16 Proxy (formerly middleware.ts). Runs before every matched
 * request and refreshes the Supabase Auth session cookie when it has expired,
 * so a signed-in user isn't logged out simply because their access token
 * aged out between page loads. This is an OPTIMISTIC refresh only — real
 * authorization is still enforced in the data layer (getSession + RLS +
 * requirePermission), per Next's guidance that proxy is not a session/authz
 * boundary.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do NOT run code between createServerClient and getUser() — @supabase/ssr
  // relies on this call to perform the refresh and write the new cookies.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
