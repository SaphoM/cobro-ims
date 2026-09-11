'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/service';

export interface ChangePasswordState {
  error: string | null;
}

/**
 * Set a new password for the signed-in user and clear the
 * must_change_password flag. Because the user is already authenticated,
 * Supabase updates the password without the old one; the old temporary
 * password stops working immediately afterwards. The flag lives in
 * app_metadata (service-role-only), so it is cleared here with the service
 * client — the user can't clear it themselves.
 */
export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await getSession();
  if (!session) redirect('/login');

  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (newPassword.length < 8) {
    return { error: 'Your new password must be at least 8 characters.' };
  }
  if (newPassword !== confirmPassword) {
    return { error: 'The two passwords do not match.' };
  }

  const supabase = await createServerSupabaseClient();
  const admin = getServiceSupabase();

  // Clear the forced-change flag FIRST (service-role: app_metadata isn't
  // user-writable), so the fresh access token minted by updateUser below
  // already carries must_change_password=false. That makes the post-change
  // redirect deterministic — no race waiting for the flag to propagate.
  await admin.auth.admin.updateUserById(session.id, {
    app_metadata: { must_change_password: false },
  });

  // Reject reusing the same (temporary) password: updateUser with an identical
  // password is refused by Supabase ("New password should be different…").
  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr) {
    // Roll the flag back so the user is still forced to change next time.
    await admin.auth.admin.updateUserById(session.id, {
      app_metadata: { must_change_password: true },
    });
    const msg = updateErr.message?.toLowerCase() ?? '';
    if (msg.includes('different')) {
      return { error: 'Choose a password different from your temporary one.' };
    }
    if (msg.includes('weak') || msg.includes('pwned') || msg.includes('short')) {
      return { error: 'That password is too weak. Choose a stronger one.' };
    }
    return { error: 'Could not update your password. Please try again.' };
  }

  redirect('/dashboard');
}
