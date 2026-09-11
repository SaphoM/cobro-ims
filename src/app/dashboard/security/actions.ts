'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { auditLogRepository } from '@/lib/data';

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  return session;
}

export type EnrollResult =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string };

/**
 * Begin real TOTP enrolment via Supabase Auth. Returns the QR code (SVG) and
 * secret for the user's authenticator app. The factor stays UNVERIFIED — and
 * therefore does not count as MFA — until verifyMfaEnrollmentAction succeeds.
 */
export async function enrollMfaAction(): Promise<EnrollResult> {
  await requireSession();
  const supabase = await createServerSupabaseClient();

  // Clear any half-finished (unverified) factors so re-enrolling is clean and
  // we don't hit the "factor with this friendly name already exists" error.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator ${new Date().toISOString()}`,
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not start 2FA enrolment.' };
  }
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

/** Verify the first TOTP code to finish enrolment; this also elevates the session to aal2. */
export async function verifyMfaEnrollmentAction(factorId: string, code: string): Promise<VerifyResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();

  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chErr || !challenge) return { ok: false, error: 'Could not start the challenge. Try again.' };

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (verifyErr) {
    return { ok: false, error: 'Invalid code. Check your authenticator app and try again.' };
  }

  await auditLogRepository.write({
    tableName: 'users',
    recordId: session.id,
    action: 'update',
    changedBy: session.id,
    after: { mfa: 'enrolled' },
  });
  revalidatePath('/dashboard/security');
  return { ok: true };
}

/** Remove an enrolled TOTP factor (disables 2FA for the account). */
export async function unenrollMfaAction(factorId: string): Promise<VerifyResult> {
  const session = await requireSession();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: error.message };

  await auditLogRepository.write({
    tableName: 'users',
    recordId: session.id,
    action: 'update',
    changedBy: session.id,
    after: { mfa: 'removed' },
  });
  revalidatePath('/dashboard/security');
  return { ok: true };
}
