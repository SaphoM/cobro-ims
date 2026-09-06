'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { auditLogRepository, roleRepository, userRepository } from '@/lib/data';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { FACTORY_AREAS } from '@/lib/areas';
import { NEW_USER_DEFAULT_PASSWORD } from '@/lib/demo-credentials';

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

  // Area is only ever meaningful for Engineer / Requester (see User.area).
  // Silently dropped for every other role rather than rejected, so a
  // leftover value from switching the role dropdown client-side doesn't
  // block submission.
  const isEngineer = role.name === 'engineer_requester';
  if (isEngineer && !areaRaw) {
    return { error: 'Area is required for the Engineer / Requester role.', success: null };
  }
  if (isEngineer && !FACTORY_AREAS.includes(areaRaw as (typeof FACTORY_AREAS)[number])) {
    return { error: 'Choose an area from the list.', success: null };
  }
  const area = isEngineer ? areaRaw : null;

  try {
    const user = await userRepository.create({ email, fullName, roleId, area });
    await auditLogRepository.write({
      tableName: 'users',
      recordId: user.id,
      action: 'insert',
      changedBy: session.id,
      after: user,
    });
    revalidatePath('/dashboard/users');
    return {
      error: null,
      success: `${user.fullName} created as ${role.description ?? role.name}. They can sign in with ${
        user.email
      } / ${NEW_USER_DEFAULT_PASSWORD}.`,
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
  // Moving a user OUT of Engineer / Requester clears their area — it's only
  // meaningful for that role, and an admin isn't shown an area field for
  // any other role to consciously keep it set.
  if (role.name !== 'engineer_requester' && before?.area) {
    await userRepository.updateArea(userId, null);
  }
  const user = await userRepository.updateRole(userId, roleId);
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
