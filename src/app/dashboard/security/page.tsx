import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { roleRepository, settingsRepository } from '@/lib/data';
import { hasPermission } from '@/lib/permissions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CostVisibilityToggle } from '@/app/dashboard/cost-visibility-toggle';
import { MfaSetup } from '@/app/dashboard/security/mfa-setup';

export default async function SecurityPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const role = await roleRepository.getById(session.roleId);
  const canManagePricing = await hasPermission(session, 'manage_pricing');
  const settings = await settingsRepository.get();

  // Real MFA status straight from Supabase Auth (not a stored flag).
  const supabase = await createServerSupabaseClient();
  const { data: factorData } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = (factorData?.all ?? []).find(
    (f) => f.factor_type === 'totp' && f.status === 'verified'
  );
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const isAal2 = aal?.currentLevel === 'aal2';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[1.3rem] font-medium text-text">Security</h1>
        <p className="text-[0.86rem] text-text-muted">
          Real two-factor authentication (TOTP) via Supabase Auth, per the RFQ. Privileged actions —
          approving write-offs and adjustments — require a verified second factor for the current session.
        </p>
      </div>

      {canManagePricing && <CostVisibilityToggle initialShowToAll={settings.showCostsToAllRoles} />}

      <section className="rounded-2xl border border-accent/[0.14] bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-[1.05rem] font-medium text-text">{session.fullName}</h2>
            <p className="text-[0.82rem] text-text-muted">
              {session.email} · <span className="text-accent-strong">{role?.description ?? role?.name}</span>
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[0.76rem] font-semibold ${
              verifiedTotp ? 'bg-accent/15 text-accent-strong' : 'bg-danger/15 text-danger-text'
            }`}
          >
            {verifiedTotp ? '2FA enabled' : '2FA not enabled'}
          </span>
        </div>

        <MfaSetup enrolled={!!verifiedTotp} factorId={verifiedTotp?.id ?? null} isAal2={isAal2} />
      </section>
    </div>
  );
}
