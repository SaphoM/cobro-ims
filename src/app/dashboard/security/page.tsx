import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { roleRepository } from '@/lib/data';
import { disableMfaAction, enableMfaAction } from '@/app/dashboard/security/actions';

export default async function SecurityPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const role = await roleRepository.getById(session.roleId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Security</h1>
        <p className="text-[0.86rem] text-text-muted">
          Two-factor authentication for privileged users, per the RFQ. This is a mock enrollment flow —
          no real authenticator app is involved, only the flag a real Supabase Auth MFA flow would set —
          but it gates the same action a real 2FA requirement would.
        </p>
      </div>

      <section className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-[1.05rem] font-medium text-text">{session.fullName}</h2>
            <p className="text-[0.82rem] text-text-muted">
              {session.email} · <span className="text-accent">{role?.description ?? role?.name}</span>
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[0.76rem] font-semibold ${
              session.mfaEnrolled ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-[#f3a99a]'
            }`}
          >
            {session.mfaEnrolled ? '2FA enabled' : '2FA not enabled'}
          </span>
        </div>

        {!session.mfaEnrolled ? (
          <div className="rounded-xl border border-accent/[0.14] bg-surface-2 p-4">
            <p className="mb-3 text-[0.85rem] text-text-muted">
              Approving or rejecting write-offs and adjustments requires 2FA — it&apos;s the one action in
              the system that posts a real stock-value change with no second approver. Enable it to unlock
              that action.
            </p>
            <form action={enableMfaAction}>
              <button
                type="submit"
                className="rounded-lg bg-accent px-5 py-2.5 text-[0.88rem] font-bold text-ink transition-colors hover:bg-accent-hover"
              >
                Enable 2FA
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-xl border border-accent/40 bg-accent/[0.08] p-4">
            <p className="mb-3 text-[0.85rem] text-accent">
              2FA is enabled for this account. You can approve/reject adjustments and other privileged
              actions your role allows.
            </p>
            <form action={disableMfaAction}>
              <button
                type="submit"
                className="rounded-lg border border-danger/40 px-5 py-2.5 text-[0.85rem] font-semibold text-[#f3a99a] transition-colors hover:bg-danger/10"
              >
                Disable 2FA
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
