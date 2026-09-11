/**
 * Authentication — REAL Supabase Auth.
 *
 * `getSession()` validates the request's Supabase session (a network-verified
 * getUser(), not a decoded-but-untrusted JWT) and maps it to the app's
 * public.users profile. `signIn`/`signOut` drive Supabase Auth directly; the
 * session lives in the httpOnly-managed @supabase/ssr cookies and is refreshed
 * by proxy.ts. There is no mock/demo fallback: credentials are verified only
 * by Supabase Auth.
 *
 * Every caller still sees the same getSession()/signIn/signOut surface, so the
 * rest of the app (route protection, "who am I", audit created_by) is unchanged.
 */

import { userRepository } from '@/lib/data';
import type { User } from '@/lib/domain/inventory';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * The authenticated user's application profile, or null if not signed in /
 * deactivated. A deactivated account loses access on its very next request,
 * not just at login, because this gate runs on every protected page and action.
 */
export async function getSession(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const profile = await userRepository.getById(user.id);
  if (!profile || !profile.isActive) return null;
  return profile;
}

/**
 * True when the current session has cleared the second factor (Supabase AAL2).
 * Used to gate privileged operations behind real TOTP MFA — see
 * src/lib/permissions.ts and the approve_adjustments flow.
 */
export async function getSessionAal(): Promise<'aal1' | 'aal2' | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  return (data.currentLevel as 'aal1' | 'aal2' | null) ?? null;
}

/**
 * MFA step-up state for the current session:
 *   enrolled       — the user has a verified TOTP factor (nextLevel can reach aal2)
 *   aal2           — this session has already cleared the second factor
 *   stepUpPending  — enrolled but still at aal1: they must verify a code before
 *                    they are considered fully signed in. Enforced on /login and
 *                    the dashboard layout so the step-up can't be side-stepped by
 *                    navigating directly.
 */
/**
 * True when the signed-in user must change their password before doing
 * anything else — set on admin-created accounts via the service-role-only
 * app_metadata.must_change_password flag. Read from a network-verified
 * getUser() (fresh from the auth server), so it reflects the flag being
 * cleared immediately, without waiting for a token refresh.
 */
export async function getMustChangePassword(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return false;
  return user.app_metadata?.must_change_password === true;
}

export async function getMfaStepUpState(): Promise<{
  enrolled: boolean;
  aal2: boolean;
  stepUpPending: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { enrolled: false, aal2: false, stepUpPending: false };
  const enrolled = data.nextLevel === 'aal2';
  const aal2 = data.currentLevel === 'aal2';
  return { enrolled, aal2, stepUpPending: enrolled && !aal2 };
}

export type SignInResult =
  | { ok: true; mfaRequired: boolean }
  | { ok: false; error: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error || !data.user) {
    return { ok: false, error: 'Incorrect email or password.' };
  }

  // A valid Supabase credential still needs a matching, active app profile.
  const profile = await userRepository.getById(data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, error: 'No user profile is linked to this account. Contact an administrator.' };
  }
  if (!profile.isActive) {
    await supabase.auth.signOut();
    return { ok: false, error: 'This account has been deactivated. Contact an Admin.' };
  }

  // Step-up: if the user has a verified TOTP factor, the password only got
  // them to aal1 — they must clear the second factor to reach aal2 before
  // they can perform privileged actions.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaRequired = aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';

  return { ok: true, mfaRequired: !!mfaRequired };
}

/**
 * Verify a 6-digit TOTP code for the signed-in-but-not-yet-stepped-up session,
 * elevating it to aal2. Used by the login MFA challenge step.
 */
export async function verifyMfaCode(code: string): Promise<SignInResult> {
  const supabase = await createServerSupabaseClient();
  const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
  if (listErr) return { ok: false, error: 'Could not read your authenticator. Sign in again.' };
  const totp = (factors?.all ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (!totp) return { ok: false, error: 'No enrolled authenticator found for this account.' };

  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
  if (chErr || !challenge) return { ok: false, error: 'Could not start the 2FA challenge. Try again.' };

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (verifyErr) return { ok: false, error: 'Invalid or expired code. Check your authenticator and try again.' };

  return { ok: true, mfaRequired: false };
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
}
