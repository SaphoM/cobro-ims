'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, roleRepository, userRepository, warehouseRepository } from '@/lib/data';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { FACTORY_AREAS, isAreaScopedRole } from '@/lib/areas';
import type { LabelPermission, User } from '@/lib/domain/inventory';

const LABEL_PERMISSION_VALUES: LabelPermission[] = ['inherited', 'allowed', 'revoked'];

/**
 * Every Engineer / Requester gets exactly one personal station — a
 * Warehouse row of type `engineer_station` they own — the first time they
 * become one, whether at account creation or a later role change. Stock
 * they accept from a store (or from another Engineer's station) sits here
 * until they use it. Idempotent: does nothing if one already exists (e.g.
 * moved out of the role and back). See Warehouse's doc comment in
 * src/lib/domain/inventory.ts for the full accept/use workflow.
 */
async function ensureStation(user: User): Promise<void> {
  const existing = await warehouseRepository.getByOwner(user.id);
  if (existing) return;
  await warehouseRepository.create({
    code: `STA-${user.id.slice(0, 8).toUpperCase()}`,
    name: `${user.fullName}'s station`,
    address: null,
    type: 'engineer_station',
    ownerUserId: user.id,
  });
}

export interface CreateUserFormState {
  error: string | null;
  success: string | null;
}

export async function createUserAction(
  _prevState: CreateUserFormState,
  formData: FormData
): Promise<CreateUserFormState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.', success: null };
  if (!(await hasPermission(session, 'manage_users'))) {
    return { error: 'Your role does not have permission to create users.', success: null };
  }

  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const roleId = String(formData.get('roleId') ?? '');
  const areaRaw = String(formData.get('area') ?? '').trim();

  if (!fullName || !email || !roleId) {
    return { error: 'Name, email and role are required.', success: null };
  }
  if (!email.includes('@')) {
    return { error: 'Enter a valid email address.', success: null };
  }

  const role = await roleRepository.getById(roleId);
  if (!role) return { error: 'That role could not be found.', success: null };

  // Area is only ever meaningful for Engineer / Requester and the two Team
  // Leader roles (see User.area, src/lib/areas.ts). Silently dropped for
  // every other role rather than rejected, so a leftover value from
  // switching the role dropdown client-side doesn't block submission.
  const isEngineer = role.name === 'engineer_requester';
  const isAreaScoped = isAreaScopedRole(role.name);
  if (isAreaScoped && !areaRaw) {
    return { error: `Area is required for the ${role.description ?? role.name} role.`, success: null };
  }
  if (isAreaScoped && !FACTORY_AREAS.includes(areaRaw as (typeof FACTORY_AREAS)[number])) {
    return { error: 'Choose an area from the list.', success: null };
  }
  const area = isAreaScoped ? areaRaw : null;

  try {
    const { user, temporaryPassword } = await userRepository.create({ email, fullName, roleId, area });
    // A station is an Engineer / Requester thing only - a Team Leader
    // oversees a section, they don't hold stock of their own (see
    // docs/ARCHITECTURE.md and permissions.ts's role-list comment).
    if (isEngineer) await ensureStation(user);
    await auditLogRepository.write({
      tableName: 'users',
      recordId: user.id,
      action: 'insert',
      changedBy: session.id,
      // NB: never include the temporary password in the audit record.
      after: user,
    });
    revalidatePath('/dashboard/users');
    return {
      error: null,
      // The one-time temporary password is surfaced to the admin here and
      // nowhere else — not stored, not logged. The employee must change it on
      // first login before they can use the app.
      success: `${user.fullName} created as ${role.description ?? role.name}. Give them these one-time sign-in details — they'll be required to set their own password on first login:\nEmail: ${user.email}\nTemporary password: ${temporaryPassword}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create the user.', success: null };
  }
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Session expired.');
  return session;
}

export async function setUserActiveAction(userId: string, active: boolean) {
  'use server';
  const session = await requireSession();
  await requirePermission(session, 'manage_users');
  const before = await userRepository.getById(userId);
  const user = await userRepository.setActive(userId, active);
  await auditLogRepository.write({
    tableName: 'users',
    recordId: userId,
    action: 'update',
    changedBy: session.id,
    before,
    after: user,
  });
  revalidatePath('/dashboard/users');
}

export async function updateUserRoleAction(userId: string, formData: FormData) {
  'use server';
  const session = await requireSession();
  await requirePermission(session, 'manage_users');

  const roleId = String(formData.get('roleId') ?? '');
  const role = await roleRepository.getById(roleId);
  if (!role) throw new Error('That role could not be found.');

  const before = await userRepository.getById(userId);
  // Moving a user OUT of every area-scoped role clears their area — it's
  // only meaningful for those roles, and an admin isn't shown an area field
  // for any other role to consciously keep it set.
  if (!isAreaScopedRole(role.name) && before?.area) {
    await userRepository.updateArea(userId, null);
  }
  const user = await userRepository.updateRole(userId, roleId);
  // A station is an Engineer / Requester thing only - see the same note in
  // createUserAction above.
  if (role.name === 'engineer_requester') await ensureStation(user);
  await auditLogRepository.write({
    tableName: 'users',
    recordId: userId,
    action: 'update',
    changedBy: session.id,
    before,
    after: user,
  });
  revalidatePath('/dashboard/users');
}

/**
 * Admin's per-user override of `create_product_labels` - the ONLY per-user
 * permission control in the app (8 September follow-up). `manage_users`
 * gates it, which is Admin-only, so no other role can reach this: a
 * Supervisor / Stores Manager / Stores Clerk cannot change anyone's label
 * permission, including their own. The effective permission is then resolved
 * in ONE place - `hasPermission` in src/lib/permissions.ts - so every nav
 * filter, route guard and (future) action sees the same answer.
 */
export async function updateUserLabelPermissionAction(userId: string, formData: FormData) {
  'use server';
  const session = await requireSession();
  await requirePermission(session, 'manage_users');

  const raw = String(formData.get('labelPermission') ?? '');
  if (!LABEL_PERMISSION_VALUES.includes(raw as LabelPermission)) {
    throw new Error('Choose inherited, allowed or revoked.');
  }
  const value = raw as LabelPermission;

  const before = await userRepository.getById(userId);
  const user = await userRepository.setLabelPermission(userId, value);
  await auditLogRepository.write({
    tableName: 'users',
    recordId: userId,
    action: 'update',
    changedBy: session.id,
    // before/after are the full user rows - the audit log page already
    // diffs them, so the reviewer sees exactly `labelPermission` changing
    // from e.g. "inherited" to "revoked", who did it and when. This is the
    // QR_LABEL_PERMISSION_CHANGED record the spec (§10) asks for; the app's
    // audit model is field-diff-based, not typed-event-based.
    before,
    after: user,
  });
  revalidatePath('/dashboard/users');
  // The label route/nav gate reads this on the next request for the target
  // user - revalidate the surfaces that show or hide on it.
  revalidatePath('/dashboard/labels');
  revalidatePath('/dashboard/products');
}

export async function updateUserAreaAction(userId: string, formData: FormData) {
  'use server';
  const session = await requireSession();
  await requirePermission(session, 'manage_users');

  const area = String(formData.get('area') ?? '').trim() || null;
  if (area && !FACTORY_AREAS.includes(area as (typeof FACTORY_AREAS)[number])) {
    throw new Error('Choose an area from the list.');
  }
  const before = await userRepository.getById(userId);
  const user = await userRepository.updateArea(userId, area);
  await auditLogRepository.write({
    tableName: 'users',
    recordId: userId,
    action: 'update',
    changedBy: session.id,
    before,
    after: user,
  });
  revalidatePath('/dashboard/users');
}
