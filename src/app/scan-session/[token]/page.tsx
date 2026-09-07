import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { scanHandoffRepository } from '@/lib/data';
import { ThemeToggle } from '@/components/theme-toggle';
import { ScanSessionClient } from '@/app/scan-session/[token]/scan-session-client';

/**
 * The phone lands here after scanning a desktop's "Scan QR with your phone"
 * handoff code (see `<CameraScanner>` and `src/lib/scan-handoff-actions.ts`).
 * Every state that isn't "go ahead and scan" is handled right here, server-
 * side, before any camera code ever mounts:
 *
 *   - not signed in            -> "please log in", carrying this URL as
 *                                 `?next=` so the phone returns to the same
 *                                 session afterwards instead of the generic
 *                                 dashboard (see safeNextPath).
 *   - token doesn't exist      -> same wording as expired - a guessed or
 *                                 mistyped token must not be distinguishable
 *                                 from a real one that's simply gone.
 *   - expired / already used   -> a clear, specific reason, since those ARE
 *                                 worth telling apart from "never existed".
 *   - pending                  -> hand off to the client scanner.
 */
export default async function ScanSessionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getSession();

  if (!session) {
    return (
      <Shell>
        <h1 className="font-display text-[1.15rem] font-medium text-text">Please log in to continue</h1>
        <p className="text-[0.88rem] text-text-muted">
          Sign in to finish this scan - you&apos;ll come straight back here afterwards.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/scan-session/${token}`)}`}
          className="mt-1 flex h-11 w-full items-center justify-center rounded-xl bg-accent text-[0.95rem] font-bold text-ink transition-colors hover:bg-accent-hover"
        >
          Log in
        </Link>
      </Shell>
    );
  }

  const handoff = await scanHandoffRepository.get(token);

  if (!handoff || handoff.status === 'expired') {
    return (
      <Shell>
        <h1 className="font-display text-[1.15rem] font-medium text-text">This scanning session has expired</h1>
        <p className="text-[0.88rem] text-text-muted">
          Go back to your desktop and click &ldquo;Scan with camera&rdquo; again to generate a new QR code.
        </p>
      </Shell>
    );
  }

  if (handoff.status === 'resolved') {
    return (
      <Shell>
        <h1 className="font-display text-[1.15rem] font-medium text-text">This scan has already been used</h1>
        <p className="text-[0.88rem] text-text-muted">
          Each QR code from your desktop is good for one scan. Go back to your desktop and click &ldquo;Scan
          with camera&rdquo; again if you need to scan another item.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <ScanSessionClient token={token} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-[radial-gradient(58%_46%_at_50%_34%,rgba(238,152,60,0.17),transparent_70%),radial-gradient(120%_85%_at_50%_105%,rgba(238,152,60,0.06),transparent_60%)] px-5 py-12">
      <ThemeToggle className="absolute top-5 right-5 z-10 flex items-center gap-2 rounded-lg border-2 border-accent/50 bg-surface-2 px-3 py-2 text-[0.8rem] font-bold text-accent-strong transition-colors hover:border-accent hover:bg-accent/10" />
      <main className="flex w-full max-w-[404px] flex-col items-center gap-3 rounded-[22px] border border-accent/[0.14] bg-gradient-to-b from-surface to-bg-2 px-7 py-9 text-center card-shadow">
        {children}
      </main>
    </div>
  );
}
