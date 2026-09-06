import type { Permission } from '@/lib/permissions';

/**
 * The sidebar's single source of truth for which roles see which module.
 *
 * Hiding a nav item is NOT the security boundary — every one of these
 * routes/actions is independently checked server-side (see the page/action
 * itself). This list exists so a user genuinely never sees a link to
 * somewhere their role can't do anything useful, per the RBAC brief: menu
 * visibility, route protection, and action/API authorisation are three
 * separate layers, and this file is only the first.
 *
 * `permission: null` means every signed-in role sees the item (Overview,
 * Product catalogue, Bill of materials, Requisitions, Departments,
 * Dashboards & reports, Security — all either universally relevant or
 * already self-scoped by the page itself). Everything else
 * names the one `Permission` that separates "sees this" from "doesn't" —
 * reusing an existing permission rather than inventing a menu-only flag, so
 * the nav can never drift from what the page/action actually enforces.
 */
export interface NavItem {
  href: string;
  label: string;
  permission: Permission | null;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Overview', permission: null },
  { href: '/dashboard/products', label: 'Product catalogue', permission: null },
  { href: '/dashboard/bom', label: 'Bill of materials', permission: null },
  { href: '/dashboard/purchase-orders', label: 'Purchase orders', permission: 'manage_purchase_orders' },
  { href: '/dashboard/receiving', label: 'Goods receiving', permission: 'manage_receiving' },
  { href: '/dashboard/suppliers', label: 'Suppliers', permission: 'manage_receiving' },
  { href: '/dashboard/transfers', label: 'Transfers', permission: 'manage_transfers' },
  { href: '/dashboard/adjustments', label: 'Write-offs & adjustments', permission: 'request_adjustments' },
  { href: '/dashboard/sales', label: 'Requisitions', permission: 'create_requisitions' },
  { href: '/dashboard/customers', label: 'Departments', permission: null },
  { href: '/dashboard/reports', label: 'Dashboards & reports', permission: 'view_reports' },
  { href: '/dashboard/labels', label: 'Product labels', permission: 'manage_receiving' },
  { href: '/dashboard/audit-log', label: 'Audit log', permission: 'view_audit_log' },
  { href: '/dashboard/security', label: 'Security (2FA)', permission: null },
  { href: '/dashboard/users', label: 'Users', permission: 'manage_users' },
];
