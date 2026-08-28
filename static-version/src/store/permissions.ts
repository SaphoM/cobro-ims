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

/**
 * ADMIN IS DELIBERATELY NOT '*'.
 *
 * Admin is an oversight role: it must see everything and initiate nothing.
 * `manage_sales_orders` (requisitions) and `manage_transfers` are therefore
 * withheld from admin on purpose — not an oversight. Admin keeps the
 * catalogue/approval/oversight permissions it needs to administer the system
 * and still reads every page, because reads are not permission-gated.
 *
 * Engineers work at an asset: they requisition from Store, transfer between
 * assets, and return stock. Store fulfils those requests and runs the
 * inbound side (receiving, purchase orders, suppliers).
 */
const ROLE_PERMISSIONS: Record<string, Permission[] | '*'> = {
  admin: [
    'manage_catalogue',
    'manage_suppliers',
    'manage_customers',
    'approve_adjustments',
    'request_adjustments',
    'manage_invoices',
    'view_reports',
    // NO manage_sales_orders, NO manage_transfers — oversight only.
  ],
  engineer: ['manage_sales_orders', 'manage_transfers', 'request_adjustments', 'view_reports'],
  store: [
    'manage_receiving',
    'manage_purchase_orders',
    'manage_suppliers',
    'manage_sales_orders',
    'manage_transfers',
    'request_adjustments',
    'view_reports',
  ],
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
