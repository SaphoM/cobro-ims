/**
 * RBAC enforcement — RFQ Phase 6. The actual permission matrix below is a
 * reasonable placeholder, NOT a confirmed policy from Cobro — see
 * docs/ARCHITECTURE.md §5.2 (BUSINESS DECISION REQUIRED). What's real here
 * is the enforcement mechanism: every Server Action that mutates state
 * calls `requirePermission` (or `hasPermission` for a soft check) before
 * doing anything, the same way every action already re-checks `getSession()`
 * rather than trusting the page's login redirect.
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
  | 'view_reports';

const ROLE_PERMISSIONS: Record<string, Permission[] | '*'> = {
  admin: '*',
  warehouse_clerk: ['manage_receiving', 'manage_transfers', 'request_adjustments', 'manage_sales_orders', 'view_reports'],
  procurement: ['manage_purchase_orders', 'manage_suppliers', 'manage_receiving', 'view_reports'],
  viewer: ['view_reports'],
};

export async function hasPermission(user: User, permission: Permission): Promise<boolean> {
  const role = await roleRepository.getById(user.roleId);
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role.name];
  if (!perms) return false;
  return perms === '*' || perms.includes(permission);
}

/** Throws if the user lacks the permission — for void Server Actions that already throw on a missing session. */
export async function requirePermission(user: User, permission: Permission): Promise<void> {
  if (!(await hasPermission(user, permission))) {
    const role = await roleRepository.getById(user.roleId);
    throw new Error(`${role?.name ?? 'this role'} does not have permission to do that (needs "${permission}").`);
  }
}
