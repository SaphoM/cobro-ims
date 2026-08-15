'use server';

import { redirect } from 'next/navigation';
import { attemptSignIn } from '@/lib/auth';

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

  redirect('/dashboard');
}
