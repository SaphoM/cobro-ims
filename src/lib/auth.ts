/**
 * MOCK auth — a session cookie holding a user id, nothing more. This exists
 * so the rest of the app (route protection, "who am I" in the header, the
 * audit log's created_by) has something real to call today.
 *
 * This is explicitly NOT the Authentication phase deliverable. It has no
 * password hashing, no real session security, no MFA (RFQ requires 2FA for
 * privileged users — Phase 6), and the "password" is a hardcoded demo
 * constant. When the Authentication phase starts, this whole file is
 * replaced by Supabase Auth (@supabase/ssr), and every caller of
 * getSession()/requireSession() keeps working unchanged because they only
 * see the same two functions.
 */

import { cookies } from 'next/headers';
import { userRepository } from '@/lib/data';
import type { User } from '@/lib/domain/inventory';
import { DEMO_ACCOUNTS } from '@/lib/demo-credentials';

const SESSION_COOKIE = 'cobro_ims_session';

export async function getSession(): Promise<User | null> {
  const store = await cookies();
  const userId = store.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return userRepository.getById(userId);
}

export async function createSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function attemptSignIn(email: string, password: string): Promise<SignInResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const matchesADemoAccount = DEMO_ACCOUNTS.some(
    (a) => a.email === normalizedEmail && a.password === password
  );
  if (!matchesADemoAccount) {
    return { ok: false, error: 'Incorrect email or password. Try one of the demo accounts shown below.' };
  }
  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user) {
    return { ok: false, error: 'Demo user is missing from the mock data set.' };
  }
  await createSession(user.id);
  return { ok: true };
}
