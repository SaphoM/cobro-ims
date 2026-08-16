'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, userRepository } from '@/lib/data';

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  return session;
}

/**
 * Mock enrollment — no real TOTP/authenticator app involved, this just sets
 * the flag a real Supabase Auth MFA flow would set. It exists so
 * "2FA for privileged users" (an explicit RFQ requirement) has an actual
 * gate to demonstrate — see requirePrivilegedMfa in src/lib/permissions.ts —
 * rather than being silently skipped because real auth doesn't exist yet.
 */
export async function enableMfaAction() {
  'use server';
  const session = await requireSession();
  const user = await userRepository.setMfaEnrolled(session.id, true);
  await auditLogRepository.write({
    tableName: 'users',
    recordId: session.id,
    action: 'update',
    changedBy: session.id,
    after: { mfaEnrolled: user.mfaEnrolled },
  });
  revalidatePath('/dashboard/security');
}

export async function disableMfaAction() {
  'use server';
  const session = await requireSession();
  const user = await userRepository.setMfaEnrolled(session.id, false);
  await auditLogRepository.write({
    tableName: 'users',
    recordId: session.id,
    action: 'update',
    changedBy: session.id,
    after: { mfaEnrolled: user.mfaEnrolled },
  });
  revalidatePath('/dashboard/security');
}
