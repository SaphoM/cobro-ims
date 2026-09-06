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
  /** Create a draft requisition — Stores roles and Engineer/Requester alike.
   *  Deliberately NOT held by Admin, even though Admin holds `'*'` for
   *  everything else — see ADMIN_EXCLUDED_PERMISSIONS below. Requisitioning
   *  is "I need MRO stock from Stores"; Admin's equivalent need is met by
   *  Purchase Orders (`manage_purchase_orders`), a different process against
   *  a different counterparty (a supplier, not Stores). Separate from
   *  `manage_sales_orders` (approve/issue/cancel, Stores-only) so an Engineer can raise a
   *  request without being able to process anyone's, their own included. */
  | 'create_requisitions'
  /** See the Requisitions module and its contents — distinct from
   *  `create_requisitions` (originate one) so Admin can retain management
   *  visibility over requisitions without being able to start one. Held by
   *  every role that touches requisitions at all: both Stores roles,
   *  Engineer/Requester, and Admin. */
  | 'view_requisitions'
  | 'manage_sales_orders'
  | 'manage_invoices'
  | 'manage_suppliers'
  | 'manage_customers'
  | 'manage_pricing'
  /** Create/edit users and change roles — Admin only. See docs/ARCHITECTURE.md §1 (user/role model). */
  | 'manage_users'
  | 'view_reports'
  /** See the full Audit Log page. Admin and both Stores roles hold it; Engineer / Requester
   *  doesn't — they see only their own activity there instead (see the page itself). A
   *  narrower cut than `view_reports` because the audit trail names who changed what, which
   *  is a different sensitivity than an aggregate report. */
  | 'view_audit_log';

/**
 * Four roles, matching Cobro's actual operating structure — not a generic
 * ERP hierarchy. See docs/ARCHITECTURE.md §1 for the full rationale and the
 * migration from the previous (admin/warehouse_clerk/procurement/viewer) set.
 *
 *   admin              — system administration, supplier management, product/category management,
 *                         thresholds, reporting, management visibility. Consolidates what used to
 *                         be separate Procurement and Viewer roles. Multiple Admins are expected
 *                         and fully supported — nothing here or in the user model treats Admin as
 *                         a singleton. Admin is also the ONLY role that can add a product to the
 *                         catalogue or edit a BOM (`manage_catalogue`) — Stores requested/received/
 *                         moves what Admin has already defined, it doesn't define new master data.
 *                         Admin does NOT requisition stock (see `ADMIN_EXCLUDED_PERMISSIONS`
 *                         below) — replenishment is Admin's job via Purchase Orders against a
 *                         supplier; a requisition is an internal request against Stores, and that
 *                         process belongs to Engineer/Requester (and Stores itself). Admin retains
 *                         `view_requisitions` for management oversight of the module.
 *   stores_manager     — the operational store/inventory function: order stock from external
 *                         suppliers (purchase orders), receive, scan in, reserve, process
 *                         requisitions, issue, scan out, transfer. View-only on the product
 *                         catalogue and BOM — see `manage_catalogue` above. Not system
 *                         administration — creating users/Admins stays Admin-only.
 *   stores_clerk       — day-to-day store transactions: the same physical stock actions and
 *                         supplier purchase orders as Stores Manager, minus `request_adjustments`.
 *                         A Clerk must not be able to raise a write-off/adjustment on their own
 *                         authority; that stays Stores Manager and Admin.
 *   engineer_requester — factory-floor staff who request MRO stock on behalf of their section
 *                         (see `area` on User). Can create and track their own requisitions;
 *                         cannot approve, issue, or otherwise touch the inventory ledger.
 */
const ROLE_PERMISSIONS: Record<string, Permission[] | '*'> = {
  admin: '*',
  stores_manager: [
    'manage_purchase_orders',
    'manage_receiving',
    'manage_transfers',
    'request_adjustments',
    'create_requisitions',
    'view_requisitions',
    'manage_sales_orders',
    'view_reports',
    'view_audit_log',
  ],
  stores_clerk: [
    'manage_purchase_orders',
    'manage_receiving',
    'manage_transfers',
    'create_requisitions',
    'view_requisitions',
    'manage_sales_orders',
    'view_reports',
    'view_audit_log',
  ],
  // Deliberately narrow: create_requisitions is the only inventory-adjacent
  // permission this role holds. `view_reports` is granted too, but the
  // Reports page itself cuts what an Engineer sees down to their own
  // requisitions and stock-availability info — see /dashboard/reports.
  engineer_requester: ['create_requisitions', 'view_requisitions', 'view_reports'],
};

/**
 * A confirmed business rule, not a placeholder like the rest of this file's
 * matrix: ADMIN DOES NOT REQUISITION STOCK. Admin's `'*'` above means "every
 * permission that exists, automatically, including ones added later" — the
 * right default for a role whose whole point is broad system access, but
 * wrong for this one specific capability, which belongs to Stores/Engineer
 * by design (a requisition is an internal request against Stores; Admin's
 * equivalent is a Purchase Order against a supplier — see
 * `manage_purchase_orders` and docs/ARCHITECTURE.md). Listing the exclusion
 * here rather than turning Admin's `'*'` into an explicit array keeps every
 * other permission auto-granted to Admin as new ones are added, while this
 * one specific carve-out survives that growth instead of being silently
 * re-granted the next time someone adds a permission to the union above.
 *
 * `hasPermission`/`checkPermission`/`requirePermission` are the single
 * enforcement point the whole app calls through (every Server Action, every
 * route-level page gate, and the sidebar's nav-item filter in
 * src/lib/nav-items.ts) — so this exclusion applies everywhere at once, not
 * just to the two "Requisition" UI entry points on Overview and
 * /dashboard/sales.
 */
const ROLE_EXCLUSIONS: Record<string, Permission[]> = {
  admin: ['create_requisitions'],
};

// Approving an adjustment is the one action in the whole app that posts a
// real WAC-affecting stock movement with no second approver — the single
// most sensitive capability in the matrix, hence the one gated behind MFA.
const PRIVILEGED_PERMISSIONS: Permission[] = ['approve_adjustments'];

export async function hasPermission(user: User, permission: Permission): Promise<boolean> {
  const role = await roleRepository.getById(user.roleId);
  if (!role) return false;
  if (ROLE_EXCLUSIONS[role.name]?.includes(permission)) return false;
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
