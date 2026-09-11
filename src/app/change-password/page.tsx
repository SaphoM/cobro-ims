import { redirect } from 'next/navigation';
import { getSession, getMustChangePassword } from '@/lib/auth';
import { ChangePasswordForm } from '@/app/change-password/change-password-form';

/**
 * Mandatory first-login password change. Lives OUTSIDE /dashboard so the
 * dashboard layout's must-change redirect can't loop back into it. Only
 * reachable by an authenticated user; if they don't actually need to change
 * their password, they're sent on to the dashboard.
 */
export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const mustChange = await getMustChangePassword();
  if (!mustChange) redirect('/dashboard');

  return (
    <div className="relative flex min-h-screen flex-1 flex-col items-center justify-center gap-7 overflow-hidden bg-[radial-gradient(58%_46%_at_50%_34%,rgba(238,152,60,0.17),transparent_70%),radial-gradient(120%_85%_at_50%_105%,rgba(238,152,60,0.06),transparent_60%)] px-5 py-12">
      <ChangePasswordForm />
    </div>
  );
}
