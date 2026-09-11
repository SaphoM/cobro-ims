import { redirect } from 'next/navigation';
import { getSession, getMustChangePassword } from '@/lib/auth';

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (await getMustChangePassword()) redirect('/change-password');
  redirect('/dashboard');
}
