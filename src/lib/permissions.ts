/**
 * RBAC enforcement — RFQ Phase 6. The actual permission matrix below is a
 * reasonable placeholder, NOT a confirmed policy from Cobro — see
 * docs/ARCHITECTURE.md §5.2 (BUSINESS DECISION REQUIRED). What's real here
 * is the enforcement mechanism: every Server Action that mutates state
 * calls `requirePermission` (or `hasPermission` for a soft check) before
 * doing anything, the same way every action already re-checks `getSession()`
 * rather than trusting the page's login redirect.
 *
 * PRIVILEGED_PERMISSIONS additionally require the user to have 2FA enrolled
 * (`user.mfaEnrolled`) — the RFQ requires 2FA "for privileged users", and
 * this is the actual gate that enforces it rather than the requirement
 * being silently skipped because real auth doesn't exist yet. See
 * src/app/dashboard/security for the (mock) enrollment flow.
 */

import { roleRepository } from '@/lib/data';
import type { User } from '@/lib/domain/inventory';

export type Permission =
  | 'manage_catalogue'
  | 'manage_purchase_orders'
  | 'manage_receiving'
  | 'manage_transfers'
  | 'request_adjustments'
  | 'approve_adjustments'
  | 'manage_sales_orders'
  | 'manage_invoices'
  | 'manage_suppliers'
  | 'manage_customers'
  | 'manage_pricing'
  | 'view_reports';

const ROLE_PERMISSIONS: Record<string, Permission[] | '*'> = {
  admin: '*',
  warehouse_clerk: ['manage_receiving', 'manage_transfers', 'request_adjustments', 'manage_sales_orders', 'view_reports'],
  procurement: ['manage_purchase_orders', 'manage_suppliers', 'manage_receiving', 'view_reports'],
  viewer: ['view_reports'],
};

// Approving an adjustment is the one action in the whole app that posts a
// real WAC-affecting stock movement with no second approver — the single
// most sensitive capability in the matrix, hence the one gated behind MFA.
const PRIVILEGED_PERMISSIONS: Permission[] = ['approve_adjustments'];

export async function hasPermission(user: User, permission: Permission): Promise<boolean> {
  const role = await roleRepository.getById(user.roleId);
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role.name];
  if (!perms) return false;
  return perms === '*' || perms.includes(permission);
}

export interface PermissionCheck {
  allowed: boolean;
  reason: string | null;
}

/** The full check — role permission AND, for privileged permissions, MFA enrollment. Never throws. */
export async function checkPermission(user: User, permission: Permission): Promise<PermissionCheck> {
  if (!(await hasPermission(user, permission))) {
    const role = await roleRepository.getById(user.roleId);
    return { allowed: false, reason: `${role?.name ?? 'this role'} does not have permission to do that.` };
  }
  if (PRIVILEGED_PERMISSIONS.includes(permission) && !user.mfaEnrolled) {
    return {
      allowed: false,
      reason: 'This action requires two-factor authentication. Enable 2FA under Security first.',
    };
  }
  return { allowed: true, reason: null };
}

/** Throws if the check fails — for void Server Actions that already throw on a missing session. */
export async function requirePermission(user: User, permission: Permission): Promise<void> {
  const result = await checkPermission(user, permission);
  if (!result.allowed) {
    throw new Error(result.reason ?? 'Permission denied.');
  }
}
