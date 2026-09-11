'use server';

import { redirect } from 'next/navigation';
import { signIn, verifyMfaCode } from '@/lib/auth';
import { safeNextPath } from '@/lib/safe-redirect';

export interface SignInFormState {
  error: string | null;
  /** True once the password is accepted but a TOTP second factor is still required. */
  mfaRequired: boolean;
  /** Preserved across the MFA step so the final redirect can honour ?next=. */
  next: string | null;
}

export async function signInAction(
  _prevState: SignInFormState,
  formData: FormData
): Promise<SignInFormState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = (formData.get('next') as string | null) ?? null;

  const result = await signIn(email, password);
  if (!result.ok) {
    return { error: result.error, mfaRequired: false, next };
  }
  if (result.mfaRequired) {
    // Password accepted; hold at the 2FA challenge before establishing access.
    return { error: null, mfaRequired: true, next };
  }

  redirect(safeNextPath(next) ?? '/dashboard');
}

export async function verifyLoginMfaAction(
  _prevState: SignInFormState,
  formData: FormData
): Promise<SignInFormState> {
  const code = String(formData.get('code') ?? '');
  const next = (formData.get('next') as string | null) ?? null;

  const result = await verifyMfaCode(code);
  if (!result.ok) {
    return { error: result.error, mfaRequired: true, next };
  }

  redirect(safeNextPath(next) ?? '/dashboard');
}
