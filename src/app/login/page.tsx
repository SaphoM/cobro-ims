import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/app/login/login-form';
import packageJson from '../../../package.json';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-7 bg-[radial-gradient(58%_46%_at_50%_34%,rgba(240,161,60,0.17),transparent_70%),radial-gradient(120%_85%_at_50%_105%,rgba(240,161,60,0.06),transparent_60%)] px-5 py-12">
      <LoginForm />
      <p className="text-center font-mono-brand text-[0.68rem] font-medium tracking-[0.08em] text-text-faint uppercase">
        Built by <span className="text-text-muted">X Spark</span>
        <span className="mx-1.5 text-accent/40">·</span>
        <span>v{packageJson.version}</span>
      </p>
    </div>
  );
}
