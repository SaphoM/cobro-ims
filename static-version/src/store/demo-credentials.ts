/**
 * Split out from src/lib/auth.ts on purpose: that file imports `next/headers`
 * (server-only), so anything importing constants from it — including a
 * 'use client' component that just wants to display the demo email/password
 * — would pull the server-only module into the client bundle. This file has
 * no server-only imports and is safe to import from either side.
 *
 * Four accounts, one per RBAC role, so permission enforcement (see
 * src/lib/permissions.ts) is actually testable without a real user
 * directory. The first entry is the "primary" demo account shown by
 * default on the login page.
 */
export interface DemoAccount {
  email: string;
  password: string;
  roleLabel: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'demo@cobroconcrete.co.za', password: 'CobroDemo2026', roleLabel: 'Admin' },
  { email: 'clerk@cobroconcrete.co.za', password: 'CobroClerk2026', roleLabel: 'Warehouse clerk' },
  { email: 'procurement@cobroconcrete.co.za', password: 'CobroProcure2026', roleLabel: 'Procurement' },
  { email: 'viewer@cobroconcrete.co.za', password: 'CobroViewer2026', roleLabel: 'Viewer' },
];

export const DEMO_EMAIL = DEMO_ACCOUNTS[0].email;
export const DEMO_PASSWORD = DEMO_ACCOUNTS[0].password;
