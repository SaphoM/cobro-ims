import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/app/login/login-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { safeNextPath } from '@/lib/safe-redirect';
import packageJson from '../../../package.json';

export default async function LoginPage({
  searchParams,
}: {
  /** Set when arriving here mid-flow from something else that needs the
   *  session back afterwards - today, only the phone side of the desktop
   *  camera handoff (`/scan-session/[token]`, see camera-scanner.tsx) links
   *  here with one. Validated by `safeNextPath` before ever being used as a
   *  redirect target - see its doc comment for why. */
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);
  const session = await getSession();
  if (session) redirect(safeNext ?? '/dashboard');

  return (
    <div className="relative flex min-h-screen flex-1 flex-col items-center justify-center gap-7 overflow-hidden bg-[radial-gradient(58%_46%_at_50%_34%,rgba(238,152,60,0.17),transparent_70%),radial-gradient(120%_85%_at_50%_105%,rgba(238,152,60,0.06),transparent_60%)] px-5 py-12">
      <ThemeToggle className="absolute top-5 right-5 z-10 flex items-center gap-2 rounded-lg border-2 border-accent/50 bg-surface-2 px-3 py-2 text-[0.8rem] font-bold text-accent-strong transition-colors hover:border-accent hover:bg-accent/10" />
      <LoginForm next={safeNext} />
      <p className="text-center font-mono-brand text-[0.68rem] font-medium tracking-[0.08em] text-text-faint uppercase">
        Built by <span className="text-text-muted">X Spark</span>
        <span className="mx-1.5 text-accent-strong/40">·</span>
        <span>v{packageJson.version}</span>
      </p>
    </div>
  );
}
