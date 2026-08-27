/**
 * RBAC enforcement — PORTED from the Next.js app's src/lib/permissions.ts.
 * The matrix, the PRIVILEGED_PERMISSIONS list, and every error string are
 * IDENTICAL to the original. The only change: the original's lookups were
 * `async` because `roleRepository.getById` hit a repository; here `roles` is
 * a local seed constant, so these are plain synchronous functions. Behaviour
 * is unchanged — same allow/deny for the same (user, permission) pair.
 *
 * The matrix itself is a placeholder pending Cobro sign-off (see
 * docs/ARCHITECTURE.md §5.2 in the original repo), NOT confirmed policy.
 *
 * PRIVILEGED_PERMISSIONS additionally require 2FA enrollment
 * (`user.mfaEnrolled`) — the RFQ requires 2FA "for privileged users", and
 * this is the actual gate that enforces it.
 */

import { roles } from '@/store/seed';
import type { User } from '@/store/types';

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

function roleFor(user: User) {
  return roles.find((r) => r.id === user.roleId) ?? null;
}

export function hasPermission(user: User, permission: Permission): boolean {
  const role = roleFor(user);
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
export function checkPermission(user: User, permission: Permission): PermissionCheck {
  if (!hasPermission(user, permission)) {
    const role = roleFor(user);
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
