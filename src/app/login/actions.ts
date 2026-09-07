'use server';

import { redirect } from 'next/navigation';
import { attemptSignIn } from '@/lib/auth';
import { safeNextPath } from '@/lib/safe-redirect';

export interface SignInFormState {
  error: string | null;
}

export async function signInAction(
  _prevState: SignInFormState,
  formData: FormData
): Promise<SignInFormState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const result = await attemptSignIn(email, password);
  if (!result.ok) {
    return { error: result.error };
  }

  // Returns to wherever the user was headed before being asked to log in
  // (today: the phone side of the desktop camera handoff) rather than always
  // landing on the dashboard - see safeNextPath's doc comment for why this
  // isn't just `formData.get('next')` passed straight to redirect().
  redirect(safeNextPath(formData.get('next') as string | null) ?? '/dashboard');
}
