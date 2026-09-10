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
  /** Create a draft requisition — Engineer/Requester only. Neither Admin nor
   *  either Stores role holds it, both deliberately: Admin's equivalent need
   *  is met by Purchase Orders (`manage_purchase_orders`) against a
   *  supplier, not a request against Stores; Stores IS the counterparty a
   *  requisition is raised against, so Stores originating one against
   *  itself makes no sense - Stores' own restocking need is also a Purchase
   *  Order, the same path Admin uses. Separate from `manage_sales_orders`
   *  (approve/issue/cancel, Stores-only) so an Engineer can raise a request
   *  without being able to process anyone's, their own included. */
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
  /** Create/print Product Labels and the QR codes on them (/dashboard/labels).
   *  One business permission covering both — the QR is generated as part of
   *  the label, never on its own, so there is nothing to authorise
   *  separately. Role default: Admin, Supervisor, Stores Manager and Stores
   *  Clerk YES; Team Leaders and Engineer / Requester NO. UNLIKE every other
   *  permission this is ALSO overridable per user: `hasPermission` below
   *  consults `User.labelPermission` (inherited/allowed/revoked) so an Admin
   *  can grant it to an individual who wouldn't have it by role, or revoke
   *  it from one who would. It is a print/identify capability only — it
   *  grants NO inventory authority (receiving, issuing, adjusting, pricing,
   *  catalogue edits all stay on their own separate permissions). */
  | 'create_product_labels'
  /** Create/edit users and change roles — Admin only. See docs/ARCHITECTURE.md §1 (user/role model). */
  | 'manage_users'
  | 'view_reports'
  /** See the full Audit Log page. Admin and both Stores roles hold it; Engineer / Requester
   *  doesn't — they see only their own activity there instead (see the page itself). A
   *  narrower cut than `view_reports` because the audit trail names who changed what, which
   *  is a different sensitivity than an aggregate report. */
  | 'view_audit_log';

/**
 * Seven roles, matching Cobro's actual operating structure — not a generic
 * ERP hierarchy. See docs/ARCHITECTURE.md §1 for the full rationale and the
 * migration from the previous (admin/warehouse_clerk/procurement/viewer) set.
 *
 * Two SEPARATE reporting chains, confirmed at the 8 September review:
 *
 *   Management (admin) -> supervisor -> {mechanical,electrical}_team_leader -> engineer_requester
 *   Management (admin) -> stores_manager -> stores_clerk
 *
 * The two chains do not cross: a supervisor is not a stores_manager, a team
 * leader is not a stores_clerk, an engineer is not a stores operator.
 * Inventory-control authority and operational/team authority are distinct.
 * Permission-wise this file only cares about what each role may DO; the
 * "who reports to whom" is org context, carried by the role name + the
 * `area` field on User, not by a permission.
 *
 *   admin                    — system administration, supplier management, product/category
 *                               management, thresholds, reporting, management visibility.
 *                               Consolidates what used to be separate Procurement and Viewer
 *                               roles. Multiple Admins are expected and fully supported — nothing
 *                               here or in the user model treats Admin as a singleton. Admin is
 *                               also the ONLY role that can add a product to the catalogue or
 *                               edit a BOM (`manage_catalogue`) — Stores requested/received/moves
 *                               what Admin has already defined, it doesn't define new master data.
 *                               Admin does NOT requisition stock (see `ADMIN_EXCLUDED_PERMISSIONS`
 *                               below) — replenishment is Admin's job via Purchase Orders against a
 *                               supplier; a requisition is an internal request against Stores, and
 *                               that process belongs to Engineer/Requester (and Stores itself).
 *                               Admin retains `view_requisitions` for management oversight of the
 *                               module.
 *   stores_manager           — the operational store/inventory function: order stock from
 *                               external suppliers (purchase orders), receive, scan in, reserve,
 *                               approve/issue requisitions RAISED BY SOMEONE ELSE, scan out,
 *                               transfer. Does not originate a requisition itself — Stores is who
 *                               a requisition is raised AGAINST, not another requester; Stores'
 *                               own restocking is a Purchase Order, the same path Admin uses (see
 *                               `create_requisitions`). View-only on the product catalogue and BOM
 *                               — see `manage_catalogue` above. Not system administration —
 *                               creating users/Admins stays Admin-only. Also the role responsible
 *                               for INITIATING a return of unused Engineer-held stock back to
 *                               Stores (`manage_transfers`) — see that permission's own comment
 *                               for why this stays Stores-only rather than self-service for an
 *                               Engineer.
 *   stores_clerk              — day-to-day store transactions: the same physical stock actions
 *                               and supplier purchase orders as Stores Manager, minus
 *                               `request_adjustments`. A Clerk must not be able to raise a
 *                               write-off/adjustment on their own authority; that stays Stores
 *                               Manager and Admin. Does not originate a requisition either, same
 *                               reasoning as Stores Manager above.
 *   engineer_requester        — factory-floor staff who request MRO stock on behalf of their
 *                               section (see `area` on User). Can create and track their own
 *                               requisitions; cannot approve, issue, or otherwise touch the
 *                               inventory ledger. Does NOT hold `manage_transfers` — an Engineer
 *                               cannot return their own held stock to Stores unilaterally; see
 *                               that permission's comment.
 *   supervisor               — operational oversight ABOVE the Team Leaders, reporting to
 *                               Management. Sees every team's activity, not one section's - the
 *                               ONE thing that makes it broader than a Team Leader (which is
 *                               `area`-scoped). Same permission set as a Team Leader though:
 *                               `view_requisitions` + `view_reports` only. The 8 September
 *                               review did NOT confirm the Supervisor's requisition-approval
 *                               authority, so it is not granted here - see the extension-point
 *                               note on the team-leader roles below; the same
 *                               `requisition.review/approve/reject`-shaped permission would be
 *                               added to `supervisor` (and/or the team leaders) if Cobro
 *                               confirms it, with no change to the shape of this map. Does NOT
 *                               get purchasing, supplier management, goods receiving, stores
 *                               administration, inventory adjustments, user administration,
 *                               security administration, or product master-data.
 *   mechanical_team_leader    — oversight-only role over the Mechanical section's requisitions
 *   electrical_team_leader    — and stock, added per the 8 September client review. Confirmed by
 *                               that meeting: the role exists. NOT confirmed: whether a Team
 *                               Leader approves/issues their team's requisitions — so neither
 *                               holds `create_requisitions`, `manage_sales_orders`, or any
 *                               Stores/Admin permission. Both hold only `view_requisitions` and
 *                               `view_reports`, scoped to their own `area` (Mechanical/Electrical
 *                               respectively — see /dashboard/sales and /dashboard/reports's
 *                               per-role filtering) rather than the whole business. This is
 *                               deliberately the smallest grant that satisfies "team oversight"
 *                               without inventing an approval authority the meeting never
 *                               confirmed. If Cobro later confirms Team Leader approval, the
 *                               extension point is a new `approve_team_requisitions`-style
 *                               permission (or widening `manage_sales_orders`'s area-scoped
 *                               check) — nothing about the shape of ROLE_PERMISSIONS needs to
 *                               change to add it.
 */
const ROLE_PERMISSIONS: Record<string, Permission[] | '*'> = {
  admin: '*',
  stores_manager: [
    'manage_purchase_orders',
    'manage_receiving',
    'manage_transfers',
    'request_adjustments',
    'view_requisitions',
    'manage_sales_orders',
    'view_reports',
    'view_audit_log',
    'create_product_labels',
  ],
  stores_clerk: [
    'manage_purchase_orders',
    'manage_receiving',
    'manage_transfers',
    'view_requisitions',
    'manage_sales_orders',
    'view_reports',
    'view_audit_log',
    'create_product_labels',
  ],
  // Deliberately narrow: create_requisitions is the only inventory-adjacent
  // permission this role holds. `view_reports` is granted too, but the
  // Reports page itself cuts what an Engineer sees down to their own
  // requisitions and stock-availability info — see /dashboard/reports.
  // No `manage_transfers` - an Engineer cannot self-service a return to
  // Stores; that stays a Stores-initiated transfer (see `manage_transfers`
  // above and docs/ARCHITECTURE.md).
  engineer_requester: ['create_requisitions', 'view_requisitions', 'view_reports'],
  // View-only oversight, deliberately - see the role-list comment above for
  // why this stops well short of approval authority. A Supervisor's grant is
  // identical to a Team Leader's; the difference is purely SCOPE - a
  // Supervisor's `area` is null and the pages below (/dashboard/sales,
  // /dashboard/reports, the Overview) show them EVERY team's data rather
  // than one section's.
  supervisor: ['view_requisitions', 'view_reports', 'create_product_labels'],
  // Both team-leader roles get identical permissions; what differs is the
  // `area` on the user record (Mechanical vs Electrical), which
  // /dashboard/sales and /dashboard/reports use to actually scope what's
  // visible.
  mechanical_team_leader: ['view_requisitions', 'view_reports'],
  electrical_team_leader: ['view_requisitions', 'view_reports'],
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

/**
 * The single authoritative permission check for the whole app — every nav
 * filter, page guard and Server Action goes through this (or `checkPermission`
 * / `requirePermission`, which wrap it). Do not re-derive permission logic
 * anywhere else.
 *
 * For every permission except `create_product_labels` this is a pure
 * role-matrix lookup. `create_product_labels` additionally honours
 * `User.labelPermission` — the one per-user override an Admin can set (see
 * that field's doc comment and /dashboard/users). `revoked` beats a role
 * that would grant it; `allowed` beats a role that wouldn't; `inherited`
 * (the default) falls through to the role.
 */
export async function hasPermission(user: User, permission: Permission): Promise<boolean> {
  const role = await roleRepository.getById(user.roleId);
  if (!role) return false;
  if (ROLE_EXCLUSIONS[role.name]?.includes(permission)) return false;
  const perms = ROLE_PERMISSIONS[role.name];
  if (!perms) return false;
  const grantedByRole = perms === '*' || perms.includes(permission);

  if (permission === 'create_product_labels') {
    if (user.labelPermission === 'allowed') return true;
    if (user.labelPermission === 'revoked') return false;
    // 'inherited' - fall through to the role default.
  }

  return grantedByRole;
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
